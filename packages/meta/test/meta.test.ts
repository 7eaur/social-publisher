import test from "node:test";
import assert from "node:assert/strict";
import {FacebookPagePublisher} from "../src/facebook.ts";
import {InstagramPublisher} from "../src/instagram.ts";
import {MetaGraphClient,UnknownRemoteOutcome,DefinitiveRemoteRejection} from "../src/graph.ts";

test("Facebook post uses bearer auth without putting token in URL",async()=>{
 let seen=0;
 const client=new MetaGraphClient({version:"v24.0",fetcher:async(url,init)=>{
   seen++;
   assert.ok(String(url).endsWith("/123/feed"));
   assert.equal((init?.headers as Record<string,string>).authorization,"Bearer TEST");
   assert.equal(String(url).includes("TEST"),false);
   assert.match(String(init?.body),/message=Hello/);
   return new Response(JSON.stringify({id:"789"}),{status:200});
 }});
 const fb=new FacebookPagePublisher(client,"cdn.example.test");
 assert.equal(await fb.publishText("123","TEST","Hello"),"789");
 assert.equal(seen,1);
 await assert.rejects(fb.publishImage("123","TEST","http://127.0.0.1/x","test"));
});
test("Instagram container must be ready before explicit final publish",async()=>{
 let writes=0;
 const fetcher:typeof fetch=async(url,init)=>{
   const path=new URL(String(url)).pathname;
   if(path.endsWith("/media")){writes++;return new Response(JSON.stringify({id:"700"}));}
   if(path.endsWith("/700"))return new Response(JSON.stringify({status_code:"FINISHED"}));
   if(path.endsWith("/media_publish")){writes++;return new Response(JSON.stringify({id:"701"}));}
   return new Response("{}",{status:404});
 };
 const ig=new InstagramPublisher(new MetaGraphClient({version:"v24.0",fetcher}),"cdn.example.test");
 const container=await ig.createImageContainer("123","TEST","https://cdn.example.test/photo.jpg","caption");
 assert.equal(container,"700");
 assert.equal(await ig.publishPreparedContainer("123","TEST",container),"701");
 assert.equal(writes,2);
});
test("ambiguous write errors must not be retried as definitive failures",async()=>{
 const client=new MetaGraphClient({version:"v24.0",fetcher:async()=>{throw new Error("timeout");}});
 const fb=new FacebookPagePublisher(client,"cdn.example.test");
 await assert.rejects(fb.publishText("123","TEST","Hello"),UnknownRemoteOutcome);
 const noAccess=new MetaGraphClient({version:"v24.0",fetcher:async()=>new Response("{}",{status:403})});
 await assert.rejects(new FacebookPagePublisher(noAccess,"cdn.example.test").publishText("123","TEST","hi"),DefinitiveRemoteRejection);
});
