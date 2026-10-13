import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword,verifyPassword } from "../src/password.ts";
import { parseSecretKey,encryptSecret,decryptSecret } from "../src/secrets.ts";
import { hasPermission } from "../src/access.ts";
import { hashOpaqueToken,verifyCsrf } from "../src/sessions.ts";
import { loginThrottleKey } from "../src/login-throttle.ts";

test("scrypt password verification checks valid and invalid passwords",async()=>{
  const hash=await hashPassword("super-long-test-passphrase!");
  assert.equal(await verifyPassword("super-long-test-passphrase!",hash),true);
  assert.equal(await verifyPassword("not-the-same-password",hash),false);
  assert.equal(await verifyPassword("super-long-test-passphrase!",hash.replace("scrypt$","md5$")),false);
  await assert.rejects(hashPassword("too-short"),RangeError);
});

test("GCM secret envelope encrypts and authenticates destination binding",()=>{
  const keyText=randomBytes(32).toString("base64");
  const key=parseSecretKey(keyText);
  const envelope=encryptSecret("demo-token",key,"destination-one");
  assert.equal(decryptSecret(envelope,key,"destination-one"),"demo-token");
  assert.throws(()=>decryptSecret(envelope,key,"destination-two"));
  assert.throws(()=>parseSecretKey("not-a-key"));
});

test("RBAC least privilege is enforced by role",()=>{
  assert.equal(hasPermission("VIEWER","CONFIGURE"),false);
  assert.equal(hasPermission("OPERATOR","CONFIGURE"),true);
  assert.equal(hasPermission("OPERATOR","MANAGE_USERS"),false);
  assert.equal(hasPermission("ADMIN","MANAGE_USERS"),true);
});

test("CSRF token comparisons use hashes and reject malformed values",()=>{
  const raw=randomBytes(32).toString("hex");
  assert.equal(verifyCsrf(raw,hashOpaqueToken(raw)),true);
  assert.equal(verifyCsrf(raw,hashOpaqueToken("0".repeat(64))),false);
  assert.equal(verifyCsrf("invalid",hashOpaqueToken(raw)),false);
});

test("login throttle fingerprint conceals emails with an HMAC pepper",()=>{
  const a=loginThrottleKey("Test@Example.org","x".repeat(40));
  assert.equal(a,loginThrottleKey("  test@example.org  ","x".repeat(40)));
  assert.notEqual(a,loginThrottleKey("test@example.org","y".repeat(40)));
  assert.equal(a.length,64);
});
