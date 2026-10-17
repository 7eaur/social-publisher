import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabasePool} from "../../../packages/database/src/pool.ts";
import {migrate} from "../../../packages/database/src/migrate.ts";
import {hashPassword} from "../../../packages/security/src/password.ts";
import {buildApi} from "../src/server.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for API tests");
const pool=createDatabasePool();
const origin="http://localhost:3000";
let app:Awaited<ReturnType<typeof buildApi>>;
let email:string;
let routeId:string;
const password="very-long-unique-test-password!";

before(async()=>{
  await migrate(pool);
  email="admin-"+randomUUID()+"@test.invalid";
  await pool.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'ADMIN')",
    [email,await hashPassword(password)]);
  const s=await pool.query<{id:string}>(
    "INSERT INTO content_sources(kind,external_peer_id,label) VALUES('TELEGRAM',$1,'API Test') RETURNING id",
    [randomUUID()]);
  const r=await pool.query<{id:string}>(
    "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,true) RETURNING id",
    ["apitest-"+randomUUID().slice(0,8),s.rows[0]!.id]);
  routeId=r.rows[0]!.id;
  app=await buildApi(pool,{origin,loginThrottlePepper:"pepper".repeat(10),production:false});
  await app.ready();
});
after(async()=>{if(app)await app.close();await pool.end();});

test("health endpoints have minimal output",async()=>{
  assert.equal((await app.inject({method:"GET",url:"/health/live"})).statusCode,200);
  const ready=await app.inject({method:"GET",url:"/health/ready"});
  assert.deepEqual(ready.json(),{status:"ready"});
});

test("guest access is rejected and cross-origin login is denied",async()=>{
  assert.equal((await app.inject({method:"GET",url:"/api/routes"})).statusCode,401);
  const bad=await app.inject({method:"POST",url:"/api/auth/login",
    headers:{origin:"https://attacker.invalid"},payload:{email,password}});
  assert.equal(bad.statusCode,403);
});

test("login, CSRF protection, route pause, audit and logout",async()=>{
  const invalid=await app.inject({method:"POST",url:"/api/auth/login",
    headers:{origin},payload:{email,password:"not-the-correct-password"}});
  assert.equal(invalid.statusCode,401);
  const login=await app.inject({method:"POST",url:"/api/auth/login",
    headers:{origin},payload:{email,password}});
  assert.equal(login.statusCode,200);
  const csrf=login.json().csrfToken as string;
  const c=login.headers["set-cookie"];
  const cookie=(Array.isArray(c)?c[0]:c)?.split(";")[0];
  assert.ok(cookie);
  const me=await app.inject({method:"GET",url:"/api/me",headers:{cookie}});
  assert.equal(me.json().role,"ADMIN");
  const routes=await app.inject({method:"GET",url:"/api/routes",headers:{cookie}});
  assert.equal(routes.statusCode,200);
  const noCsrf=await app.inject({method:"POST",url:"/api/routes/"+routeId+"/pause",
    headers:{origin,cookie}});
  assert.equal(noCsrf.statusCode,403);
  const paused=await app.inject({method:"POST",url:"/api/routes/"+routeId+"/pause",
    headers:{origin,cookie,"x-csrf-token":csrf}});
  assert.equal(paused.statusCode,200);
  const row=await pool.query("SELECT enabled FROM routes WHERE id=$1",[routeId]);
  assert.equal(row.rows[0]?.enabled,false);
  const loggedOut=await app.inject({method:"POST",url:"/api/auth/logout",
    headers:{origin,cookie,"x-csrf-token":csrf}});
  assert.equal(loggedOut.statusCode,200);
  assert.equal((await app.inject({method:"GET",url:"/api/me",headers:{cookie}})).statusCode,401);
  const audit=await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1",[routeId]);
  assert.equal(audit.rows[0]?.n,1);
});

test("viewer role cannot change routes even with valid session and CSRF",async()=>{
  const {createSession}=await import("../../../packages/security/src/sessions.ts");
  const viewerEmail="viewer-"+randomUUID()+"@test.invalid";
  const viewer=await pool.query<{id:string}>(
    "INSERT INTO users(email,password_hash,role) VALUES($1,$2,'VIEWER') RETURNING id",
    [viewerEmail,await hashPassword("another-long-test-password")]
  );
  const session=await createSession(pool,viewer.rows[0]!.id);
  const result=await app.inject({
    method:"POST",url:"/api/routes/"+routeId+"/pause",
    headers:{
      origin,
      cookie:"sp_session="+session.sessionToken,
      "x-csrf-token":session.csrfToken
    }
  });
  assert.equal(result.statusCode,403);
});

test("dashboard UI assets are served, but unauthenticated data stays private",async()=>{
 const html=await app.inject({method:"GET",url:"/"});
 assert.equal(html.statusCode,200);
 assert.match(html.body,/Social Publisher/);
 const script=await app.inject({method:"GET",url:"/ui/app.js"});
 assert.equal(script.statusCode,200);
 assert.match(script.headers["content-type"]??"",/javascript/);
 const data=await app.inject({method:"GET",url:"/api/dashboard"});
 assert.equal(data.statusCode,401);
});

test("schedules require fresh CSRF and cannot activate unconnected routes",async()=>{
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const row=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
 const session=await createSession(pool,row.rows[0]!.id);
 const cookie="sp_session="+session.sessionToken;
 const refreshed=await app.inject({method:"GET",url:"/api/auth/csrf",headers:{cookie}});
 assert.equal(refreshed.statusCode,200);
 const csrf=refreshed.json().csrfToken as string;
 const body={timeZone:"Asia/Aden",isoWeekdays:[1,2,3],slots:["10:00"],dailyLimit:1};
 const stale=await app.inject({method:"PUT",url:"/api/schedules/"+routeId,
   headers:{origin,cookie,"x-csrf-token":session.csrfToken},payload:body});
 assert.equal(stale.statusCode,403);
 const saved=await app.inject({method:"PUT",url:"/api/schedules/"+routeId,
   headers:{origin,cookie,"x-csrf-token":csrf},payload:body});
 assert.equal(saved.statusCode,200);
 const rules=await app.inject({method:"GET",url:"/api/schedules",headers:{cookie}});
 assert.equal(rules.statusCode,200);
 assert.ok(rules.json().schedules.some((x:{route_id:string})=>x.route_id===routeId));
 const resumed=await app.inject({method:"POST",url:"/api/routes/"+routeId+"/resume",
   headers:{origin,cookie,"x-csrf-token":csrf}});
 assert.equal(resumed.statusCode,409);
});

test("draft sources and destinations are never activated by setup alone",async()=>{
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const admin=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
 const session=await createSession(pool,admin.rows[0]!.id);
 const cookie="sp_session="+session.sessionToken;
 const headers={origin,cookie,"x-csrf-token":session.csrfToken};
 const slug="setup-"+randomUUID().slice(0,8);
 const peerId="-100123456789012";
 const first=await app.inject({method:"POST",url:"/api/setup/source",headers,
   payload:{slug,label:"Channel not connected",peerId}});
 assert.equal(first.statusCode,201);
 const route=first.json().routeId as string;
 const same=await app.inject({method:"POST",url:"/api/setup/source",headers,
   payload:{slug,label:"Duplicate",peerId}});
 assert.equal(same.statusCode,409);
 const destination=await app.inject({method:"POST",url:"/api/setup/destination",headers,
   payload:{platform:"FACEBOOK",accountId:"1234567890",displayName:"Unconnected Page"}});
 assert.equal(destination.statusCode,201);
 const target=destination.json().destinationId as string;
 const attach=await app.inject({method:"POST",url:"/api/setup/attach",headers,
   payload:{routeId:route,destinationId:target}});
 assert.equal(attach.statusCode,200);
 const snapshot=await app.inject({method:"GET",url:"/api/dashboard",headers:{cookie}});
 assert.equal(snapshot.statusCode,200);
 assert.ok(snapshot.json().routes.some((x:{id:string})=>x.id===route));
 const state=await pool.query<{enabled:boolean}>("SELECT enabled FROM routes WHERE id=$1",[route]);
 assert.equal(state.rows[0]?.enabled,false);
 const enabled=await pool.query<{enabled:boolean;credentials_ciphertext:Buffer|null}>(
   "SELECT enabled,credentials_ciphertext FROM destinations WHERE id=$1",[target]);
 assert.equal(enabled.rows[0]?.enabled,false);
 assert.equal(enabled.rows[0]?.credentials_ciphertext,null);
});

test("admin can store and revoke encrypted Telegram source settings without exposing secrets",async()=>{
 const {randomBytes}=await import("node:crypto");
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const {readTelegramApiProfile}=await import("../src/secret-setup.ts");
 const {readTelegramSession}=await import("../../../packages/telegram/src/session.ts");
 const key=randomBytes(32);
 const isolated=await buildApi(pool,{origin,loginThrottlePepper:"pepper".repeat(10),production:false,
  secretsEncryptionKey:key});
 await isolated.ready();
 try{
  const admin=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
  const session=await createSession(pool,admin.rows[0]!.id);
  const cookie="sp_session="+session.sessionToken;
  const headers={origin,cookie,"x-csrf-token":session.csrfToken};
  const source=await pool.query<{source_id:string}>("SELECT source_id FROM routes WHERE id=$1",[routeId]);
  const id=source.rows[0]!.source_id;
  const before=await isolated.inject({method:"PUT",url:"/api/setup/telegram/"+id+"/credentials",
    headers:{origin,cookie},payload:{apiId:101,apiHash:"test-api-hash",sessionString:"test-session-value"}});
  assert.equal(before.statusCode,403,"missing CSRF is rejected");
  const saved=await isolated.inject({method:"PUT",url:"/api/setup/telegram/"+id+"/credentials",
    headers,payload:{apiId:101,apiHash:"test-api-hash",sessionString:"test-session-value"}});
  assert.equal(saved.statusCode,200);
  assert.deepEqual(saved.json(),{saved:true,verified:false,active:false});
  assert.equal((await readTelegramApiProfile(pool,id,key))?.apiHash,"test-api-hash");
  assert.equal(await readTelegramSession(pool,id,key),"test-session-value");
  const catalog=await isolated.inject({method:"GET",url:"/api/setup/catalog",headers:{cookie}});
  assert.equal(catalog.statusCode,200);
  assert.ok(catalog.json().sources.some((s:{id:string;has_session:boolean;has_api_credentials:boolean})=>
    s.id===id && s.has_session && s.has_api_credentials));
  assert.ok(!catalog.body.includes("test-session-value"));
  assert.ok(!catalog.body.includes("test-api-hash"));
  const row=await pool.query<{enabled:boolean}>("SELECT enabled FROM content_sources WHERE id=$1",[id]);
  assert.equal(row.rows[0]?.enabled,false);
  const revoked=await isolated.inject({method:"DELETE",url:"/api/setup/telegram/"+id+"/credentials",headers});
  assert.equal(revoked.statusCode,200);
  assert.equal(await readTelegramApiProfile(pool,id,key),null);
  assert.equal(await readTelegramSession(pool,id,key),null);
 }finally{await isolated.close();}
});

test("only administrators can store Meta tokens; token rotation disables the destination",async()=>{
 const {randomBytes}=await import("node:crypto");
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const {readDestinationCredential}=await import("../../../packages/database/src/credentials.ts");
 const key=randomBytes(32);
 const isolated=await buildApi(pool,{origin,loginThrottlePepper:"pepper".repeat(10),production:false,
  secretsEncryptionKey:key});
 await isolated.ready();
 try{
  const account=await pool.query<{id:string}>(
    "INSERT INTO destinations(platform,external_account_id,display_name,enabled) VALUES('FACEBOOK',$1,'API secure test',true) RETURNING id",
    [randomUUID().replaceAll("-","")]
  );
  const id=account.rows[0]!.id;
  const admins=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
  const adminSession=await createSession(pool,admins.rows[0]!.id);
  const cookie="sp_session="+adminSession.sessionToken;
  const headers={origin,cookie,"x-csrf-token":adminSession.csrfToken};
  const value="test-meta-token-without-real-account";
  const saved=await isolated.inject({method:"PUT",url:"/api/setup/meta/"+id+"/credentials",
    headers,payload:{accessToken:value}});
  assert.equal(saved.statusCode,200);
  assert.equal(await readDestinationCredential(pool,id,key),value);
  const secure=await pool.query<{enabled:boolean;credentials_ciphertext:Buffer}>(
    "SELECT enabled,credentials_ciphertext FROM destinations WHERE id=$1",[id]);
  assert.equal(secure.rows[0]?.enabled,false);
  assert.ok(!secure.rows[0]!.credentials_ciphertext.toString().includes(value));
  const viewer=await pool.query<{id:string}>("SELECT id FROM users WHERE role='VIEWER' LIMIT 1");
  if(viewer.rows[0]){
   const viewerSession=await createSession(pool,viewer.rows[0].id);
   const denied=await isolated.inject({method:"PUT",url:"/api/setup/meta/"+id+"/credentials",
    headers:{origin,cookie:"sp_session="+viewerSession.sessionToken,
     "x-csrf-token":viewerSession.csrfToken},payload:{accessToken:"viewer-must-not-set-this"}});
   assert.equal(denied.statusCode,403);
  }
  const catalog=await isolated.inject({method:"GET",url:"/api/setup/catalog",headers:{cookie}});
  assert.ok(catalog.json().destinations.some((d:{id:string;has_credential:boolean})=>
    d.id===id&&d.has_credential));
  assert.ok(!catalog.body.includes(value));
  const removed=await isolated.inject({method:"DELETE",url:"/api/setup/meta/"+id+"/credentials",headers});
  assert.equal(removed.statusCode,200);
  assert.equal(await readDestinationCredential(pool,id,key),null);
 }finally{await isolated.close();}
});

test("without a master encryption key, secret entry fails closed",async()=>{
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const admin=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
 const session=await createSession(pool,admin.rows[0]!.id);
 const destination=await pool.query<{id:string}>(
   "INSERT INTO destinations(platform,external_account_id,display_name) VALUES('INSTAGRAM',$1,'Missing key') RETURNING id",
   [randomUUID().replaceAll("-","")]
 );
 const response=await app.inject({method:"PUT",url:"/api/setup/meta/"+destination.rows[0]!.id+"/credentials",
   headers:{origin,cookie:"sp_session="+session.sessionToken,"x-csrf-token":session.csrfToken},
   payload:{accessToken:"no-master-key"}});
 assert.equal(response.statusCode,503);
 assert.equal(response.json().error,"SECRET_STORE_NOT_CONFIGURED");
});

test("installation vault stores only encrypted settings, supports revocation and refuses non-admin writes",async()=>{
 const {randomBytes}=await import("node:crypto");
 const {createSession}=await import("../../../packages/security/src/sessions.ts");
 const {readIntegrationSecret}=await import("../src/integration-vault.ts");
 const key=randomBytes(32);
 const api=await buildApi(pool,{origin,loginThrottlePepper:"pepper".repeat(10),
   production:false,secretsEncryptionKey:key});
 await api.ready();
 try{
   const admin=await pool.query<{id:string}>("SELECT id FROM users WHERE email=$1",[email]);
   const session=await createSession(pool,admin.rows[0]!.id);
   const cookie="sp_session="+session.sessionToken;
   const headers={origin,cookie,"x-csrf-token":session.csrfToken};
   const name="META_APP_SECRET";
   const value="non-production-test-application-secret";
   const invalid=await api.inject({method:"PUT",url:"/api/setup/integrations/SOME_ARBITRARY_NAME",
     headers,payload:{value}});
   assert.equal(invalid.statusCode,400);
   const saved=await api.inject({method:"PUT",url:"/api/setup/integrations/"+name,
     headers,payload:{value}});
   assert.equal(saved.statusCode,200);
   assert.equal(await readIntegrationSecret(pool,name,key),value);
   const stored=await pool.query<{encrypted_value:Buffer}>(
     "SELECT encrypted_value FROM integration_vault WHERE name=$1",[name]);
   assert.ok(!stored.rows[0]!.encrypted_value.toString().includes(value));
   const list=await api.inject({method:"GET",url:"/api/setup/integrations",headers:{cookie}});
   assert.equal(list.statusCode,200);
   assert.ok(list.json().integrations.some((s:{name:string;configured:boolean})=>s.name===name&&s.configured));
   assert.ok(!list.body.includes(value));
   const route=await pool.query<{enabled:boolean}>("SELECT enabled FROM routes WHERE id=$1",[routeId]);
   assert.equal(route.rows[0]?.enabled,false);
   const viewer=await pool.query<{id:string}>("SELECT id FROM users WHERE role='VIEWER' LIMIT 1");
   if(viewer.rows[0]){
     const sess=await createSession(pool,viewer.rows[0].id);
     const denied=await api.inject({method:"PUT",url:"/api/setup/integrations/"+name,
       headers:{origin,cookie:"sp_session="+sess.sessionToken,"x-csrf-token":sess.csrfToken},
       payload:{value:"do-not-accept"}});
     assert.equal(denied.statusCode,403);
   }
   const revoked=await api.inject({method:"DELETE",url:"/api/setup/integrations/"+name,headers});
   assert.equal(revoked.statusCode,200);
   assert.equal(await readIntegrationSecret(pool,name,key),null);
 }finally{await api.close();}
});

test("readiness refuses a database without its required schema",async()=>{
 const fake={
   query:async(query:string)=>{
     if(query.includes("schema_migrations"))return {rows:[{latest:false}]};
     throw new Error("Unexpected query");
   }
 } as unknown as Parameters<typeof buildApi>[0];
 const isolated=await buildApi(fake,{origin,loginThrottlePepper:"pepper".repeat(10),production:false});
 await isolated.ready();
 try{
   const result=await isolated.inject({method:"GET",url:"/health/ready"});
   assert.equal(result.statusCode,503);
   assert.deepEqual(result.json(),{status:"unavailable"});
 }finally{await isolated.close();}
});
