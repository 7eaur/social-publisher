import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token,"utf8").digest("hex");
}

export interface SessionCreation {
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
}

export async function createSession(pool: Pool, userId: string): Promise<SessionCreation> {
  const sessionToken = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const inserted = await pool.query(
    `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at)
     SELECT id,$2,$3,$4 FROM users WHERE id=$1::uuid AND enabled=true RETURNING id`,
    [userId,hashOpaqueToken(sessionToken),hashOpaqueToken(csrfToken),expiresAt]
  );
  if (inserted.rowCount !== 1) throw new Error("Session user not found or disabled");
  return { sessionToken,csrfToken,expiresAt };
}

export interface SessionIdentity {
  readonly userId: string;
  readonly email: string;
  readonly role: "ADMIN" | "OPERATOR" | "VIEWER";
  readonly csrfHash: string;
}

export async function findSession(pool: Pool, sessionToken: string): Promise<SessionIdentity | null> {
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  const result = await pool.query<{
    user_id: string; email: string; role: SessionIdentity["role"]; csrf_hash: string
  }>(
    `SELECT s.user_id,u.email,u.role,s.csrf_hash
     FROM auth_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.enabled=true`,
    [hashOpaqueToken(sessionToken)]
  );
  const entry = result.rows[0];
  return entry ? {userId:entry.user_id,email:entry.email,role:entry.role,csrfHash:entry.csrf_hash} : null;
}

export function verifyCsrf(secret: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(secret) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(Buffer.from(hashOpaqueToken(secret),"hex"),Buffer.from(expectedHash,"hex"));
}

export async function revokeSession(pool: Pool, sessionToken: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) return false;
  const result = await pool.query(
    "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",
    [hashOpaqueToken(sessionToken)]
  );
  return result.rowCount === 1;
}
