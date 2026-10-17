import type {Pool} from "pg";
import {readTelegramSession} from "./session.ts";
import {GramJsSourceAdapter} from "./gramjs-source.ts";
import type {TelegramHistoryPort} from "./port.ts";
import {TelegramClient} from "teleproto";
import {StringSession} from "teleproto/sessions";

export interface ConnectedTelegramSource {
 readonly history:TelegramHistoryPort;
 readonly close:()=>Promise<void>;
}
/**
 * Reuses an already-authorized encrypted user session. No interactive auth,
 * phone codes or channel discovery is performed here.
 */
export async function connectConfiguredSource(
 pool:Pool,sourceId:string,sessionKey:Buffer,apiId:number,apiHash:string
):Promise<ConnectedTelegramSource>{
 if(!Number.isSafeInteger(apiId)||apiId<=0||!apiHash.trim()){
   throw new Error("Telegram API ID/hash not configured");
 }
 const record=await pool.query<{external_peer_id:string}>(
   "SELECT external_peer_id FROM content_sources WHERE id=$1 AND enabled=true",[sourceId]
 );
 const peer=record.rows[0]?.external_peer_id;
 if(!peer)throw new Error("Telegram channel is not enabled");
 const rawSession=await readTelegramSession(pool,sourceId,sessionKey);
 if(!rawSession)throw new Error("Telegram session not configured");
 const client=new TelegramClient(new StringSession(rawSession),apiId,apiHash,{
   connectionRetries:3
 });
 try{
   await client.connect();
   const identity=await client.getMe();
   if(!identity)throw new Error("Telegram user session is not authorized");
   const adapter=new GramJsSourceAdapter(
     client as unknown as ConstructorParameters<typeof GramJsSourceAdapter>[0],peer
   );
   return {history:adapter,close:async()=>{await client.disconnect();}};
 }catch(error){
   await client.disconnect().catch(()=>{});
   throw new Error("Telegram session connection failed", {cause:error});
 }
}
