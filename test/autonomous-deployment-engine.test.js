import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDeploymentState,validateDeploymentCandidate,buildDeploymentPlan,
  runAutonomousDeployment,loadDeploymentState,loadDeploymentHistory,
  rollbackAutonomousDeployment
} from "../src/core/autonomous-deployment-engine.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-deploy-"))}

test("deployment candidate and plan are gated",()=>{
  assert.equal(validateDeploymentCandidate({version:"1",path:"dist"}).valid,true);
  assert.equal(validateDeploymentCandidate({version:"1"}).valid,false);
  const plan=buildDeploymentPlan({candidate:{version:"1",path:"dist"}});
  assert.deepEqual(plan.gates,["candidate-valid","deployment-created","health-check","rollback-capable","promotion-recorded"]);
});

test("deploys only after health passes and persists state",async()=>{
  const root=await temp();
  let deployed=false;
  const adapter={
    async deploy(candidate){deployed=true;return {ref:"v1",url:"https://example.test",candidate}},
    async rollback(){return {ok:true}}
  };
  const healthCheck={async check(){return {passed:true,status:200}}};
  const result=await runAutonomousDeployment(root,{
    candidate:{version:"v1",path:"dist"},
    adapter,healthCheck
  });
  assert.equal(deployed,true);
  assert.equal(result.status,"DEPLOYED");
  assert.equal((await loadDeploymentState(root)).state,"DEPLOYED");
  assert.ok((await loadDeploymentHistory(root)).length>=2);
  await fs.rm(root,{recursive:true,force:true});
});

test("automatically rolls back unhealthy deployment",async()=>{
  const root=await temp();
  let rolledBack=false;
  const adapter={
    async deploy(){return {ref:"v2"}},
    async rollback(ref){rolledBack=ref==="v2";return {ok:true,ref}}
  };
  const result=await runAutonomousDeployment(root,{
    candidate:{version:"v2",path:"dist"},
    adapter,
    healthCheck:{async check(){return {passed:false,status:500}}}
  });
  assert.equal(result.status,"ROLLED_BACK");
  assert.equal(rolledBack,true);
  assert.equal((await loadDeploymentState(root)).state,"ROLLED_BACK");
  await fs.rm(root,{recursive:true,force:true});
});

test("manual rollback persists rollback state",async()=>{
  const root=await temp();
  const result=await rollbackAutonomousDeployment(root,{
    ref:"v3",
    adapter:{async rollback(ref){return {ok:true,ref}}}
  });
  assert.equal(result.status,"ROLLED_BACK");
  assert.equal((await loadDeploymentState(root)).state,"ROLLED_BACK");
  await fs.rm(root,{recursive:true,force:true});
});
