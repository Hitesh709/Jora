import test from "node:test";
import assert from "node:assert/strict";
import {
  compileAutonomousGoal,
  planCapabilities,
  runAutonomousLoop,
  evaluateAutonomousQuality,
  buildReleasePlan,
  learnFromIncident,
  enforceAutonomousBudget,
  createProjectTemplate,
  buildFactoryState,
  buildUniversalAutonomousPlan
} from "../src/index.js";

test("6.1 compiles game goal",()=>assert.equal(compileAutonomousGoal({request:"build a racing game"}).type,"game"));
test("6.2 maps capabilities",()=>assert.equal(planCapabilities({goal:{type:"application"},capabilities:[{capabilities:["frontend","backend","testing"]}]}).ready,true));
test("6.3 loop retries until success",async()=>{let n=0;const r=await runAutonomousLoop({steps:[{id:"x"}],maxCycles:2,execute:async()=>({success:++n===2})});assert.equal(r.status,"COMPLETED");assert.equal(r.cycles,2)});
test("6.4 quality gates",()=>{assert.equal(evaluateAutonomousQuality({testsPassed:true,browserVerified:true,healthPassed:true,requirementsMet:true,securityPassed:true}).status,"PASS");assert.equal(evaluateAutonomousQuality({testsPassed:true,browserVerified:true,healthPassed:true,requirementsMet:true}).status,"CONDITIONAL")});
test("6.5 release requires gates",()=>assert.equal(buildReleasePlan({quality:{status:"PASS"},risk:{status:"PASS"},consensus:{status:"CONSENSUS_APPROVED"},deploymentAvailable:true}).status,"RELEASE_APPROVED"));
test("6.6 incident creates structured preventive rule",()=>{const result=learnFromIncident({incident:{type:"HEALTH"},repair:{strategy:"route-repair"},outcome:"resolved"});assert.equal(result.learningStatus,"LEARNED");assert.equal(result.preventiveRule.apply,"route-repair")});
test("6.7 budget blocks",()=>assert.equal(enforceAutonomousBudget({budget:10,spent:5,estimated:6}).allowed,false));
test("6.8 template varies by type",()=>assert.ok(createProjectTemplate({goal:{type:"game"}}).modules.includes("game-loop")));
test("6.9 factory gates",()=>assert.equal(buildFactoryState({goal:{request:"x"},capabilities:{ready:true},quality:{status:"PASS"},release:{status:"RELEASE_APPROVED"},budget:{allowed:true}}).status,"FACTORY_READY"));
test("7.0 universal builder is request-driven",()=>{const a=buildUniversalAutonomousPlan({request:"build a puzzle game",agents:[{id:"g",capabilities:["gameplay","frontend","testing"]}],evidence:{testsPassed:true,browserVerified:true,healthPassed:true,requirementsMet:true,securityPassed:true},risk:{status:"PASS"},consensus:{status:"CONSENSUS_APPROVED"},deploymentAvailable:true,budget:{budget:100,estimated:10,spent:0}});assert.equal(a.version,"7.0");assert.equal(a.goal.type,"game");assert.equal(a.status,"FACTORY_READY")});
test("6.3 blocks empty autonomous loop",async()=>assert.equal((await runAutonomousLoop({steps:[]})).status,"BLOCKED"));
test("6.9 requires explicit gates",()=>assert.equal(buildFactoryState({goal:{request:"x"},capabilities:{},quality:{status:"PASS"},release:{status:"RELEASE_APPROVED"},budget:{allowed:true}}).status,"FACTORY_GATED"));
