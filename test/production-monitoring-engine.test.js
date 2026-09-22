import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createProductionMonitorState,validateMonitorConfig,buildProductionAlert,
  runProductionMonitorCycle,loadProductionMonitorState,loadProductionMonitorHistory
} from "../src/core/production-monitoring-engine.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-monitor-"))}

test("validates monitor configuration and alerts",()=>{
  assert.equal(validateMonitorConfig({url:"https://example.test",probe:async()=>({passed:true})}).valid,true);
  assert.equal(validateMonitorConfig({url:""}).valid,false);
  assert.equal(buildProductionAlert({passed:false,status:503},{failureThreshold:2,consecutiveFailures:1}).severity,"CRITICAL");
  assert.equal(buildProductionAlert({passed:true,latencyMs:7000},{latencyThresholdMs:5000}).alertType,"DEPLOYED_SERVICE_SLOW");
});

test("healthy cycle clears active incidents and persists state",async()=>{
  const root=await temp();
  const result=await runProductionMonitorCycle(root,{
    url:"https://example.test",
    probe:async()=>({passed:true,status:200,latencyMs:20})
  });
  assert.equal(result.status,"HEALTHY");
  assert.equal((await loadProductionMonitorState(root)).lastHealthyAt!==null,true);
  assert.ok((await loadProductionMonitorHistory(root)).length>=1);
  await fs.rm(root,{recursive:true,force:true});
});

test("repeated unhealthy cycles trigger recovery and resolve incident",async()=>{
  const root=await temp();
  const incidents=[];
  const incidentManager={
    async open(alert){const i={id:"inc-1",status:"OPEN",alertType:alert.alertType};incidents.push(i);return i},
    async startRecovery(){return null},
    async resolve(id,result){incidents[0].status="RESOLVED";incidents[0].result=result;},
    async failRecovery(){return null}
  };
  let calls=0;
  const probe=async()=>({passed:false,status:503,error:"down"});
  const recovery={async repair(){calls++;return {status:"RECOVERED"}}};
  let state=createProductionMonitorState({root,url:"https://example.test"});
  const first=await runProductionMonitorCycle(root,{url:"https://example.test",probe,incidentManager,recovery,failureThreshold:2,state});
  const second=await runProductionMonitorCycle(root,{url:"https://example.test",probe,incidentManager,recovery,failureThreshold:2,state:first.state});
  assert.equal(first.status,"UNHEALTHY");
  assert.equal(second.status,"RECOVERED");
  assert.equal(calls,1);
  assert.equal(incidents[0].status,"RESOLVED");
  await fs.rm(root,{recursive:true,force:true});
});
