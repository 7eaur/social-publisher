import type { Pool } from "pg";
import type { TelegramHistoryPort } from "./types.ts";
import { classify, validatePage } from "./normalize.ts";
import { withinTransaction } from "../../database/src/pool.ts";

export interface SyncResult { readonly inserted: number; readonly checkpoint: number; }

/** No MTProto session or channel peer is needed in this phase. Both are injected later. */
export async function syncSourcePage(
  pool: Pool, sourceId: string, routeId: string, reader: TelegramHistoryPort, limit = 50
): Promise<SyncResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid page limit");
  // Single-source serialization across API/worker replicas. Claim checkpoint before remote fetch
  // only after acquiring the source row lock; keeps pagination and persistence consistent.
  return withinTransaction(pool, async client => {
    const source = await client.query<{external_peer_id:string;last_indexed_message_id:string|null}>(
      `SELECT s.external_peer_id,s.last_indexed_message_id
       FROM content_sources s JOIN routes r ON r.source_id=s.id
       WHERE s.id=$1::uuid AND r.id=$2::uuid AND s.enabled
       FOR UPDATE OF s`, [sourceId,routeId]
    );
    const row=source.rows[0];
    if (!row) throw new Error("Source/route pair is disabled or unauthorized");
    const checkpoint = Number(row.last_indexed_message_id ?? "0");
    const page = await reader.getPage(row.external_peer_id,checkpoint,limit);
    if (page.completeAlbumBoundary !== true) throw new Error("Incomplete album page");
    validatePage(page.units,checkpoint,page.nextCheckpoint);
    let inserted=0;
    for (const unit of page.units) {
      const mediaMetadata = {
        groupedId:unit.groupedId ?? null,
        members:unit.media.map(m=>({kind:m.kind,messageId:m.telegramMessageId,fileId:m.fileId}))
      };
      const saved=await client.query(
        `INSERT INTO source_items(route_id,source_id,canonical_message_id,telegram_group_id,kind,caption,media_metadata,source_created_at)
         VALUES($1::uuid,$2::uuid,$3::bigint,$4,$5,$6,$7::jsonb,$8)
         ON CONFLICT(source_id,canonical_message_id) DO NOTHING`,
        [routeId,sourceId,unit.canonicalMessageId,unit.groupedId ?? null,classify(unit),unit.caption,JSON.stringify(mediaMetadata),unit.timestamp]
      );
      inserted += saved.rowCount ?? 0;
    }
    await client.query(
      `UPDATE content_sources SET last_indexed_message_id=$2::bigint
       WHERE id=$1::uuid AND coalesce(last_indexed_message_id,0)<=$2::bigint`,
      [sourceId,page.nextCheckpoint]
    );
    return { inserted,checkpoint:page.nextCheckpoint };
  });
}
