import test from "node:test";
import assert from "node:assert/strict";
import {MissionPlannerV4,TeamComposerV4,DynamicAllocationEngineV4,DependencySchedulerV4,MissionRetryPolicyV4,MissionReadinessGateV4,AutonomousMissionDirectorV4} from "../src/core/autonomous-mission-director-v4.60.js";

test("v4.41 planner creates dependency plan",()=>{const p=new MissionPlannerV4().plan({mission:"build app"});assert.equal(p.steps.length,3);assert.deepEqual(p.steps[2].dependencies,["mission_step_1"]);});
test("v4.44 composer selects compatible team",()=>{const out=new TeamComposerV4().compose({teams:[{id:"a",status:"ACTIVE",missionTypes:["research"],maxConcurrency:2},{id:"b",status:"ACTIVE",missionTypes:["coding"],maxConcurrency:3}],missionType:"coding"});assert.equal(out.team.id,"b");});
test("v4.47 allocation assigns agents and models",()=>{const out=new DynamicAllocationEngineV4().allocate({steps:[{id:"s",capability:"coding"}],team:{},availableAgents:[{id:"a",capabilities:["coding"],model:"m1"}],availableModels:["m2"]});assert.equal(out[0].agentId,"a");assert.equal(out[0].model,"m2");});
test("v4.49 scheduler detects dependency order",()=>{const out=new DependencySchedulerV4().schedule({steps:[{id:"b",dependencies:["a"]},{id:"a",dependencies:[]}]});assert.equal(out.status,"SCHEDULE_READY");assert.equal(out.ordered[0].id,"a");});
test("v4.52 retry policy escalates after max retries",()=>{const p=new MissionRetryPolicyV4({maxRetries:2});assert.equal(p.decide({attempts:2,status:"FAILED"}).retry,false);assert.equal(p.decide({attempts:2,status:"FAILED"}).escalate,true);});
test("v4.54 readiness gate blocks missing team",()=>{const out=new MissionReadinessGateV4().evaluate({mission:"x",plan:{steps:[{}]},team:null});assert.equal(out.ready,false);});
test("v4.60 autonomous mission director executes dependency-aware mission",async()=>{
 const teams={list:()=>[{id:"team1",status:"ACTIVE",missionTypes:["coding"],specialists:["coder"],maxConcurrency:2}]};
 const swarm={execute:async({task})=>({status:"COMPLETED",taskId:task.id})};
 const d=new AutonomousMissionDirectorV4({teamControlPlane:{registry:teams},swarm});
 const r=await d.run({mission:"build app",type:"coding",agents:[{id:"a",capabilities:["analysis","coding","testing"]}],models:["model-a"]});
 assert.equal(r.status,"COMPLETED"); assert.equal(r.results.length,3); assert.equal(d.ledger.list({missionId:r.id}).length,6);
});
