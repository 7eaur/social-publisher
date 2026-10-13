import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export interface ClaimedJob {
  readonly id: string;
  readonly dedup_key: string;
  readonly kind: "PUBLISH" | "SYNC" | "SCHEDULE" | "CLEANUP";
  readonly payload: unknown;
  readonly lease_token: string;
  readonly leased_until: Date;
}

/** A durable intent must be created in the same transaction as its business record. */
export async function enqueue(
  client: PoolClient,
  dedupKey: string,
  kind: ClaimedJob["kind"],
  payload: Record<string, unknown>
): Promise<string | null> {
  if (!dedupKey.trim() || dedupKey.length > 512) throw new RangeError("Invalid dedup key");
  if (!["PUBLISH", "SYNC", "SCHEDULE", "CLEANUP"].includes(kind)) throw new RangeError("Invalid job kind");
  const result = await client.query<{ id: string }>(
    `INSERT INTO outbox_jobs(dedup_key,kind,payload)
     VALUES($1,$2,$3::jsonb) ON CONFLICT(dedup_key) DO NOTHING RETURNING id`,
    [dedupKey, kind, JSON.stringify(payload)]
  );
  return result.rows[0]?.id ?? null;
}

/** Atomic work distribution: FOR UPDATE SKIP LOCKED prevents a second worker claiming the same job. */
export async function claimJobs(pool: Pool, limit = 10, leaseSeconds = 90): Promise<ClaimedJob[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Invalid limit");
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
    throw new RangeError("Invalid lease duration");
  }
  const leaseToken = randomUUID();
  const result = await pool.query<ClaimedJob>(
    `WITH picked AS (
       SELECT id FROM outbox_jobs
       WHERE state='PENDING' AND available_at<=now()
       ORDER BY available_at,created_at,id
       FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE outbox_jobs j SET
       state='CLAIMED', lease_token=$2::uuid,
       leased_until=now()+($3::int*interval '1 second'),
       attempts=attempts+1, updated_at=now()
     FROM picked WHERE j.id=picked.id
     RETURNING j.id,j.dedup_key,j.kind,j.payload,j.lease_token,j.leased_until`,
    [limit, leaseToken, leaseSeconds]
  );
  return result.rows;
}

export async function acknowledgeJob(pool: Pool, id: string, leaseToken: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE outbox_jobs
     SET state='COMPLETED',lease_token=NULL,leased_until=NULL,updated_at=now()
     WHERE id=$1::uuid AND lease_token=$2::uuid
       AND state='CLAIMED' AND leased_until>now()`,
    [id, leaseToken]
  );
  return result.rowCount === 1;
}

/**
 * Conservative expiration: never reclaim a possibly submitted external publish.
 * An operator/reconciler must establish the remote result first.
 */
export async function quarantineExpiredClaims(pool: Pool): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await client.query<{kind:string;payload:{publicationId?:string}}>(
        `UPDATE outbox_jobs
         SET state='UNCERTAIN',lease_token=NULL,leased_until=NULL,updated_at=now()
         WHERE state='CLAIMED' AND leased_until<=now()
         RETURNING kind,payload`
      );
      const publications = result.rows.filter(row=>row.kind==="PUBLISH")
        .map(row=>row.payload.publicationId).filter((id):id is string=>typeof id==="string");
      if (publications.length>0) {
        await client.query(
          `UPDATE publication_records SET state='UNCERTAIN',updated_at=now()
           WHERE id=ANY($1::uuid[]) AND state IN ('PENDING','RESERVED','SUBMITTING')`,
          [publications]
        );
      }
      await client.query("COMMIT");
      return result.rowCount ?? 0;
    } catch(error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function createDeliveryIntent(
  client: PoolClient, sourceItemId: string, destinationId: string
): Promise<string | null> {
  // Record ineligible content as a terminal per-destination skip; never queue it.
  const result = await client.query<{ id: string; state: string }>(
    `INSERT INTO publication_records(source_item_id,destination_id,state)
     SELECT si.id,rd.destination_id,
       CASE WHEN si.kind='MIXED_ALBUM'
         OR (d.platform='INSTAGRAM' AND si.kind='TEXT')
         THEN 'SKIPPED_UNSUPPORTED' ELSE 'PENDING' END
     FROM source_items si
     JOIN route_destinations rd ON rd.route_id=si.route_id
     JOIN destinations d ON d.id=rd.destination_id
     WHERE si.id=$1::uuid AND rd.destination_id=$2::uuid
     ON CONFLICT(source_item_id,destination_id) DO NOTHING
     RETURNING id,state`, [sourceItemId,destinationId]
  );
  const publication = result.rows[0];
  if (!publication) return null;
  const publicationId = publication.id;
  if (publication.state === 'SKIPPED_UNSUPPORTED') return publicationId;
  const queued = await enqueue(client, "publication:"+publicationId, "PUBLISH", { publicationId });
  if (!queued) throw new Error("Publication outbox invariant violated");
  return publicationId;
}
