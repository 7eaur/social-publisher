import type { ContentKind } from "../../core/src/platform-policy.ts";

/** Source-neutral shape. Telegram API mapping belongs to its own adapter. */
export interface TelegramMessage {
 readonly id: number;
 readonly kind: "TEXT" | "IMAGE" | "VIDEO";
 readonly text: string;
 readonly sentAt: Date;
 readonly groupId: string | null;
}
export interface IndexedItem {
 readonly canonicalId: number;
 readonly messageIds: readonly number[];
 readonly groupId: string | null;
 readonly kind: ContentKind;
 readonly caption: string | null;
 readonly sentAt: Date;
}
export function groupTelegramMessages(messages: readonly TelegramMessage[]): IndexedItem[] {
 const ids = new Set<number>();
 const sorted = [...messages].sort((a,b)=>a.id-b.id);
 for(const m of sorted){
   if(!Number.isSafeInteger(m.id)||m.id<=0||Number.isNaN(m.sentAt.getTime()))
     throw new RangeError("Invalid message");
   if(ids.has(m.id)) throw new Error("Duplicate telegram message ID in batch");
   ids.add(m.id);
 }
 const groups=new Map<string,TelegramMessage[]>();
 for(const m of sorted){
   const key=m.groupId ? "album:"+m.groupId : "single:"+m.id;
   const list=groups.get(key)??[];
   list.push(m); groups.set(key,list);
 }
 return [...groups.values()].map(list=>{
   const first=list[0]!;
   const countImages=list.filter(m=>m.kind==="IMAGE").length;
   const countVideos=list.filter(m=>m.kind==="VIDEO").length;
   const kind:ContentKind=list.length===1 ? first.kind :
     countImages&&countVideos ? "MIXED_ALBUM" :
     countImages ? "IMAGE_ALBUM" : countVideos ? "VIDEO_ALBUM" : "TEXT";
   return {canonicalId:first.id,messageIds:list.map(m=>m.id),
     groupId:first.groupId,kind,caption:list.map(m=>m.text).find(s=>s.trim().length>0)??null,
     sentAt:first.sentAt};
 });
}
