import type {TelegramHistoryPort} from "./port.ts";
import {validateHistoryPage} from "./port.ts";
import type {TelegramMessage} from "./messages.ts";

/** Minimal public surface of an ALREADY-authorized GramJS client. No login here. */
export interface GramJsMessage {
 readonly id:number;
 readonly message?:string;
 readonly date?:number|Date;
 readonly groupedId?:{toString():string}|null;
 readonly photo?:unknown;
 readonly video?:unknown;
 readonly document?:{mimeType?:string}|null;
}
export interface GramJsMessageClient {
 iterMessages(peer:string, options:{readonly minId:number;readonly reverse:true;readonly limit:number}):AsyncIterable<GramJsMessage>;
}

/**
 * A read-only adapter for ONE permitted private channel.
 * Session authentication and private channel resolution are deferred to the
 * explicit setup step; this adapter cannot inspect other channels.
 */
export class GramJsSourceAdapter implements TelegramHistoryPort {
 private readonly client:GramJsMessageClient;
 private readonly allowedPeer:string;
 constructor(client:GramJsMessageClient,allowedPeer:string){
   if(!allowedPeer.trim())throw new RangeError("Approved Telegram peer is required");
   this.client=client;
   this.allowedPeer=allowedPeer;
 }
 async fetchAfter(peer:string,after:number,limit:number):Promise<readonly TelegramMessage[]>{
   if(peer!==this.allowedPeer)throw new Error("Telegram peer not authorized for this adapter");
   if(!Number.isSafeInteger(after)||after<0 || !Number.isSafeInteger(limit)||limit<1||limit>100){
     throw new RangeError("Invalid history pagination");
   }
   const mapped:TelegramMessage[]=[];
   for await(const raw of this.client.iterMessages(peer,{minId:after,reverse:true,limit})){
     if(!Number.isSafeInteger(raw.id)||raw.id<=0)throw new Error("Invalid Telegram message ID");
     let kind:TelegramMessage["kind"]="TEXT";
     if(raw.video || raw.document?.mimeType?.startsWith("video/"))kind="VIDEO";
     else if(raw.photo || raw.document?.mimeType?.startsWith("image/"))kind="IMAGE";
     const epoch=raw.date instanceof Date?raw.date:
       typeof raw.date==="number"?new Date(raw.date*1000):new Date(NaN);
     mapped.push({
       id:raw.id,
       kind,
       text:raw.message??"",
       sentAt:epoch,
       groupId:raw.groupedId?.toString()??null
     });
   }
   validateHistoryPage(mapped,after,limit);
   return mapped;
 }
}
