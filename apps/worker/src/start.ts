import {createDatabasePool} from "../../../packages/database/src/pool.ts";
import {offlineWorkerTick,startTickLoop} from "./loop.ts";

if(process.env.LIVE_PUBLISHING_ENABLED==="true"){
  throw new Error("Live publishing is locked until account configuration and validation");
}
const pool=createDatabasePool();
const worker=startTickLoop(async()=>{
  const result=await offlineWorkerTick(pool);
  if(result.scheduled || result.quarantined){
    console.info("Queue status",{
      queued:result.destinationJobs,
      scheduled:result.scheduled,
      quarantined:result.quarantined
    });
  }
},60000,()=>{console.error("Worker tick failed");});
const shutdown=()=>{void worker.stop().then(()=>pool.end());};
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
