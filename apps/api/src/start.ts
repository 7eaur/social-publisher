import { createDatabasePool } from "../../../packages/database/src/pool.ts";
import { buildApi } from "./server.ts";
import {parseSecretKey} from "../../../packages/security/src/secrets.ts";

const origin = process.env.APP_ORIGIN;
const pepper = process.env.LOGIN_THROTTLE_PEPPER;
if (!origin || !pepper) throw new Error("APP_ORIGIN and LOGIN_THROTTLE_PEPPER are required");
const pool = createDatabasePool();
const app = await buildApi(pool, {
  origin,
  loginThrottlePepper: pepper,
  production: process.env.NODE_ENV === "production",
  ...(process.env.INSTALL_SETUP_TOKEN ? {installSetupToken:process.env.INSTALL_SETUP_TOKEN} : {}),
  ...(process.env.SECRETS_ENCRYPTION_KEY ? {secretsEncryptionKey:parseSecretKey(process.env.SECRETS_ENCRYPTION_KEY)} : {})
});
try {
  await app.listen({ host: process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"), port: Number(process.env.PORT ?? "3000") });
} catch {
  console.error("API could not start");
  await pool.end();
  process.exitCode = 1;
}
process.on("SIGTERM", () => { void app.close().then(() => pool.end()); });
