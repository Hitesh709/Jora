import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  decomposeMission,getReadyMissions,selectNextMission,initializeMissionManager,
  startNextMission,completeMission,failMission,loadMissionState,validateMissionState
} from "../src/core/mission-manager-engine.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-mission-"))}

test("decomposes a large goal into dependent missions",()=>{
  const missions=decomposeMission("Build a game",{features:["gameplay","leaderboard"]});
  assert.ok(missions.length>=5);
  assert.equal(missions[0].id,"M001");
  assert.ok(missions.some(m=>m.feature==="leaderboard"));
  assert.ok(missions.every(m=>Array.isArray(m.dependencies)));
});

test("selects only dependency-ready missions",()=>{
  const state={missions:[
    {id:"M1",status:"completed",dependencies:[],priority:1},
    {id:"M2",status:"planned",dependencies:["M1"],priority:5},
    {id:"M3",status:"planned",dependencies:["M9"],priority:100}
  ]};
  assert.equal(selectNextMission(state).id,"M2");
  assert.equal(getReadyMissions(state).length,1);
});

test("persists mission checkpoints and resumes the next mission",async()=>{
  const root=await temp();
  const init=await initializeMissionManager(root,{command:"Build app",contract:{features:["search"]},features:["search"]});
  assert.equal(init.status,"MISSION_STATE_RECORDED");
  const started=await startNextMission(root);
  assert.equal(started.state.currentMissionId,"M001");
  const done=await completeMission(root,"M001",{summary:"Requirements completed"});
  assert.notEqual(done.state.currentMissionId,"M001");
  assert.equal(done.state.missions.find(m=>m.id==="M001").status,"completed");
  assert.ok(done.state.checkpoint);
  const persisted=await loadMissionState(root);
  assert.equal(persisted.missions.find(m=>m.id==="M001").status,"completed");
  await fs.rm(root,{recursive:true,force:true});
});

test("records failure and supports retryable mission state",async()=>{
  const root=await temp();
  await initializeMissionManager(root,{command:"Build app"});
  await startNextMission(root);
  const failed=await failMission(root,"M001",{error:"temporary failure",retryable:true});
  const mission=failed.state.missions.find(m=>m.id==="M001");
  assert.equal(mission.status,"failed");
  assert.equal(mission.attempts,1);
  assert.equal(validateMissionState(failed.state).valid,true);
  await fs.rm(root,{recursive:true,force:true});
});
