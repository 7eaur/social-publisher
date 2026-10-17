import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {boundedMediaStream,validateMediaLimit,type MediaLimit} from "./stream.ts";

/** The object-storage connector will be configured when live account setup begins. */
export interface TemporaryObjectStore {
 put(key:string,body:AsyncIterable<Uint8Array>,mime:string):Promise<void>;
 remove(key:string):Promise<void>;
}

export async function stageTemporaryMedia(
 pool:Pool,store:TemporaryObjectStore,sourceItemId:string,
 stream:AsyncIterable<Uint8Array>,limit:MediaLimit,ttlHours=24
):Promise<string>{
 validateMediaLimit(limit);
 if(!Number.isSafeInteger(ttlHours)||ttlHours<1||ttlHours>168){
   throw new RangeError("Invalid retention time");
 }
 const key="staging/"+randomUUID();
 const result=await pool.query<{id:string}>(
   `INSERT INTO temporary_media(source_item_id,storage_key,expires_at,state)
    VALUES($1::uuid,$2,now()+($3::integer *interval '1 hour'),'STAGED') RETURNING id`,
   [sourceItemId,key,ttlHours]
 );
 const id=result.rows[0]?.id;if(!id)throw new Error("Unable to register media");
 try{
   await store.put(key,boundedMediaStream(stream,limit),limit.mime);
 }catch(error){
   // Keep a tracked row if storage deletion fails, so GC can retry later.
   try{
     await store.remove(key);
     await pool.query("DELETE FROM temporary_media WHERE id=$1",[id]);
   }catch { /* Later GC handles incomplete objects. */ }
   throw error;
 }
 return id;
}

/** Candidate deletion requires expiry AND no unfinished / uncertain delivery. */
export async function removeExpiredMedia(
 pool:Pool,store:TemporaryObjectStore,max=10
):Promise<number>{
 if(!Number.isSafeInteger(max)||max<1||max>20)throw new RangeError("Invalid cleanup batch");
 const client=await pool.connect();
 try{
   await client.query("BEGIN");
   try{
     const rows=await client.query<{id:string;storage_key:string}>(
       `SELECT tm.id,tm.storage_key
        FROM temporary_media tm
        WHERE tm.state IN ('STAGED','LEASED','EXPIRED')
          AND tm.expires_at<=now()
          AND NOT EXISTS (
            SELECT 1 FROM publication_records pr
            WHERE pr.source_item_id=tm.source_item_id
              AND pr.state IN ('PENDING','RESERVED','SUBMITTING','RETRYABLE_FAILURE','UNCERTAIN')
          )
        ORDER BY tm.expires_at,tm.id
        FOR UPDATE OF tm SKIP LOCKED LIMIT $1`,[max]
     );
     for(const row of rows.rows){
       // The adapter must perform a bounded, idempotent remove operation.
       await store.remove(row.storage_key);
       await client.query("UPDATE temporary_media SET state='DELETED',deleted_at=now() WHERE id=$1",[row.id]);
     }
     await client.query("COMMIT");
     return rows.rows.length;
   }catch(error){await client.query("ROLLBACK");throw error;}
 }finally{client.release();}
}
