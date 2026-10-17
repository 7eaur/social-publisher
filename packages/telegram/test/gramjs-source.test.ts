import test from "node:test";
import assert from "node:assert/strict";
import {GramJsSourceAdapter,type GramJsMessageClient} from "../src/gramjs-source.ts";
test("authorized GramJS messages normalize without a real Telegram session",async()=>{
 const fixture:GramJsMessageClient={
   async *iterMessages(peer,opts){
     assert.equal(peer,"approved-private");
     assert.equal(opts.minId,2);
     assert.equal(opts.reverse,true);
     yield {id:3,date:1792238400,photo:{},groupedId:{toString:()=>"abc"},message:"Description"};
     yield {id:4,date:1792238400,document:{mimeType:"video/mp4"},groupedId:{toString:()=>"abc"}};
   }
 };
 const adapter=new GramJsSourceAdapter(fixture,"approved-private");
 const items=await adapter.fetchAfter("approved-private",2,10);
 assert.deepEqual(items.map(m=>m.kind),["IMAGE","VIDEO"]);
 assert.equal(items[0]?.groupId,"abc");
 assert.equal(items[0]?.text,"Description");
 await assert.rejects(adapter.fetchAfter("other-peer",2,10),/not authorized/);
});
test("misordered source adapter messages fail closed",async()=>{
 const invalid:GramJsMessageClient={
   async *iterMessages(){yield {id:3,date:1792238400};yield {id:2,date:1792238400};}
 };
 await assert.rejects(new GramJsSourceAdapter(invalid,"private").fetchAfter("private",1,5));
});
