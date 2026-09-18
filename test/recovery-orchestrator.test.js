import test from "node:test";
import assert from "node:assert/strict";
import {RecoveryOrchestrator} from "../src/core/recovery-orchestrator.js";
test("recovery orchestrator recovers expired queue work",async()=>{
 let called=0; const queue={recoverExpired:async()=>{called++;return 2}};
 const r=new RecoveryOrchestrator({queue,policy:{QUEUE_BACKLOG:"QUEUE_RECOVERY"}});
 const out=await r.handle({alertType:"QUEUE_BACKLOG",message:"backlog"});
 assert.equal(out.status,"QUEUE_RECOVERED"); assert.equal(called,1);
});
test("recovery orchestrator queues repair work",async()=>{
 const queue={enqueue:async x=>({id:"job_repair",...x})};
 const r=new RecoveryOrchestrator({queue,policy:{HIGH_FAILURE_RATE:"REPAIR"}});
 const out=await r.handle({alertType:"HIGH_FAILURE_RATE",message:"failures"});
 assert.equal(out.status,"REPAIR_QUEUED"); assert.equal(out.jobId,"job_repair");
});
