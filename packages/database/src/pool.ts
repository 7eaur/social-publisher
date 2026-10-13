import { Pool } from "pg";
import type { PoolClient } from "pg";

export function createDatabasePool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error("DATABASE_URL is required");
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (process.env.NODE_ENV === "production" && parsed.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("Production DATABASE_URL must include sslmode=verify-full");
  }
  return new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 15000,
    statement_timeout: 10000
  });
}

export async function withinTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
