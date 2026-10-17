import test from "node:test";
import assert from "node:assert/strict";
import {startTickLoop} from "../src/loop.ts";

test("invalid poll interval is rejected",()=>{
 assert.throws(()=>startTickLoop(async()=>{},200),RangeError);
});
test("stopping waits for current tick",async()=>{
 let completed=0;
 let release:()=>void=()=>{};
 const latch=new Promise<void>(resolve=>{release=resolve;});
 const loop=startTickLoop(async()=>{await latch;completed++;},1000);
 const stopping=loop.stop();
 release();
 await stopping;
 assert.equal(completed,1);
});
