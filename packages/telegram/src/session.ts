import type {Pool} from "pg";
import {encryptSecret,decryptSecret,type SecretEnvelope} from "../../security/src/secrets.ts";

/** Telegram session strings are FULL account credentials. Store encrypted only. */
export async function saveTelegramSession(
 pool:Pool,sourceId:string,session:string,key:Buffer
):Promise<void>{
 if(!session || session.length>16000)throw new RangeError("Invalid Telegram session");
 const encrypted=encryptSecret(session,key,"telegram:"+sourceId);
 await pool.query(
   `INSERT INTO telegram_session_credentials(source_id,encrypted_session,iv,tag,version)
    VALUES($1,$2,$3,$4,1)
    ON CONFLICT(source_id) DO UPDATE SET
      encrypted_session=excluded.encrypted_session,
      iv=excluded.iv,tag=excluded.tag,version=1,updated_at=now()`,
   [sourceId,Buffer.from(encrypted.ciphertext,"base64"),
    Buffer.from(encrypted.iv,"base64"),Buffer.from(encrypted.tag,"base64")]
 );
}
export async function readTelegramSession(
 pool:Pool,sourceId:string,key:Buffer
):Promise<string|null>{
 const row=await pool.query<{encrypted_session:Buffer;iv:Buffer;tag:Buffer;version:number}>(
   "SELECT encrypted_session,iv,tag,version FROM telegram_session_credentials WHERE source_id=$1",
   [sourceId]
 );
 const entry=row.rows[0];
 if(!entry)return null;
 if(entry.version!==1)throw new Error("Unsupported session envelope");
 const envelope:SecretEnvelope={
   version:1,
   ciphertext:entry.encrypted_session.toString("base64"),
   iv:entry.iv.toString("base64"),
   tag:entry.tag.toString("base64")
 };
 return decryptSecret(envelope,key,"telegram:"+sourceId);
}
