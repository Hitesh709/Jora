import test from "node:test";
import assert from "node:assert/strict";
import {MultiAgentCoordinationEngine} from "../src/core/multi-agent-coordination-engine.js";

test("Phase 6 assigns specialists by capability and score",()=>{
  const engine=new MultiAgentCoordinationEngine({maxAgents:2});
  const plan=engine.plan({
    requirements:[
      {task:"build UI",capability:"frontend"},
      {task:"write API",capability:"backend"}
    ],
    agents:[
      {id:"ui-1",capabilities:["frontend"],score:.8},
      {id:"ui-2",capabilities:["frontend"],score:.9},
      {id:"api-1",capabilities:["backend"],score:.85}
    ]
  });
  assert.equal(plan.status,"ASSIGNED");
  assert.deepEqual(plan.assignments.map(x=>x.agentId),["ui-2","api-1"]);
});

test("Phase 6 requires evidence and quality before coordination is verified",()=>{
  const engine=new MultiAgentCoordinationEngine({minQualityScore:.8});
  const plan=engine.plan({requirements:[{task:"build UI",capability:"frontend"}],agents:[{id:"ui-1",capabilities:["frontend"],score:.9}]});
  const incomplete=engine.evaluate({assignments:plan.assignments,results:[]});
  assert.equal(incomplete.status,"EVIDENCE_INCOMPLETE");
  const verified=engine.evaluate({
    assignments:plan.assignments,
    results:[{task:"build UI",qualityScore:.92,evidence:{tests:["ui smoke"]}}]
  });
  assert.equal(verified.status,"COORDINATION_VERIFIED");
  assert.equal(verified.productionReady,true);
});

test("Phase 6 detects specialist evidence conflicts",()=>{
  const engine=new MultiAgentCoordinationEngine();
  const plan=engine.plan({requirements:[{task:"review architecture",capability:"architecture"}],agents:[{id:"a1",capabilities:["architecture"],score:.9}]});
  const result=engine.evaluate({assignments:plan.assignments,results:[{task:"review architecture",qualityScore:.9,evidence:{conflict:true}}]});
  assert.equal(result.status,"CONFLICT_DETECTED");
  assert.equal(result.productionReady,false);
});
