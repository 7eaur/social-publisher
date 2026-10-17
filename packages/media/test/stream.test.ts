import test from "node:test";
import assert from "node:assert/strict";
import {boundedMediaStream} from "../src/stream.ts";
const chunks=async function*(...buffers:Uint8Array[]){yield* buffers;};
test("bounded streaming preserves chunks without buffering whole media",async()=>{
 const bytes:Uint8Array[]=[];
 for await(const chunk of boundedMediaStream(chunks(new Uint8Array([1,2]),new Uint8Array([3])),
   {mime:"image/jpeg",maxBytes:3}))bytes.push(chunk);
 assert.deepEqual(bytes.map(x=>[...x]),[[1,2],[3]]);
});
test("large media, empty payload, unsupported MIME fail closed",async()=>{
 await assert.rejects(async()=>{
   for await(const _ of boundedMediaStream(chunks(new Uint8Array([1,2,3])),
     {mime:"video/mp4",maxBytes:2})){}
 });
 await assert.rejects(async()=>{
   for await(const _ of boundedMediaStream(chunks(),{mime:"image/png",maxBytes:2})){}
 });
 await assert.rejects(async()=>{
   for await(const _ of boundedMediaStream(chunks(new Uint8Array([1])),
     {mime:"application/octet-stream" as "image/jpeg",maxBytes:2})){}
 });
});
