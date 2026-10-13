import { createDatabasePool, withinTransaction } from "../../../packages/database/src/pool.ts";
import { hashPassword } from "../../../packages/security/src/password.ts";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required as environment variables");
}
const pool = createDatabasePool();
try {
  const passwordHash = await hashPassword(password);
  const created = await withinTransaction(pool, async client => {
    const result = await client.query<{id:string}>(
      "INSERT INTO users(email,password_hash,role,enabled) VALUES($1,$2,'ADMIN',true) ON CONFLICT(email) DO NOTHING RETURNING id",
      [email,passwordHash]
    );
    if (result.rows[0]) await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'USER_BOOTSTRAP','USER',$2)",
      [result.rows[0].id,result.rows[0].id]
    );
    return result.rows.length===1;
  });
  console.info(created ? "Admin created" : "Admin exists; no changes made");
} finally { await pool.end(); }
