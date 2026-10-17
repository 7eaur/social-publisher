import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabasePool} from "../../database/src/pool.ts";
import {migrate} from "../../database/src/migrate.ts";
import {syncTelegramSource} from "../src/sync.ts";
import type {TelegramHistoryPort} from "../src/port.ts";
import type {TelegramMessage} from "../src/messages.ts";

if(!process.env.DATABASE_URL || process.env.NODE_ENV!=="test" ||
   !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")){
  throw new Error("Telegram integration tests require isolated PostgreSQL test database");
}
const pool=createDatabasePool();
let sourceId:string;let routeId:string;let peerId:string;
const when=new Date("2026-10-17T12:00:00Z");
const msgs:TelegramMessage[]=[
 {id:1,kind:"TEXT",text:"First",groupId:null,sentAt:when},
 {id:2,kind:"IMAGE",text:"Photo caption",groupId:"G9",sentAt:when},
 {id:3,kind:"VIDEO",text:"",groupId:"G9",sentAt:when},
 {id:4,kind:"TEXT",text:"Last",groupId:null,sentAt:when}
];
const history:TelegramHistoryPort={
 async fetchAfter(peer,after,limit){
   assert.equal(peer,peerId);
   return msgs.filter(m=>m.id>after).slice(0,limit);
 }
};
before(async()=>{
 await migrate(pool);
 peerId="private-peer-"+randomUUID();
 const row=await pool.query<{id:string}>(
   "INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'Mock channel') RETURNING id",[peerId]
 );
 sourceId=row.rows[0]!.id;
 const route=await pool.query<{id:string}>(
   "INSERT INTO routes(slug,source_id) VALUES($1,$2) RETURNING id",["tg-"+randomUUID().slice(0,8),sourceId]
 );
 routeId=route.rows[0]!.id;
});
after(async()=>{await pool.end();});
test("sync source incrementally and reconstruct album across page boundaries",async()=>{
 const a=await syncTelegramSource(pool,sourceId,history,2);
 assert.equal(a.checkpoint,2);
 assert.equal(a.processed,2);
 const b=await syncTelegramSource(pool,sourceId,history,2);
 assert.equal(b.checkpoint,4);
 assert.equal((await syncTelegramSource(pool,sourceId,history,2)).processed,0);
 const items=await pool.query<{kind:string;caption:string|null;media_metadata:{messageIds:number[]}}>(
   "SELECT kind,caption,media_metadata FROM source_items WHERE route_id=$1 ORDER BY canonical_message_id",[routeId]
 );
 assert.equal(items.rows.length,3);
 assert.equal(items.rows[1]?.kind,"MIXED_ALBUM");
 assert.equal(items.rows[1]?.caption,"Photo caption");
 assert.deepEqual(items.rows[1]?.media_metadata.messageIds,[2,3]);
 const parts=await pool.query<{n:number}>(
   "SELECT count(*)::int AS n FROM source_message_parts WHERE source_id=$1",[sourceId]
 );
 assert.equal(parts.rows[0]?.n,4);
 const state=await pool.query<{last_indexed_message_id:string}>(
   "SELECT last_indexed_message_id::text FROM content_sources WHERE id=$1",[sourceId]
 );
 assert.equal(state.rows[0]?.last_indexed_message_id,"4");
});
test("invalid out-of-order history does not advance checkpoint",async()=>{
 const invalid:TelegramHistoryPort={async fetchAfter(){return [{id:4,kind:"TEXT",text:"",sentAt:when,groupId:null}]}};
 await assert.rejects(syncTelegramSource(pool,sourceId,invalid,2),/strictly ascending/);
 const row=await pool.query<{checkpoint:string}>(
   "SELECT last_indexed_message_id::text AS checkpoint FROM content_sources WHERE id=$1",[sourceId]
 );
 assert.equal(row.rows[0]?.checkpoint,"4");
});

test("account-free end-to-end simulation: Telegram -> schedule -> per-platform delivery",async()=>{
 const {scheduleDueRoutes}=await import("../../database/src/schedule-engine.ts");
 const {dispatchNextPublication}=await import("../../publisher/src/dispatcher.ts");
 const destinationIds:string[]=[];
 for(const platform of ["FACEBOOK","INSTAGRAM"] as const){
   const d=await pool.query<{id:string}>(
     `INSERT INTO destinations(platform,external_account_id,display_name,enabled,
       credentials_ciphertext,credentials_iv,credentials_tag,credentials_version)
      VALUES($1,$2,'Test account',true,decode('0102','hex'),
        decode('010203040506070809101112','hex'),
        decode('01020304050607080910111213141516','hex'),1) RETURNING id`,
     [platform,randomUUID().replaceAll("-","")]
   );
   destinationIds.push(d.rows[0]!.id);
   await pool.query("INSERT INTO route_destinations(route_id,destination_id) VALUES($1,$2)",
     [routeId,d.rows[0]!.id]
   );
 }
 await pool.query(
   `INSERT INTO schedule_rules(route_id,time_zone,iso_weekdays,slots,daily_limit,enabled)
    VALUES($1,'Asia/Aden',ARRAY[1,2,3,4,5,6,7],ARRAY['09:00'],1,true)`,[routeId]
 );
 await pool.query(
   "UPDATE source_message_parts SET indexed_at=now()-interval '20 minutes' WHERE source_id=$1",[sourceId]
 );
 await pool.query("UPDATE routes SET enabled=true WHERE id=$1",[routeId]);
 const slot=new Date("2026-10-19T06:00:00Z");
 const first=await scheduleDueRoutes(pool,slot);
 assert.equal(first.claimed,1);
 assert.equal((await scheduleDueRoutes(pool,slot)).claimed,0);
 const records=await pool.query<{platform:string;state:string}>(
   `SELECT d.platform,pr.state FROM publication_records pr
    JOIN destinations d ON d.id=pr.destination_id
    JOIN source_items si ON si.id=pr.source_item_id WHERE si.route_id=$1
    ORDER BY d.platform`,[routeId]
 );
 assert.deepEqual(records.rows.map(r=>[r.platform,r.state]),[
   ["FACEBOOK","PENDING"],["INSTAGRAM","SKIPPED_UNSUPPORTED"]
 ]);
 const dispatched=await dispatchNextPublication(pool,{
   async publish(ctx){
     assert.equal(ctx.platform,"FACEBOOK");
     assert.equal(ctx.kind,"TEXT");
     return {remoteId:"9990001"};
   }
 },true);
 assert.equal(dispatched,"CONFIRMED");
 const confirmed=await pool.query<{state:string}>(
   `SELECT state FROM publication_records WHERE destination_id=$1`,[destinationIds[0]]
 );
 assert.equal(confirmed.rows[0]?.state,"CONFIRMED");
});
