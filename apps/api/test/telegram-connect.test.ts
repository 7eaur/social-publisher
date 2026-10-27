import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {createDatabasePool} from "../../../packages/database/src/pool.ts";
import {migrate} from "../../../packages/database/src/migrate.ts";
import {buildApi} from "../src/server.ts";
import {hashPassword} from "../../../packages/security/src/password.ts";
import type {TelegramGateway,TelegramGatewayFactory} from "../src/telegram-connect.ts";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl||process.env.NODE_ENV!=="test"||
   !new URL(databaseUrl).pathname.endsWith("_test"))
 throw new Error("Telegram connect tests require an isolated *_test PostgreSQL database");
const schema="tgconnect_"+randomUUID().replaceAll("-","");
const root=createDatabasePool(databaseUrl);
const isolated=new URL(databaseUrl);isolated.searchParams.set("options","-c search_path="+schema);
const pool=createDatabasePool(isolated.toString());
const origin="http://localhost:3000";
const email="telegram-connect@example.invalid",password="telegram-fake-test-password";
let app:Awaited<ReturnType<typeof buildApi>>;
let cookie="",csrf="";
let created=0,disconnected=0,challengeMode:"PASSWORD"|"DIRECT"="PASSWORD";
const factory:TelegramGatewayFactory=async(apiId,apiHash)=>{
 assert.equal(apiId,12345);assert.equal(apiHash,"a".repeat(32));
 created++;
 const gateway:TelegramGateway={
  async sendCode(phone){assert.equal(phone,"+967777777777");return {isCodeViaApp:true};},
  async signInCode(_phone,code){
   if(code==="00000")throw Object.assign(new Error("invalid"),{errorMessage:"PHONE_CODE_INVALID"});
   return challengeMode==="PASSWORD"?"PASSWORD_REQUIRED":"AUTHORIZED";
  },
  async signInPassword(value){
   if(value!=="correct-secret")throw Object.assign(new Error("invalid"),{errorMessage:"PASSWORD_HASH_INVALID"});
  },
  async inspectChannel(reference){
   assert.equal(reference,"@wasltech");
   return {peerId:"-100123456789012",title:"Wasl Tech",username:"wasltech",latestMessageId:98765};
  },
  sessionString:()=>"fake-telegram-string-session",
  async close(){disconnected++;}
 };
 return gateway;
};
before(async()=>{
 await root.query('CREATE SCHEMA "'+schema+'"');
 await migrate(pool);
 await pool.query(
  "INSERT INTO users(email,password_hash,role,enabled) VALUES($1,$2,'ADMIN',true)",
  [email,await hashPassword(password)]
 );
 app=await buildApi(pool,{origin,loginThrottlePepper:"pepper-".repeat(10),
   secretsEncryptionKey:randomBytes(32),telegramGatewayFactory:factory,production:false});
 await app.ready();
 const login=await app.inject({method:"POST",url:"/api/auth/login",
   headers:{origin},payload:{email,password}});
 assert.equal(login.statusCode,200);
 const cookies=login.headers["set-cookie"];
 cookie=(Array.isArray(cookies)?cookies[0]:cookies)!.split(";")[0]!;
 csrf=login.json().csrfToken;
});
after(async()=>{
 if(app)await app.close();
 await pool.end();
 await root.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
 await root.end();
});
const auth=()=>({origin,cookie,"x-csrf-token":csrf});
test("wizard protects every stage and follows code → 2FA → verified channel",async()=>{
 const unauth=await app.inject({method:"POST",url:"/api/telegram/connect/start",
   headers:{origin},payload:{apiId:12345,apiHash:"a".repeat(32),phone:"+967777777777"}});
 assert.equal(unauth.statusCode,401);
 const noCsrf=await app.inject({method:"POST",url:"/api/telegram/connect/start",
   headers:{origin,cookie},payload:{apiId:12345,apiHash:"a".repeat(32),phone:"+967777777777"}});
 assert.equal(noCsrf.statusCode,403);
 const begin=await app.inject({method:"POST",url:"/api/telegram/connect/start",
   headers:auth(),payload:{apiId:12345,apiHash:"a".repeat(32),phone:"+967777777777"}});
 assert.equal(begin.statusCode,200);
 assert.equal(begin.json().step,"CODE");
 assert.equal(begin.json().delivery,"TELEGRAM_APP");
 assert.doesNotMatch(begin.body,/a{32}|777777777|fake-telegram-string-session/);
 const attemptId=begin.json().attemptId as string;
 const early=await app.inject({method:"POST",url:"/api/telegram/connect/channel",
   headers:auth(),payload:{attemptId,reference:"@wasltech",slug:"verified",label:"Wasl"}});
 assert.equal(early.statusCode,409);
 const bad=await app.inject({method:"POST",url:"/api/telegram/connect/code",
   headers:auth(),payload:{attemptId,code:"00000"}});
 assert.equal(bad.statusCode,400);
 assert.deepEqual(bad.json(),{error:"CODE_INVALID"});
 const code=await app.inject({method:"POST",url:"/api/telegram/connect/code",
   headers:auth(),payload:{attemptId,code:"12345"}});
 assert.equal(code.statusCode,200);
 assert.equal(code.json().step,"PASSWORD");
 const invalid=await app.inject({method:"POST",url:"/api/telegram/connect/password",
   headers:auth(),payload:{attemptId,password:"wrong-password"}});
 assert.equal(invalid.statusCode,400);
 assert.equal(invalid.json().error,"TWO_FACTOR_INVALID");
 const passwordStep=await app.inject({method:"POST",url:"/api/telegram/connect/password",
   headers:auth(),payload:{attemptId,password:"correct-secret"}});
 assert.equal(passwordStep.statusCode,200);
 assert.equal(passwordStep.json().step,"CHANNEL");
 const badLink=await app.inject({method:"POST",url:"/api/telegram/connect/channel",
   headers:auth(),payload:{attemptId,reference:"https://t.me/+unsafeInvite",slug:"verified",label:"Wasl"}});
 assert.equal(badLink.statusCode,400);
 assert.equal(badLink.json().error,"CHANNEL_REFERENCE_INVALID");
 const verified=await app.inject({method:"POST",url:"/api/telegram/connect/channel",
   headers:auth(),payload:{attemptId,reference:"https://t.me/wasltech",slug:"verified",label:"Wasl"}});
 assert.equal(verified.statusCode,201);
 assert.equal(verified.json().verifiedRead,true);
 assert.equal(verified.json().routeEnabled,false);
 assert.equal(verified.json().channel.peerId,"-100123456789012");
 assert.equal(verified.json().channel.startsAfterMessageId,98765);
 assert.doesNotMatch(verified.body,/fake-telegram-string-session|a{32}/);
 const persisted=await pool.query<{enabled:boolean;route_enabled:boolean;has_session:boolean;has_api:boolean;last_indexed_message_id:string|null}>(
  `SELECT cs.enabled,r.enabled AS route_enabled,
       (ts.source_id IS NOT NULL) AS has_session,(tc.source_id IS NOT NULL) AS has_api,cs.last_indexed_message_id::text
     FROM content_sources cs JOIN routes r ON r.source_id=cs.id
     LEFT JOIN telegram_session_credentials ts ON ts.source_id=cs.id
     LEFT JOIN telegram_api_credentials tc ON tc.source_id=cs.id
     WHERE cs.id=$1`,[verified.json().sourceId]
 );
 assert.deepEqual(persisted.rows[0],{enabled:true,route_enabled:false,has_session:true,has_api:true,last_indexed_message_id:"98765"});
 assert.equal(disconnected,1);
 const stale=await app.inject({method:"POST",url:"/api/telegram/connect/code",
   headers:auth(),payload:{attemptId,code:"12345"}});
 assert.equal(stale.statusCode,409);
 assert.equal(created,1);
});
test("channel references are constrained; no auto-join of private invitation links",async()=>{
 const {TelegramOnboardingError}=await import("../src/telegram-connect.ts");
 const {TelegramConnectionWizard}=await import("../src/telegram-connect.ts");
 let at=180_000;
 const wizard=new TelegramConnectionWizard(factory,()=>at);
 const begin=await wizard.start("other-admin",12345,"a".repeat(32),"+967777777777");
 assert.equal((await wizard.code("other-admin",begin.attemptId,"12345")).step,"PASSWORD");
 await wizard.password("other-admin",begin.attemptId,"correct-secret");
 await assert.rejects(()=>wizard.verifyChannel("other-admin",begin.attemptId,"https://t.me/+abcdef"),
   (error:unknown)=>error instanceof TelegramOnboardingError&&error.code==="CHANNEL_REFERENCE_INVALID");
 at+=11*60_000;
 await assert.rejects(()=>wizard.verifyChannel("other-admin",begin.attemptId,"@wasltech"),
   (error:unknown)=>error instanceof TelegramOnboardingError&&error.code==="CHALLENGE_EXPIRED");
 const cancelled=await wizard.cancel("other-admin");
 assert.equal(cancelled.cancelled,true);
});
