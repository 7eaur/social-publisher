import type {Pool} from "pg";
import {withinTransaction} from "../../../packages/database/src/pool.ts";
import {encryptSecret,decryptSecret, type SecretEnvelope} from "../../../packages/security/src/secrets.ts";

/** Never send encryption keys or raw credentials back to HTTP callers. */
export interface TelegramConnectionDraft {
  readonly apiId:number;
  readonly apiHash:string;
  readonly sessionString:string;
}
function checkedSecret(value:string, label:string,max:number):string {
  if (typeof value!=="string" || !value.trim() ||
      Buffer.byteLength(value,"utf8")>max) throw new RangeError("Invalid "+label);
  return value;
}
function payload(secret:string,key:Buffer,context:string){
  const value=encryptSecret(secret,key,context);
  return [
    Buffer.from(value.ciphertext,"base64"),
    Buffer.from(value.iv,"base64"),
    Buffer.from(value.tag,"base64")
  ] as const;
}
/** Store one approved source's credentials in a single transaction. Save never activates it. */
export async function storeTelegramConnection(
  pool:Pool,sourceId:string,actorId:string,data:TelegramConnectionDraft,key:Buffer
):Promise<boolean>{
  if (!Number.isSafeInteger(data.apiId)||data.apiId<=0||data.apiId>2147483647)
    throw new RangeError("Invalid Telegram API ID");
  const hash=checkedSecret(data.apiHash,"Telegram API hash",512);
  const session=checkedSecret(data.sessionString,"Telegram session",16000);
  const h=payload(hash,key,"telegram-api:"+sourceId);
  const s=payload(session,key,"telegram:"+sourceId);
  return withinTransaction(pool,async client=>{
    const source=await client.query("SELECT id FROM content_sources WHERE id=$1::uuid FOR UPDATE",[sourceId]);
    if(source.rowCount!==1)return false;
    await client.query(
      `INSERT INTO telegram_api_credentials(source_id,api_id,encrypted_hash,iv,tag,version)
       VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(source_id) DO UPDATE SET
       api_id=excluded.api_id,encrypted_hash=excluded.encrypted_hash,
       iv=excluded.iv,tag=excluded.tag,version=1,updated_at=now()`,
      [sourceId,data.apiId,...h]
    );
    await client.query(
      `INSERT INTO telegram_session_credentials(source_id,encrypted_session,iv,tag,version)
       VALUES($1,$2,$3,$4,1) ON CONFLICT(source_id) DO UPDATE SET
       encrypted_session=excluded.encrypted_session,iv=excluded.iv,
       tag=excluded.tag,version=1,updated_at=now()`,
      [sourceId,...s]
    );
    await client.query("UPDATE content_sources SET enabled=false WHERE id=$1",[sourceId]);
    await client.query("UPDATE routes SET enabled=false WHERE source_id=$1",[sourceId]);
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'TELEGRAM_SECRET_ROTATED','SOURCE',$2)",
      [actorId,sourceId]
    );
    return true;
  });
}
export async function clearTelegramConnection(pool:Pool,sourceId:string,actorId:string):Promise<boolean>{
  return withinTransaction(pool,async client=>{
    const source=await client.query("SELECT id FROM content_sources WHERE id=$1::uuid FOR UPDATE",[sourceId]);
    if(source.rowCount!==1)return false;
    await client.query("DELETE FROM telegram_session_credentials WHERE source_id=$1",[sourceId]);
    await client.query("DELETE FROM telegram_api_credentials WHERE source_id=$1",[sourceId]);
    await client.query("UPDATE content_sources SET enabled=false WHERE id=$1",[sourceId]);
    await client.query("UPDATE routes SET enabled=false WHERE source_id=$1",[sourceId]);
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'TELEGRAM_SECRET_REVOKED','SOURCE',$2)",
      [actorId,sourceId]
    );
    return true;
  });
}
export async function storeMetaCredential(
  pool:Pool,destinationId:string,actorId:string,token:string,key:Buffer
):Promise<boolean>{
  const secret=checkedSecret(token,"Meta token",16000);
  const e=payload(secret,key,destinationId);
  return withinTransaction(pool,async client=>{
    const dest=await client.query("SELECT id FROM destinations WHERE id=$1::uuid FOR UPDATE",[destinationId]);
    if(dest.rowCount!==1)return false;
    await client.query(
      `UPDATE destinations SET
         credentials_ciphertext=$2,credentials_iv=$3,credentials_tag=$4,
         credentials_version=1,enabled=false WHERE id=$1`,[destinationId,...e]
    );
    await client.query(
      `UPDATE routes SET enabled=false WHERE id IN
       (SELECT route_id FROM route_destinations WHERE destination_id=$1)`,[destinationId]
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'META_SECRET_ROTATED','DESTINATION',$2)",
      [actorId,destinationId]
    );
    return true;
  });
}
export async function clearMetaCredential(pool:Pool,destinationId:string,actorId:string):Promise<boolean>{
  return withinTransaction(pool,async client=>{
    const dest=await client.query("SELECT id FROM destinations WHERE id=$1::uuid FOR UPDATE",[destinationId]);
    if(dest.rowCount!==1)return false;
    await client.query(
      `UPDATE destinations SET credentials_ciphertext=NULL,credentials_iv=NULL,
       credentials_tag=NULL,credentials_version=NULL,enabled=false WHERE id=$1`,[destinationId]
    );
    await client.query(
      "UPDATE routes SET enabled=false WHERE id IN (SELECT route_id FROM route_destinations WHERE destination_id=$1)",[destinationId]
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'META_SECRET_REVOKED','DESTINATION',$2)",
      [actorId,destinationId]
    );
    return true;
  });
}
/** For server-side workers only; do not expose this function through API. */
export async function readTelegramApiProfile(
  pool:Pool,sourceId:string,key:Buffer
):Promise<{apiId:number;apiHash:string}|null>{
  const result=await pool.query<{api_id:number;encrypted_hash:Buffer;iv:Buffer;tag:Buffer;version:number}>(
    "SELECT api_id,encrypted_hash,iv,tag,version FROM telegram_api_credentials WHERE source_id=$1",[sourceId]
  );
  const value=result.rows[0];
  if(!value)return null;
  if(value.version!==1)throw new Error("Unknown credential envelope");
  const envelope:SecretEnvelope={
    version:1,ciphertext:value.encrypted_hash.toString("base64"),
    iv:value.iv.toString("base64"),tag:value.tag.toString("base64")
  };
  return {apiId:value.api_id,apiHash:decryptSecret(envelope,key,"telegram-api:"+sourceId)};
}

/**
 * Atomic, verified-only source enrollment. Never creates an enabled route.
 * No half-registered channel can exist if credential encryption or SQL fails.
 */
export async function createVerifiedTelegramSource(
 pool:Pool,actorId:string,details:{
   slug:string;label:string;peerId:string;lastSeenMessageId:number|null;
   apiId:number;apiHash:string;sessionString:string;
 },key:Buffer
):Promise<{sourceId:string;routeId:string}>{
 if(!Number.isInteger(details.apiId)||details.apiId<1||details.apiId>2147483647)
   throw new RangeError("Invalid Telegram API ID");
 if(details.lastSeenMessageId!==null && (!Number.isSafeInteger(details.lastSeenMessageId)||details.lastSeenMessageId<=0))
   throw new RangeError("Invalid Telegram checkpoint");
 const apiHash=checkedSecret(details.apiHash,"Telegram API hash",512);
 const session=checkedSecret(details.sessionString,"Telegram session",16000);
 if(!/^-100[1-9][0-9]{4,18}$/.test(details.peerId))
   throw new RangeError("Invalid verified Telegram channel peer");
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(details.slug)||!details.label.trim())
   throw new RangeError("Invalid source details");
 return withinTransaction(pool,async client=>{
   const source=await client.query<{id:string}>(
     `INSERT INTO content_sources(kind,external_peer_id,label,enabled,last_indexed_message_id)
      VALUES('TELEGRAM',$1,$2,true,$3) RETURNING id`,
     [details.peerId,details.label.trim(),details.lastSeenMessageId]
   );
   const sourceId=source.rows[0]!.id;
   const route=await client.query<{id:string}>(
     "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,false) RETURNING id",
     [details.slug,sourceId]
   );
   const routeId=route.rows[0]!.id;
   const hash=payload(apiHash,key,"telegram-api:"+sourceId);
   const data=payload(session,key,"telegram:"+sourceId);
   await client.query(
     `INSERT INTO telegram_api_credentials(source_id,api_id,encrypted_hash,iv,tag,version)
      VALUES($1,$2,$3,$4,$5,1)`,[sourceId,details.apiId,...hash]
   );
   await client.query(
     `INSERT INTO telegram_session_credentials(source_id,encrypted_session,iv,tag,version)
      VALUES($1,$2,$3,$4,1)`,[sourceId,...data]
   );
   await client.query(
     `INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,details)
      VALUES($1,'TELEGRAM_CHANNEL_VERIFIED','SOURCE',$2,$3::jsonb)`,
     [actorId,sourceId,JSON.stringify({verifiedRead:true,startingAfter:details.lastSeenMessageId})]
   );
   return {sourceId,routeId};
 });
}
