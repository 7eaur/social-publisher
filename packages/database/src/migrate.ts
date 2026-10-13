import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Pool } from "pg";
import { createDatabasePool } from "./pool.ts";

const migrationDir = fileURLToPath(new URL("../migrations/", import.meta.url));
const filenamePattern = /^\d{4}_[a-z][a-z0-9_]*\.sql$/;

export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      // Serialized schema migrations across concurrent processes.
      await client.query("SELECT pg_advisory_xact_lock(926101)");
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const files = (await readdir(migrationDir)).filter(name => filenamePattern.test(name)).sort();
      const applied: string[] = [];
      for (const file of files) {
        const sql = await readFile(path.join(migrationDir, file), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const present = await client.query<{ sha256: string }>(
          "SELECT sha256 FROM schema_migrations WHERE filename=$1", [file]
        );
        if (present.rows[0]) {
          if (present.rows[0].sha256 !== checksum) throw new Error("Migration checksum changed: " + file);
          continue;
        }
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename,sha256) VALUES ($1,$2)", [file, checksum]);
        applied.push(file);
      }
      await client.query("COMMIT");
      return applied;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createDatabasePool();
  migrate(pool)
    .then(applied => console.info("Applied migrations:", applied.join(", ") || "none"))
    .catch(error => { console.error("Database migration failed:", error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
