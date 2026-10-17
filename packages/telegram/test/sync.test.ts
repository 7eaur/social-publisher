import test, {before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabasePool} from "../../database/src/pool.ts";
import {migrate} from "../../database/src/migrate.ts";
import {syncSourcePage} from "../src/sync.ts";
import type {TelegramHistoryPort,TelegramPage} from "../src/types.ts";

if(!process.env.DATABASE_URL || process.env.NODE_ENV!=="test" ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) {
 throw new Error("Telegram ingestion tests require a disposable *_test PostgreSQL DB");
}
const pool=createDatabasePool();
let sourceId:string,routeId:string;
const page:TelegramPage={
  completeAlbumBoundary:true,nextCheckpoint:3,
  units:[{canonicalMessageId:1,highestMessageId:3,groupedId:"demo-album",caption:"Preserve exactly",
    timestamp:new Date("2026-10-17T10:00:00Z"),
    media:[{kind:"IMAGE",telegramMessageId:1,fileId:"test-photo"},
           {kind:"VIDEO",telegramMessageId:3,fileId:"test-video"}]}]
};
const reader:TelegramHistoryPort={
 async getPage(_peer, after) {
   return after >= 3 ? {units:[],nextCheckpoint:after,completeAlbumBoundary:true} : page;
 }
};

before(async()=>{
 await migrate(pool);
 const source=await pool.query<{id:string}>(
  "INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'Test Source') RETURNING id",
  ["synthetic-"+randomUUID()]
 );
 sourceId=source.rows[0]!.id;
 const route=await pool.query<{id:string}>(
  "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,true) RETURNING id",
  ["synthetic-"+randomUUID().slice(0,8),sourceId]
 );
 routeId=route.rows[0]!.id;
});
after(async()=>{await pool.end()});

test("concurrent scans create only one canonical album and monotonically advance checkpoint",async()=>{
 const results=await Promise.all([
  syncSourcePage(pool,sourceId,routeId,reader),
  syncSourcePage(pool,sourceId,routeId,reader)
 ]);
 assert.equal(results.reduce((n,r)=>n+r.inserted,0),1);
 const items=await pool.query<{kind:string;caption:string;canonical_message_id:string}>(
  "SELECT kind,caption,canonical_message_id FROM source_items WHERE source_id=$1",[sourceId]);
 assert.equal(items.rowCount,1);
 assert.equal(items.rows[0]?.kind,"MIXED_ALBUM");
 assert.equal(items.rows[0]?.caption,"Preserve exactly");
 const c=await pool.query<{last_indexed_message_id:string}>(
  "SELECT last_indexed_message_id FROM content_sources WHERE id=$1",[sourceId]);
 assert.equal(c.rows[0]?.last_indexed_message_id,"3");
 const next=await syncSourcePage(pool,sourceId,routeId,reader);
 assert.equal(next.inserted,0);
 assert.equal(next.checkpoint,3);
});

test("route ownership blocks cross-route source ingestion",async()=>{
 const r=await pool.query<{id:string}>(
  "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,true) RETURNING id",
  ["other-"+randomUUID().slice(0,8),
   (await pool.query<{id:string}>("INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'Different Source') RETURNING id",["other-"+randomUUID()])).rows[0]!.id]
 );
 await assert.rejects(syncSourcePage(pool,sourceId,r.rows[0]!.id,reader));
});

test("incomplete albums are rejected without checkpoint progression",async()=>{
 const old=await pool.query<{last_indexed_message_id:string}>(
  "SELECT last_indexed_message_id FROM content_sources WHERE id=$1",[sourceId]);
 const invalid:TelegramHistoryPort={async getPage(){return {units:[],nextCheckpoint:10,completeAlbumBoundary:false}}};
 await assert.rejects(syncSourcePage(pool,sourceId,routeId,invalid));
 const updated=await pool.query<{last_indexed_message_id:string}>(
  "SELECT last_indexed_message_id FROM content_sources WHERE id=$1",[sourceId]);
 assert.equal(updated.rows[0]?.last_indexed_message_id,old.rows[0]?.last_indexed_message_id);
});
