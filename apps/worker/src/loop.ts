import type {Pool} from "pg";
import {scheduleDueRoutes} from "../../../packages/database/src/schedule-engine.ts";
import {quarantineExpiredClaims} from "../../../packages/database/src/outbox.ts";

export interface WorkerTickSummary {
 readonly scheduled:number;
 readonly destinationJobs:number;
 readonly quarantined:number;
}
export async function offlineWorkerTick(pool:Pool):Promise<WorkerTickSummary>{
 const quarantined=await quarantineExpiredClaims(pool);
 const queued=await scheduleDueRoutes(pool);
 return {scheduled:queued.claimed,destinationJobs:queued.destinationJobs,quarantined};
}
export interface TickLoop {readonly stop:()=>Promise<void>;}
export function startTickLoop(
 tick:()=>Promise<unknown>, intervalMs=60000,
 onFailure:(error:unknown)=>void=()=>{}
):TickLoop{
 if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>3600000){
   throw new RangeError("Invalid worker polling interval");
 }
 let stopped=false;
 let timer:NodeJS.Timeout|null=null;
 let current:Promise<void>|null=null;
 const run=()=>{
   if(stopped)return;
   current=(async()=>{
     try{await tick();}catch(error){onFailure(error);}
   })().finally(()=>{
     current=null;
     if(!stopped)timer=setTimeout(run,intervalMs);
   });
 };
 run();
 return {stop:async()=>{
   stopped=true;
   if(timer)clearTimeout(timer);
   if(current)await current;
 }};
}
