import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createWorkerState,validateWorkerState,runAutonomousWorker,
  loadWorkerState,loadWorkerHistory
} from "../src/core/autonomous-project-worker.js";
import {initializeMissionManager,loadMissionState} from "../src/core/mission-manager-engine.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-worker-"))}

test("creates and validates persistent worker state",()=>{
  const state=createWorkerState({root:"/tmp/jora",command:"Build app",maxCycles:3,intervalMs:0});
  assert.equal(state.status,"READY");
  assert.equal(validateWorkerState(state).valid,true);
});

test("runs mission cycles and persists worker history",async()=>{
  const root=await temp();
  await initializeMissionManager(root,{command:"Build app"});
  const result=await runAutonomousWorker(root,{
    command:"Build app",
    intervalMs:0,
    maxCycles:1,
    missionExecutor:async({mission})=>({status:"DONE",complete:true,summary:"Completed "+mission.id})
  });
  assert.equal(result.status,"STOPPED");
  assert.equal(result.state.cycle,1);
  const missions=await loadMissionState(root);
  assert.equal(missions.missions.find(m=>m.id==="M001").status,"completed");
  const worker=await loadWorkerState(root);
  const history=await loadWorkerHistory(root);
  assert.equal(worker.cycle,1);
  assert.ok(history.some(x=>x.event==="mission-cycle-complete"));
  await fs.rm(root,{recursive:true,force:true});
});

test("worker preserves mission when no executor is supplied",async()=>{
  const root=await temp();
  await initializeMissionManager(root,{command:"Build app"});
  const result=await runAutonomousWorker(root,{intervalMs:0,maxCycles:1});
  assert.equal(result.status,"STOPPED");
  const missions=await loadMissionState(root);
  assert.equal(missions.missions.find(m=>m.id==="M001").status,"running");
  await fs.rm(root,{recursive:true,force:true});
});
