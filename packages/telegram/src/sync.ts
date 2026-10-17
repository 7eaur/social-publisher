import type { Pool } from "pg";
import type { TelegramHistoryPort } from "./port.ts";
import { validateHistoryPage } from "./port.ts";
import { withinTransaction } from "../../database/src/pool.ts";
export interface SyncResult {readonly processed:number;readonly checkpoint:number;readonly sourceId:string;}
/** Sync ONE bounded page. Durable checkpoint is advanced only after the entire batch commits. */
export async function syncTelegramSource(
 pool:Pool, sourceId:string, port:TelegramHistoryPort, limit=100
):Promise<SyncResult>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError("Invalid page size");
 const snap=await pool.query<{external_peer_id:string;last_indexed_message_id:string|null}>(
   "SELECT external_peer_id,last_indexed_message_id::text FROM content_sources WHERE id=$1::uuid AND enabled=true",[sourceId]
 );
 const source=snap.rows[0];
 if(!source)throw new Error("Source unavailable or not configured");
 const old=Number(source.last_indexed_message_id??0);
 if(!Number.isSafeInteger(old))throw new Error("Telegram checkpoint out of safe integer range");
 const page=await port.fetchAfter(source.external_peer_id,old,limit);
 validateHistoryPage(page,old,limit);
 if(page.length===0)return {processed:0,checkpoint:old,sourceId};
 return withinTransaction(pool,async client=>{
   const locked=await client.query<{last_indexed_message_id:string|null}>(
     "SELECT last_indexed_message_id::text FROM content_sources WHERE id=$1::uuid AND enabled=true FOR UPDATE",[sourceId]
   );
   const current=Number(locked.rows[0]?.last_indexed_message_id??0);
   if(current!==old)throw new Error("Checkpoint changed during Telegram fetch; restart from newest checkpoint");
   const route=await client.query<{id:string}>(
     "SELECT id FROM routes WHERE source_id=$1::uuid",[sourceId]
   );
   // Installation requires exactly one route for each source.
   if(route.rows.length!==1)throw new Error("Source must have exactly one route");
   for(const message of page){
     const existing=await client.query<{id:string}>(
       `SELECT id FROM source_items
        WHERE source_id=$1 AND telegram_group_id=$2 AND $2 IS NOT NULL
        FOR UPDATE`,[sourceId,message.groupId]
     );
     let itemId=existing.rows[0]?.id;
     if(!itemId){
       const insert=await client.query<{id:string}>(
         `INSERT INTO source_items
          (source_id,route_id,canonical_message_id,telegram_group_id,kind,caption,source_created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(source_id,canonical_message_id) DO NOTHING RETURNING id`,
         [sourceId,route.rows[0]!.id,message.id,message.groupId,message.kind,
          message.text.trim()?message.text:null,message.sentAt]
       );
       itemId=insert.rows[0]?.id;
       if(!itemId){
         const found=await client.query<{id:string}>(
           "SELECT id FROM source_items WHERE source_id=$1 AND canonical_message_id=$2",
           [sourceId,message.id]
         );
         itemId=found.rows[0]?.id;
       }
       if(!itemId)throw new Error("Unable to resolve canonical item");
     }
     await client.query(
       `INSERT INTO source_message_parts
        (source_id,telegram_message_id,source_item_id,content_kind,caption,sent_at)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(source_id,telegram_message_id) DO NOTHING`,
       [sourceId,message.id,itemId,message.kind,message.text||null,message.sentAt]
     );
     // Recalculate classification after every batch, including split albums.
     await client.query(
       `UPDATE source_items SET
         kind=CASE WHEN (SELECT count(*) FROM source_message_parts WHERE source_item_id=$1)=1
            THEN (SELECT content_kind FROM source_message_parts WHERE source_item_id=$1 LIMIT 1)
           WHEN (SELECT count(*) FROM source_message_parts WHERE source_item_id=$1 AND content_kind='IMAGE')>0
            AND (SELECT count(*) FROM source_message_parts WHERE source_item_id=$1 AND content_kind='VIDEO')>0 THEN 'MIXED_ALBUM'
           WHEN (SELECT count(*) FROM source_message_parts WHERE source_item_id=$1 AND content_kind='IMAGE')>0 THEN 'IMAGE_ALBUM'
           WHEN (SELECT count(*) FROM source_message_parts WHERE source_item_id=$1 AND content_kind='VIDEO')>0 THEN 'VIDEO_ALBUM'
           ELSE 'TEXT' END,
         caption=(SELECT caption FROM source_message_parts
           WHERE source_item_id=$1 AND caption IS NOT NULL AND length(trim(caption))>0
           ORDER BY telegram_message_id LIMIT 1),
         media_metadata=jsonb_build_object('messageIds',(
           SELECT coalesce(jsonb_agg(telegram_message_id ORDER BY telegram_message_id),'[]'::jsonb)
           FROM source_message_parts WHERE source_item_id=$1
         ))
       WHERE id=$1`,[itemId]
     );
   }
   const checkpoint=page[page.length-1]!.id;
   await client.query(
     "UPDATE content_sources SET last_indexed_message_id=$2 WHERE id=$1",
     [sourceId,checkpoint]
   );
   return {processed:page.length,checkpoint,sourceId};
 });
}
