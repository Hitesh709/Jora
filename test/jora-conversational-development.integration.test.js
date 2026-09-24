import test from "node:test";
import assert from "node:assert/strict";
import {ConversationIntelligenceEngine} from "../src/core/conversation-intelligence-engine.js";
import {MultiAgentCoordinationEngine} from "../src/core/multi-agent-coordination-engine.js";
import {EvolutionGovernanceEngine} from "../src/core/evolution-governance-engine.js";

test("Jora end-to-end conversational development flow preserves project context",()=>{
  const conversation=new ConversationIntelligenceEngine();
  let history=[];
  let projectState={};

  const turn=(input)=>{
    const result=conversation.understand({input,messages:history,context:{projectState}});
    history.push({role:"user",content:input});
    history.push({role:"assistant",content:"Done."});
    projectState=result.projectState;
    return result;
  };

  const build=turn("Mara mate mini car racing game banavo");
  assert.equal(build.action,"build");
  assert.equal(build.projectState.domain,"game");
  assert.match(build.projectState.project,/mini car racing game/i);

  const score=turn("Aa game ma score add karo");
  assert.equal(score.action,"modify");
  assert.equal(score.scope.existingProject,true);
  assert.match(score.projectState.project,/mini car racing game/i);

  const enemies=turn("Haa, enemy cars pan add karo");
  assert.equal(enemies.action,"modify");
  assert.equal(enemies.context.responseType,"confirmation");
  assert.match(enemies.projectState.project,/mini car racing game/i);

  const correction=turn("Actually, 3 enemy cars j add karo");
  assert.equal(correction.context.responseType,"correction");
  assert.equal(correction.action,"modify");
  assert.match(correction.projectState.project,/mini car racing game/i);
});

test("Jora coordinates specialist work and verifies evidence before governance",()=>{
  const conversation=new ConversationIntelligenceEngine();
  const intent=conversation.understand({input:"Aa game ma score add karo",messages:[
    {role:"user",content:"Mara mate mini car racing game banavo"},
    {role:"assistant",content:"Done."}
  ]});
  const coordinator=new MultiAgentCoordinationEngine({maxAgents:3,minQualityScore:0.7});
  const plan=coordinator.plan({
    requirements:[
      {task:"score",capability:"frontend"},
      {task:"tests",capability:"testing"}
    ],
    agents:[
      {id:"frontend-1",capabilities:["frontend"],score:0.9,status:"available"},
      {id:"tester-1",capabilities:["testing"],score:0.85,status:"available"}
    ]
  });
  assert.equal(plan.status,"ASSIGNED");
  assert.equal(plan.assignments.length,2);
  assert.equal(intent.scope.existingProject,true);

  const evaluated=coordinator.evaluate({
    assignments:plan.assignments,
    results:[
      {task:"score",qualityScore:0.92,evidence:{files:["score.js"],tests:["score.test.js"]}},
      {task:"tests",qualityScore:0.9,evidence:{tests:["score.test.js"]}}
    ]
  });
  assert.equal(evaluated.status,"COORDINATION_VERIFIED");
  assert.equal(evaluated.productionReady,true);

  const governance=new EvolutionGovernanceEngine({
    minimumBenchmarkScore:0.8,
    minimumDelta:0,
    requireSecurity:true,
    requireTests:true,
    requireApproval:true
  });
  const assessment=governance.assess({
    baseline:null,
    candidate:{version:"candidate-1"},
    evaluation:{score:0.9},
    security:{passed:true},
    tests:{passed:true},
    approval:false
  });
  assert.equal(assessment.status,"EVOLUTION_READY_FOR_APPROVAL");
  assert.equal(assessment.productionReady,false);
});
