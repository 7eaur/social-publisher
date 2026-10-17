import { createHmac } from "node:crypto";
import type { Pool } from "pg";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

/** Use an HMAC pepper so rate-limit DB keys never reveal raw addresses. */
export function loginThrottleKey(email: string, pepper: string): string {
  if (pepper.length < 32) throw new RangeError("LOGIN_THROTTLE_PEPPER must have at least 32 chars");
  return createHmac("sha256",pepper).update(email.trim().toLowerCase()).digest("hex");
}

export async function loginBlocked(pool: Pool, key: string): Promise<boolean> {
  const result = await pool.query<{ blocked: boolean }>(
    "SELECT coalesce(blocked_until>now(),false) AS blocked FROM login_rate_limits WHERE key_hash=$1",
    [key]
  );
  return result.rows[0]?.blocked ?? false;
}

export async function recordLoginFailure(pool: Pool, key: string): Promise<void> {
  await pool.query(
    `INSERT INTO login_rate_limits(key_hash,failures,window_started,blocked_until)
     VALUES($1,1,now(),NULL)
     ON CONFLICT(key_hash) DO UPDATE SET
     failures=CASE WHEN login_rate_limits.window_started<now()-interval '15 minutes'
       THEN 1 ELSE login_rate_limits.failures+1 END,
     window_started=CASE WHEN login_rate_limits.window_started<now()-interval '15 minutes'
       THEN now() ELSE login_rate_limits.window_started END,
     blocked_until=CASE WHEN login_rate_limits.window_started<now()-interval '15 minutes'
       THEN NULL WHEN login_rate_limits.failures+1 >= $2 THEN now()+interval '15 minutes'
       ELSE login_rate_limits.blocked_until END`,
    [key,MAX_FAILURES]
  );
}

export async function clearLoginFailures(pool: Pool, key: string): Promise<void> {
  await pool.query("DELETE FROM login_rate_limits WHERE key_hash=$1",[key]);
}
