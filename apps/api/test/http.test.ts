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
