import test from "node:test";
import assert from "node:assert/strict";
import {classify,validatePage} from "../src/normalize.ts";
import type {TelegramUnit} from "../src/types.ts";

const item:TelegramUnit={
 canonicalMessageId:10,highestMessageId:12,groupedId:"g1",caption:"Original caption",
 timestamp:new Date("2026-10-17T00:00:00Z"),
 media:[{kind:"IMAGE",telegramMessageId:10,fileId:"a"},{kind:"VIDEO",telegramMessageId:12,fileId:"b"}]
};
test("classification preserves mixed albums instead of dropping media",()=>{
 assert.equal(classify(item),"MIXED_ALBUM");
 assert.equal(classify({...item,media:[]}),"TEXT");
 assert.equal(classify({...item,media:[item.media[0]!] }),"IMAGE");
});
test("a complete ordered album page advances checkpoint safely",()=>{
 assert.doesNotThrow(()=>validatePage([item],0,12));
});
test("overlaps, malformed and skipped empty pages are rejected",()=>{
 assert.throws(()=>validatePage([item,item],0,12),RangeError);
 assert.throws(()=>validatePage([],0,12),RangeError);
 assert.throws(()=>validatePage([item],0,11),RangeError);
 assert.throws(()=>validatePage([{...item,media:[item.media[0]!,item.media[0]!]}],0,12),RangeError);
});
