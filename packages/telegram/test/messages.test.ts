import test from "node:test";
import assert from "node:assert/strict";
import {groupTelegramMessages,type TelegramMessage} from "../src/messages.ts";
import {validateHistoryPage} from "../src/port.ts";
const date=new Date("2026-10-17T00:00:00Z");
const m=(id:number,kind:TelegramMessage["kind"],groupId:string|null=null,text=""):TelegramMessage=>
  ({id,kind,groupId,text,sentAt:date});
test("albums are grouped; captions preserved and mixed types explicitly flagged",()=>{
 const grouped=groupTelegramMessages([m(4,"VIDEO","g"),m(3,"IMAGE","g","Caption"),m(1,"TEXT")]);
 assert.equal(grouped.length,2);
 assert.deepEqual(grouped[1]?.messageIds,[3,4]);
 assert.equal(grouped[1]?.kind,"MIXED_ALBUM");
 assert.equal(grouped[1]?.caption,"Caption");
});
test("source history must be ordered after checkpoint",()=>{
 assert.doesNotThrow(()=>validateHistoryPage([m(2,"IMAGE"),m(3,"TEXT")],1,100));
 assert.throws(()=>validateHistoryPage([m(3,"IMAGE"),m(2,"TEXT")],1,100));
 assert.throws(()=>validateHistoryPage([m(2,"IMAGE"),m(2,"TEXT")],1,100));
 assert.throws(()=>validateHistoryPage([m(1,"IMAGE")],1,100));
});
test("duplicate ids and out-of-range records are rejected",()=>{
 assert.throws(()=>groupTelegramMessages([m(4,"TEXT"),m(4,"IMAGE")]));
 assert.throws(()=>groupTelegramMessages([m(-1,"TEXT")]),RangeError);
 assert.throws(()=>validateHistoryPage([m(4,"TEXT")],0,0));
});
