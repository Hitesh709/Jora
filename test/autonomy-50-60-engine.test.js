import test from "node:test";
import assert from "node:assert/strict";
import {
 createAgentWorkforce,registerAgent,selectAgents,learnFromOutcome,rankStrategies,
 buildAdaptivePlan,buildRiskGate,buildSelfImprovementCycle,
 buildIntegrationPlan,gateSimulation,requireEvidenceConsensus,buildAutonomousRoadmap
} from "../src/index.js";

test("5.1 workforce selects capable agents",()=>{
 let s=createAgentWorkforce({root:"/tmp/jora",capacity:2});
 s={...s,agents:[{id:"a",capabilities:["frontend"],score:8,status:"available"},{id:"b",capabilities:["backend"],score:5,status:"available"}]};
 assert.equal(selectAgents(s,[{capability:"frontend",task:"ui"}])[0].agent.id,"a");
});
test("5.2 learning ranks successful strategies",()=>{
 let s={strategies:{},experiences:[]};
 s=learnFromOutcome(s,{taskType:"build",strategy:"x",success:true});
 s=learnFromOutcome(s,{taskType:"build",strategy:"x",success:true});
 assert.equal(rankStrategies(s,"build")[0].strategy,"x");
});
test("5.3 adaptive planning preserves guardrails",()=>{
 const p=buildAdaptivePlan({objective:"ship",candidates:[{id:"safe",risk:0}],evidence:{safe:{successes:2}}});
 assert.equal(p.strategy,"safe");assert.equal(p.guardrails.preserveTests,true);
});
test("5.4 risk gate blocks unverified actions",()=>{
 assert.equal(buildRiskGate({verificationPassed:false,rollbackAvailable:true}).status,"BLOCK");
});
test("5.5 self improvement measures progress",()=>{
 const c=buildSelfImprovementCycle({objective:"improve",before:{successRate:.5},after:{successRate:.7},candidates:[{id:"x"}]});
 assert.equal(c.measurement.improved,true);
});
test("5.6 integration plan enforces security guardrails",()=>{
 const p=buildIntegrationPlan({required:[{id:"db",type:"database"}]});
 assert.equal(p.connect[0].id,"db");assert.equal(p.guardrails.leastPrivilege,true);
});
test("5.7 simulation gate blocks mismatch",()=>{assert.equal(gateSimulation({status:"SIMULATED",matched:false}).status,"BLOCK")});
test("5.8 consensus requires evidence",()=>{
 assert.equal(requireEvidenceConsensus({votes:[{decision:"approve"},{decision:"approve"}],evidence:["test"]}).status,"CONSENSUS_APPROVED");
});
test("5.9 roadmap prioritizes urgent work",()=>{
 const r=buildAutonomousRoadmap({objective:"ship",capacity:1,backlog:[{id:"urgent",priority:90},{id:"normal",priority:10}]});
 assert.equal(r.now[0].id,"urgent");
});