import {readFile} from "node:fs/promises";
import {dashboardSnapshot,queuePreview,schedulesPreview} from "./read-model.ts";
import {validateScheduleRule,type ScheduleRule} from "../../../packages/core/src/schedule.ts";
import {randomBytes} from "node:crypto";
import {hashOpaqueToken} from "../../../packages/security/src/sessions.ts";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import type { Pool } from "pg";
import { withinTransaction } from "../../../packages/database/src/pool.ts";
import { hashPassword, verifyPassword } from "../../../packages/security/src/password.ts";
import { loginBlocked, loginThrottleKey, recordLoginFailure, clearLoginFailures } from "../../../packages/security/src/login-throttle.ts";
import { createSession, findSession, verifyCsrf, revokeSession, type SessionIdentity } from "../../../packages/security/src/sessions.ts";
import { hasPermission } from "../../../packages/security/src/access.ts";

export interface ApiSettings {
  readonly origin: string;
  readonly loginThrottlePepper: string;
  readonly production: boolean;
}

const validUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export async function buildApi(pool: Pool, config: ApiSettings): Promise<FastifyInstance> {
  const origin = new URL(config.origin);
  if (!["http:","https:"].includes(origin.protocol) || origin.origin !== config.origin) {
    throw new Error("APP_ORIGIN must be an exact HTTP origin");
  }
  if (config.production && origin.protocol !== "https:") throw new Error("Production requires HTTPS");
  if (config.loginThrottlePepper.length < 32) throw new Error("LOGIN_THROTTLE_PEPPER is too short");

  const app = Fastify({logger: false, bodyLimit: 4096, trustProxy: false});
  await app.register(cookie);
  const cookieName = config.production ? "__Host-sp_session" : "sp_session";
  const dummyPasswordHash = hashPassword("dummy-hash-to-limit-user-enumeration");

  app.addHook("onRequest", async (request,reply) => {
    if (["POST","PUT","PATCH","DELETE"].includes(request.method) && request.headers.origin !== config.origin) {
      return reply.code(403).send({error:"FORBIDDEN_ORIGIN"});
    }
  });
  app.addHook("onSend",async (_request,reply,payload) => {
    reply.header("cache-control","no-store");
    reply.header("x-content-type-options","nosniff");
    reply.header("referrer-policy","no-referrer");
    reply.header("x-frame-options","DENY");
    reply.header("content-security-policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    return payload;
  });
  app.setErrorHandler((err,_req,reply) => {
    const status=err.statusCode && err.statusCode>=400 && err.statusCode<500 ? err.statusCode : 500;
    reply.code(status).send({error:status===500?"INTERNAL_ERROR":"BAD_REQUEST"});
  });

  async function requireUser(request: FastifyRequest,reply: FastifyReply): Promise<SessionIdentity|null> {
    const token=request.cookies[cookieName];
    const identity=token?await findSession(pool,token):null;
    if (!identity) { reply.code(401).send({error:"UNAUTHORIZED"}); return null; }
    return identity;
  }

  app.get("/",async(_request,reply)=>
    reply.type("text/html; charset=utf-8").send(await readFile(new URL("../../web/index.html",import.meta.url),"utf8"))
  );
  app.get("/ui/app.js",async(_request,reply)=>
    reply.type("text/javascript; charset=utf-8").send(await readFile(new URL("../../web/app.js",import.meta.url),"utf8"))
  );
  app.get("/ui/style.css",async(_request,reply)=>
    reply.type("text/css; charset=utf-8").send(await readFile(new URL("../../web/style.css",import.meta.url),"utf8"))
  );
  app.get("/health/live",async()=>({status:"ok"}));
  app.get("/health/ready",async (_request,reply) => {
    try { await pool.query("SELECT 1"); return {status:"ready"}; }
    catch { return reply.code(503).send({status:"unavailable"}); }
  });

  app.post("/api/auth/login",{schema:{body:{
    type:"object",required:["email","password"],additionalProperties:false,
    properties:{
      email:{type:"string",minLength:3,maxLength:254},
      password:{type:"string",minLength:1,maxLength:256}
    }
  }}},async (request,reply) => {
    const {email,password}=request.body as {email:string;password:string};
    const normalized=email.trim().toLowerCase();
    const key=loginThrottleKey(normalized,config.loginThrottlePepper);
    if (await loginBlocked(pool,key)) return reply.code(401).send({error:"INVALID_CREDENTIALS"});
    const result=await pool.query<{id:string;password_hash:string;enabled:boolean}>(
      "SELECT id,password_hash,enabled FROM users WHERE email=$1",[normalized]
    );
    const user=result.rows[0];
    const verified=await verifyPassword(password,user?.password_hash ?? await dummyPasswordHash);
    if (!verified || !user?.enabled) {
      await recordLoginFailure(pool,key);
      return reply.code(401).send({error:"INVALID_CREDENTIALS"});
    }
    await clearLoginFailures(pool,key);
    const session=await createSession(pool,user.id);
    reply.setCookie(cookieName,session.sessionToken,{
      path:"/",httpOnly:true,secure:config.production,sameSite:"strict",maxAge:43200
    });
    await pool.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'AUTH_LOGIN','USER',$2)",
      [user.id,user.id]);
    return {csrfToken:session.csrfToken,expiresAt:session.expiresAt.toISOString()};
  });

  app.get("/api/me",async (request,reply)=>{
    const user=await requireUser(request,reply);
    if (!user) return;
    return {userId:user.userId,email:user.email,role:user.role};
  });
  app.get("/api/routes",async (request,reply)=>{
    const user=await requireUser(request,reply);
    if (!user) return;
    if (!hasPermission(user.role,"VIEW")) return reply.code(403).send({error:"FORBIDDEN"});
    const result=await pool.query(
      "SELECT r.id,r.slug,r.enabled,s.label AS source_label FROM routes r JOIN content_sources s ON s.id=r.source_id ORDER BY r.slug"
    );
    return {routes:result.rows};
  });
  async function requireWriteAuth(request:FastifyRequest,reply:FastifyReply):Promise<SessionIdentity|null>{
    const user=await requireUser(request,reply);
    if (!user) return null;
    const csrf=request.headers["x-csrf-token"];
    if (typeof csrf!=="string" || !verifyCsrf(csrf,user.csrfHash)) {
      reply.code(403).send({error:"INVALID_CSRF"});return null;
    }
    return user;
  }
  app.get("/api/dashboard",async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    return dashboardSnapshot(pool);
  });
  app.get("/api/queue",async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    return {items:await queuePreview(pool)};
  });
  app.get("/api/schedules",async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    return {schedules:await schedulesPreview(pool)};
  });
  app.get("/api/auth/csrf",async(request,reply)=>{
    const user=await requireUser(request,reply);
    if(!user)return;
    const raw=request.cookies[cookieName];
    if(!raw)return reply.code(401).send({error:"UNAUTHORIZED"});
    const csrf=randomBytes(32).toString("hex");
    const updated=await pool.query(
      `UPDATE auth_sessions SET csrf_hash=$2 WHERE token_hash=$1
       AND revoked_at IS NULL AND expires_at>now()`,
      [hashOpaqueToken(raw),hashOpaqueToken(csrf)]
    );
    if(updated.rowCount!==1)return reply.code(401).send({error:"UNAUTHORIZED"});
    return {csrfToken:csrf};
  });
  app.put("/api/schedules/:id",{
    schema:{body:{
      type:"object",additionalProperties:false,
      required:["timeZone","isoWeekdays","slots","dailyLimit"],
      properties:{
        timeZone:{type:"string",maxLength:80,minLength:1},
        isoWeekdays:{type:"array",minItems:1,maxItems:7,items:{type:"integer",minimum:1,maximum:7}},
        slots:{type:"array",minItems:1,maxItems:50,items:{type:"string",pattern:"^([01][0-9]|2[0-3]):[0-5][0-9]$"}},
        dailyLimit:{type:"integer",minimum:1,maximum:50}
      }
    }}
  },async(request,reply)=>{
    const user=await requireWriteAuth(request,reply);
    if(!user)return;
    if(!hasPermission(user.role,"CONFIGURE"))return reply.code(403).send({error:"FORBIDDEN"});
    const id=(request.params as {id:string}).id;
    if(!validUuid.test(id))return reply.code(400).send({error:"INVALID_ID"});
    const data=request.body as {timeZone:string;isoWeekdays:number[];slots:string[];dailyLimit:number};
    const rule:ScheduleRule={
      routeId:id,enabled:false,timeZone:data.timeZone,
      isoWeekdays:data.isoWeekdays as ScheduleRule["isoWeekdays"],
      slots:data.slots,dailyLimit:data.dailyLimit
    };
    try{validateScheduleRule(rule);}
    catch{return reply.code(400).send({error:"INVALID_SCHEDULE"});}
    const saved=await withinTransaction(pool,async client=>{
      const route=await client.query("SELECT id FROM routes WHERE id=$1 FOR UPDATE",[id]);
      if(!route.rows[0])return false;
      await client.query(
        `INSERT INTO schedule_rules(route_id,time_zone,iso_weekdays,slots,daily_limit,enabled)
         VALUES($1,$2,$3,$4,$5,true)
         ON CONFLICT(route_id) DO UPDATE SET
           time_zone=excluded.time_zone,iso_weekdays=excluded.iso_weekdays,
           slots=excluded.slots,daily_limit=excluded.daily_limit,
           enabled=true,updated_at=now()`,
         [id,data.timeZone,data.isoWeekdays,data.slots,data.dailyLimit]
      );
      await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'SCHEDULE_CONFIGURE','ROUTE',$2)",[user.userId,id]);
      return true;
    });
    if(!saved)return reply.code(404).send({error:"NOT_FOUND"});
    return {saved:true,enabled:true,routeEnabled:false};
  });
  app.post("/api/routes/:id/resume",async(request,reply)=>{
    const user=await requireWriteAuth(request,reply);if(!user)return;
    if(!hasPermission(user.role,"CONFIGURE"))return reply.code(403).send({error:"FORBIDDEN"});
    const id=(request.params as {id:string}).id;
    if(!validUuid.test(id))return reply.code(400).send({error:"INVALID_ID"});
    const enabled=await withinTransaction(pool,async client=>{
      const route=await client.query(
        "SELECT id FROM routes WHERE id=$1 FOR UPDATE",[id]
      );
      if(!route.rows[0])return null;
      const check=await client.query<{ready:boolean}>(
        `SELECT s.enabled AND sr.route_id IS NOT NULL
          AND (SELECT count(*)>0 FROM route_destinations WHERE route_id=r.id)
          AND NOT EXISTS (
            SELECT 1 FROM route_destinations rd JOIN destinations d ON d.id=rd.destination_id
            WHERE rd.route_id=r.id AND (NOT d.enabled OR d.credentials_ciphertext IS NULL)
          ) AS ready
         FROM routes r JOIN content_sources s ON s.id=r.source_id
         LEFT JOIN schedule_rules sr ON sr.route_id=r.id AND sr.enabled=true
         WHERE r.id=$1`,[id]
      );
      if(!check.rows[0]?.ready)return false;
      await client.query("UPDATE routes SET enabled=true WHERE id=$1",[id]);
      await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'ROUTE_RESUME','ROUTE',$2)",[user.userId,id]);
      return true;
    });
    if(enabled===null)return reply.code(404).send({error:"NOT_FOUND"});
    if(!enabled)return reply.code(409).send({error:"ACCOUNT_OR_SCHEDULE_NOT_READY"});
    return {enabled:true};
  });
  app.post("/api/routes/:id/pause",async(request,reply)=>{
    const user=await requireWriteAuth(request,reply);
    if (!user) return;
    if (!hasPermission(user.role,"CONFIGURE")) return reply.code(403).send({error:"FORBIDDEN"});
    const {id}=request.params as {id:string};
    if (!validUuid.test(id)) return reply.code(400).send({error:"INVALID_ID"});
    const paused=await withinTransaction(pool,async(client)=>{
      const result=await client.query("UPDATE routes SET enabled=false WHERE id=$1::uuid RETURNING id",[id]);
      if (result.rowCount!==1) return false;
      await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'ROUTE_PAUSE','ROUTE',$2)",
        [user.userId,id]);
      return true;
    });
    return paused?{paused:true}:reply.code(404).send({error:"NOT_FOUND"});
  });
  app.post("/api/auth/logout",async(request,reply)=>{
    const user=await requireWriteAuth(request,reply);
    if (!user) return;
    const token=request.cookies[cookieName];
    if (!token) return reply.code(401).send({error:"UNAUTHORIZED"});
    await revokeSession(pool,token);
    reply.clearCookie(cookieName,{path:"/"});
    return {loggedOut:true};
  });
  return app;
}
