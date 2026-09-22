import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPortfolioState,registerPortfolioProject,rankPortfolioProjects,buildPortfolioPlan,
  createResourceSchedulerState,enqueueResourceTask,allocateResourceTasks,
  createGovernanceState,evaluateAutonomyAction,
  buildProjectIntelligence,
  buildAutonomousCommandCenter,buildAutonomousEnterpriseState
} from "../src/index.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-45-"));}

test("portfolio registers and prioritizes projects",()=>{
  let state=createPortfolioState({root:"/tmp/jora"});
  state=registerPortfolioProject(state,{id:"p1",name:"Alpha",priority:20});
  state=registerPortfolioProject(state,{id:"p2",name:"Beta",priority:90});
  assert.equal(rankPortfolioProjects(state)[0].id,"p2");
  assert.equal(buildPortfolioPlan({...state,capacity:{workers:1}}).assignments[0].projectId,"p2");
});

test("resource scheduler allocates bounded worker capacity",()=>{
  let state=createResourceSchedulerState({root:"/tmp/jora",workers:1});
  state=enqueueResourceTask(state,{id:"t1",projectId:"p1",priority:10});
  state=enqueueResourceTask(state,{id:"t2",projectId:"p2",priority:90});
  const next=allocateResourceTasks(state);
  assert.equal(next.leases.length,1);
  assert.equal(next.leases[0].taskId,"t2");
  assert.equal(next.queue.length,1);
});

test("governance blocks unsafe autonomous actions",()=>{
  const state=createGovernanceState({root:"/tmp/jora"});
  const blocked=evaluateAutonomyAction(state,{action:"deploy",verificationPassed:false,rollbackAvailable:true});
  assert.equal(blocked.allowed,false);
  const allowed=evaluateAutonomyAction(state,{action:"deploy",verificationPassed:true,rollbackAvailable:true,files:["src/index.js"]});
  assert.equal(allowed.allowed,true);
});

test("project intelligence derives health and risk from evidence",()=>{
  const report=buildProjectIntelligence({workspaceTests:{passed:false},browserVerification:{status:"BROWSER_FAILED",verified:false},interactions:{status:"INTERACTION_FAILED",verified:false},missionState:{missions:[{status:"completed"},{status:"running"}]},deploymentState:{state:"ROLLED_BACK"}});
  assert.equal(report.signals.health,"unhealthy");
  assert.equal(report.signals.risk,"high");
  assert.ok(report.observations.length>0);
});

test("command center aggregates persisted portfolio state",async()=>{
  const root=await temp();
  await fs.mkdir(path.join(root,".jora"),{recursive:true});
  await fs.writeFile(path.join(root,".jora","project-portfolio.json"),JSON.stringify({projects:[{id:"p1",name:"Alpha",status:"active",priority:80,health:"healthy",missionStatus:"running"}],capacity:{workers:1}}));
  await fs.writeFile(path.join(root,".jora","resource-scheduler.json"),JSON.stringify({workers:1,queue:[{id:"t1"}],leases:[]}));
  await fs.writeFile(path.join(root,".jora","autonomy-governance.json"),JSON.stringify({mode:"guarded",decisions:[]}));
  await fs.writeFile(path.join(root,".jora","project-intelligence.json"),JSON.stringify({signals:{health:"healthy",risk:"low",progress:50}}));
  const center=await buildAutonomousCommandCenter(root);
  assert.equal(center.status,"COMMAND_CENTER_READY");
  assert.equal(center.portfolio.projectCount,1);
  assert.equal(center.resources.queued,1);
});
test("project intelligence stays unknown without evidence",()=>{assert.equal(buildProjectIntelligence({}).signals.health,"unknown");assert.equal(buildProjectIntelligence({}).signals.risk,"unknown")});
test("enterprise readiness is gate-driven",async()=>{const root=await temp();const gated=await buildAutonomousEnterpriseState(root);assert.equal(gated.status,"AUTONOMOUS_ENTERPRISE_GATED")});
