import type { TelegramMessage } from "./messages.ts";
/**
 * An authorized source adapter must never read from any channel other than
 * the explicitly configured and verified source identity.
 */
export interface TelegramHistoryPort {
 fetchAfter(sourcePeer: string, afterMessageId: number, limit: number): Promise<readonly TelegramMessage[]>;
}
export function validateHistoryPage(
 page:readonly TelegramMessage[], after:number, max:number
):void{
 if(page.length>max) throw new Error("History page limit exceeded");
 let previous=after;
 for(const message of page){
   if(!Number.isSafeInteger(message.id)||message.id<=previous){
     throw new Error("History page not strictly ascending after checkpoint");
   }
   if(!["TEXT","IMAGE","VIDEO"].includes(message.kind) ||
       !(message.sentAt instanceof Date) || Number.isNaN(message.sentAt.getTime())){
     throw new Error("Invalid Telegram history metadata");
   }
   if(message.groupId!==null && (!message.groupId.trim()||message.groupId.length>150)){
     throw new Error("Invalid Telegram album ID");
   }
   previous=message.id;
 }
}
