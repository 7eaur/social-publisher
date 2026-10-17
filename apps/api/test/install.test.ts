import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {createDatabasePool} from "../../../packages/database/src/pool.ts";
import {migrate} from "../../../packages/database/src/migrate.ts";
import {buildApi} from "../src/server.ts";

const sourceUrl=process.env.DATABASE_URL;
if(!sourceUrl || process.env.NODE_ENV!=="test" ||
  !new URL(sourceUrl).pathname.endsWith("_test")){
  throw new Error("Installer test requires a dedicated *_test database");
}
const schema="installer_"+randomUUID().replaceAll("-","");
const root=createDatabasePool(sourceUrl);
const localUrl=new URL(sourceUrl);
localUrl.searchParams.set("options","-c search_path="+schema);
const pool=createDatabasePool(localUrl.toString());
const origin="http://localhost:3000";
const setupToken=randomBytes(32).toString("base64url");
let app:Awaited<ReturnType<typeof buildApi>>;

before(async()=>{
  await root.query('CREATE SCHEMA "'+schema+'"');
  await migrate(pool);
  app=await buildApi(pool,{origin,loginThrottlePepper:"test-pepper-"+randomBytes(32).toString("hex"),
    production:false,installSetupToken:setupToken});
  await app.ready();
});
after(async()=>{
  if(app)await app.close();
  await pool.end();
  await root.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
  await root.end();
});
test("first visit installs one administrator using one-time high-entropy token",async()=>{
  const status=await app.inject({method:"GET",url:"/api/install/status"});
  assert.deepEqual(status.json(),{required:true,available:true});
  const email="first-owner@example.invalid";
  const password="a-long-unique-setup-test-password";
  const bad=await app.inject({method:"POST",url:"/api/install/admin",
    headers:{origin},payload:{setupToken:"a".repeat(43),email,password}});
  assert.equal(bad.statusCode,403);
  const installed=await app.inject({method:"POST",url:"/api/install/admin",
    headers:{origin},payload:{setupToken,email,password}});
  assert.equal(installed.statusCode,201);
  assert.deepEqual(installed.json(),{installed:true});
  assert.deepEqual((await app.inject({method:"GET",url:"/api/install/status"})).json(),
    {required:false,available:true});
  const second=await app.inject({method:"POST",url:"/api/install/admin",
    headers:{origin},payload:{setupToken,email:"another@example.invalid",password}});
  assert.equal(second.statusCode,409);
  const login=await app.inject({method:"POST",url:"/api/auth/login",
    headers:{origin},payload:{email,password}});
  assert.equal(login.statusCode,200);
  const cookieHeader=login.headers["set-cookie"];
  const session=(Array.isArray(cookieHeader)?cookieHeader[0]:cookieHeader)?.split(";")[0];
  assert.ok(session);
  const profile=await app.inject({method:"GET",url:"/api/me",headers:{cookie:session}});
  assert.equal(profile.statusCode,200);
  assert.equal(profile.json().role,"ADMIN");
});
