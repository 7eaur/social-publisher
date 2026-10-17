import type {Pool} from "pg";
import {withinTransaction} from "../../../packages/database/src/pool.ts";
import {encryptSecret,decryptSecret,type SecretEnvelope} from "../../../packages/security/src/secrets.ts";

export const integrationNames = [
  "META_APP_ID","META_APP_SECRET","STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY","STORAGE_BUCKET","STORAGE_REGION",
  "STORAGE_ENDPOINT","STORAGE_PUBLIC_HOST"
] as const;
export type IntegrationSecretName = typeof integrationNames[number];
export function isIntegrationName(name:string):name is IntegrationSecretName {
  return (integrationNames as readonly string[]).includes(name);
}
export async function readIntegrationStatus(pool:Pool){
  const found=await pool.query<{name:string}>("SELECT name FROM integration_vault");
  const names=new Set(found.rows.map(x=>x.name));
  return integrationNames.map(name=>({name,configured:names.has(name)}));
}
export async function setIntegrationSecret(
  pool:Pool,name:IntegrationSecretName,value:string,key:Buffer,actorId:string
):Promise<void>{
  if (typeof value!=="string" || !value.trim() || Buffer.byteLength(value,"utf8")>8192) {
    throw new RangeError("Invalid integration configuration value");
  }
  const secure=encryptSecret(value,key,"integration:"+name);
  await withinTransaction(pool,async client=>{
    await client.query(
      `INSERT INTO integration_vault(name,encrypted_value,iv,tag,version)
       VALUES($1,$2,$3,$4,1) ON CONFLICT(name) DO UPDATE SET
       encrypted_value=excluded.encrypted_value,iv=excluded.iv,tag=excluded.tag,
       version=1,updated_at=now()`,
      [name,Buffer.from(secure.ciphertext,"base64"),Buffer.from(secure.iv,"base64"),
       Buffer.from(secure.tag,"base64")]
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'INTEGRATION_SECRET_ROTATED','INTEGRATION',$2)",
      [actorId,name]
    );
  });
}
export async function revokeIntegrationSecret(
  pool:Pool,name:IntegrationSecretName,actorId:string
):Promise<void>{
  await withinTransaction(pool,async client=>{
    await client.query("DELETE FROM integration_vault WHERE name=$1",[name]);
    await client.query(
      "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'INTEGRATION_SECRET_REVOKED','INTEGRATION',$2)",
      [actorId,name]
    );
  });
}
export async function readIntegrationSecret(
  pool:Pool,name:IntegrationSecretName,key:Buffer
):Promise<string|null>{
  const found=await pool.query<{encrypted_value:Buffer;iv:Buffer;tag:Buffer;version:number}>(
    "SELECT encrypted_value,iv,tag,version FROM integration_vault WHERE name=$1",[name]
  );
  const item=found.rows[0];
  if(!item)return null;
  if(item.version!==1)throw new Error("Unknown vault envelope");
  const value:SecretEnvelope={version:1,ciphertext:item.encrypted_value.toString("base64"),
    iv:item.iv.toString("base64"),tag:item.tag.toString("base64")};
  return decryptSecret(value,key,"integration:"+name);
}
