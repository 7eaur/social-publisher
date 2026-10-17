import type { Pool } from "pg";
import { withinTransaction } from "./pool.ts";

export interface ScheduleClaim {
  readonly id: string;
  readonly route_id: string;
  readonly source_item_id: string;
  readonly local_date: string;
  readonly slot: string;
}

/**
 * Atomically enforces daily quota and one-item-per-route across workers.
 * Route-level row lock serializes the daily COUNT plus INSERT.
 * Time zone, weekday and slot eligibility must be validated by the scheduler
 * before invoking this operation (Phase 04).
 */
export async function reserveScheduleSlot(
  pool: Pool, routeId: string, sourceItemId: string, localDate: string, slot: string
): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new RangeError("Invalid local date");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot)) throw new RangeError("Invalid slot");
  return withinTransaction(pool, async client => {
    const route = await client.query<{ id: string }>(
      "SELECT id FROM routes WHERE id=$1::uuid AND enabled=true FOR UPDATE", [routeId]
    );
    if (!route.rows[0]) return null;
    const schedule = await client.query<{ daily_limit: number }>(
      "SELECT daily_limit FROM schedule_rules WHERE route_id=$1::uuid AND enabled=true", [routeId]
    );
    if (!schedule.rows[0]) return null;
    const count = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM schedule_claims WHERE route_id=$1::uuid AND local_date=$2::date",
      [routeId, localDate]
    );
    if (Number(count.rows[0]?.count ?? "0") >= schedule.rows[0].daily_limit) return null;
    const created = await client.query<{ id: string }>(
      `INSERT INTO schedule_claims(route_id,source_item_id,local_date,slot)
       SELECT $1::uuid,$2::uuid,$3::date,$4 FROM source_items si
       WHERE si.id=$2::uuid AND si.route_id=$1::uuid
       ON CONFLICT DO NOTHING RETURNING id`,
      [routeId, sourceItemId, localDate, slot]
    );
    return created.rows[0]?.id ?? null;
  });
}
