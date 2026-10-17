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
