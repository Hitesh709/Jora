import test from "node:test";
import assert from "node:assert/strict";
import {OperationalHealthMonitor} from "../src/core/operational-health-monitor.js";
test("health monitor detects high execution failure rate",async()=>{
 const metrics={snapshot:()=>({health:{executionFailureRate:0.8},counters:{jora_executions_total:5},histograms:{},gauges:{}})};
 const seen=[]; const m=new OperationalHealthMonitor({metrics,thresholds:{failureRate:0.5},onAlert:a=>seen.push(a)});
 const r=await m.check(); assert.equal(r.healthy,false); assert.equal(seen[0].alertType,"HIGH_FAILURE_RATE");
});
test("health monitor detects queue backlog",async()=>{
 const metrics={snapshot:()=>({health:{executionFailureRate:0},counters:{},histograms:{},gauges:{}})};
 const queue={list:async()=>Array.from({length:3},(_,i)=>({id:String(i)}))};
 const m=new OperationalHealthMonitor({metrics,queue,thresholds:{queueDepth:2}});
 const r=await m.check(); assert.equal(r.alerts[0].alertType,"QUEUE_BACKLOG");
});
