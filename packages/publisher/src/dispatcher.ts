import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {DefinitiveRemoteRejection} from "../../meta/src/graph.ts";
import {withinTransaction} from "../../database/src/pool.ts";

export interface PublishContext {
 readonly publicationId:string;
 readonly sourceItemId:string;
 readonly destinationId:string;
 readonly platform:"FACEBOOK"|"INSTAGRAM";
 readonly accountId:string;
 readonly kind:"TEXT"|"IMAGE"|"VIDEO"|"IMAGE_ALBUM"|"VIDEO_ALBUM"|"MIXED_ALBUM";
 readonly caption:string|null;
}
/** A separate adapter handles token lookup and media preparation. */
export interface OutboundPublisher {
 publish(prepared:PublishContext):Promise<{remoteId:string;remoteUrl?:string}>;
}
interface Picked {
 id:string;lease_token:string;publication_id:string;
}
async function claimOne(pool:Pool):Promise<Picked|null>{
 const token=randomUUID();
 const result=await pool.query<Picked>(
   `WITH candidate AS (
      SELECT oj.id
      FROM outbox_jobs oj
      JOIN publication_records pr ON pr.id=(oj.payload->>'publicationId')::uuid
      JOIN source_items si ON si.id=pr.source_item_id
      JOIN routes r ON r.id=si.route_id
      JOIN content_sources cs ON cs.id=r.source_id
      JOIN destinations d ON d.id=pr.destination_id
      WHERE oj.kind='PUBLISH' AND oj.state='PENDING' AND oj.available_at<=now()
        AND pr.state='PENDING' AND r.enabled=true AND cs.enabled=true
        AND d.enabled=true AND d.credentials_ciphertext IS NOT NULL
      ORDER BY oj.available_at,oj.created_at
      FOR UPDATE OF oj SKIP LOCKED LIMIT 1
    )
    UPDATE outbox_jobs job
    SET state='CLAIMED',lease_token=$1::uuid,leased_until=now()+interval '90 seconds',
      attempts=attempts+1,updated_at=now()
    FROM candidate c WHERE job.id=c.id
    RETURNING job.id,job.lease_token,(job.payload->>'publicationId') AS publication_id`,
   [token]
 );
 return result.rows[0]??null;
}
async function prepareClaim(pool:Pool,job:Picked):Promise<PublishContext|null>{
 return withinTransaction(pool,async client=>{
   const lease=await client.query(
     "SELECT id FROM outbox_jobs WHERE id=$1 AND lease_token=$2 AND state='CLAIMED' AND leased_until>now() FOR UPDATE",
     [job.id,job.lease_token]
   );
   if(!lease.rows[0])return null;
   const pub=await client.query<PublishContext>(
     `SELECT pr.id AS "publicationId",si.id AS "sourceItemId",
       d.id AS "destinationId",d.platform AS platform,d.external_account_id AS "accountId",
       si.kind,si.caption
       FROM publication_records pr
       JOIN source_items si ON si.id=pr.source_item_id
       JOIN destinations d ON d.id=pr.destination_id
       WHERE pr.id=$1 AND pr.state='PENDING' FOR UPDATE OF pr`,
     [job.publication_id]
   );
   const ctx=pub.rows[0];
   if(!ctx)throw new Error("Publication cannot be prepared for claimed job");
   const update=await client.query(
     "UPDATE publication_records SET state='SUBMITTING',dispatched_at=now(),attempt_count=attempt_count+1,updated_at=now() WHERE id=$1 AND state='PENDING'",
     [job.publication_id]
   );
   if(update.rowCount!==1)throw new Error("Failed to set SUBMITTING state");
   return ctx;
 });
}
async function finalize(
 pool:Pool,job:Picked,state:"CONFIRMED"|"PERMANENT_FAILURE"|"UNCERTAIN",
 details?:{remoteId?:string;remoteUrl?:string;code?:string}
):Promise<void>{
 await withinTransaction(pool,async client=>{
   const claim=await client.query(
     "SELECT id FROM outbox_jobs WHERE id=$1 AND lease_token=$2 AND state='CLAIMED' AND leased_until>now() FOR UPDATE",
     [job.id,job.lease_token]
   );
   if(!claim.rows[0])throw new Error("Publisher lease lost; result needs reconciliation");
   const pub=await client.query(
     `UPDATE publication_records SET state=$2,remote_id=$3,remote_url=$4,last_error_code=$5,
        confirmed_at=CASE WHEN $2='CONFIRMED' THEN now() ELSE confirmed_at END,
        updated_at=now()
       WHERE id=$1 AND state='SUBMITTING'`,
     [job.publication_id,state,details?.remoteId??null,details?.remoteUrl??null,details?.code??null]
   );
   if(pub.rowCount!==1)throw new Error("Publication state changed while publishing");
   const outbox=await client.query(
     `UPDATE outbox_jobs SET state=$3,lease_token=NULL,leased_until=NULL,updated_at=now()
      WHERE id=$1 AND lease_token=$2`,
     [job.id,job.lease_token,state==="UNCERTAIN"?"UNCERTAIN":"COMPLETED"]
   );
   if(outbox.rowCount!==1)throw new Error("Could not atomically finalize job");
 });
}

/**
 * A deliberate activation flag must be supplied by the production entrypoint.
 * A timeout/unknown response is quarantined; NEVER automatically resent.
 */
export async function dispatchNextPublication(
 pool:Pool,adapter:OutboundPublisher,allowLive:boolean
):Promise<"DISABLED"|"IDLE"|"CONFIRMED"|"PERMANENT_FAILURE"|"UNCERTAIN">{
 if(!allowLive)return "DISABLED";
 const job=await claimOne(pool);
 if(!job)return "IDLE";
 const ctx=await prepareClaim(pool,job);
 if(!ctx)return "IDLE";
 let result:{remoteId:string;remoteUrl?:string};
 try{
   result=await adapter.publish(ctx);
 }catch(error){
   const isDefinitive=error instanceof DefinitiveRemoteRejection && error.status>=400 && error.status<500;
   const status=isDefinitive?"PERMANENT_FAILURE":"UNCERTAIN";
   await finalize(pool,job,status,{code:isDefinitive?"REMOTE_REJECTED":"REMOTE_OUTCOME_UNKNOWN"});
   return status;
 }
 if(!result.remoteId || !result.remoteId.trim()){
   await finalize(pool,job,"UNCERTAIN",{code:"INVALID_REMOTE_ACK"});
   return "UNCERTAIN";
 }
 // A DB error during finalization is NOT evidence of remote failure. Let the
 // claim expire into UNCERTAIN; never issue another remote call automatically.
 await finalize(pool,job,"CONFIRMED",result);
 return "CONFIRMED";
}
