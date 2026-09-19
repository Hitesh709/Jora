import test from "node:test";
import assert from "node:assert/strict";
import {SpecialistAgentSelectionEngine} from "../src/core/specialist-agent-selection-engine.js";
import {VerificationEngine} from "../src/core/verification-engine.js";
import {SelfCorrectionEngine} from "../src/core/self-correction-engine.js";
import {LearningEngine} from "../src/core/learning-engine.js";
import {EvolutionEngine} from "../src/core/evolution-engine.js";

test("v1.54 selects specialists",()=>{const r=new SpecialistAgentSelectionEngine().select({dag:{nodes:[{id:"TASK-001",title:"Verify",description:"test"}],levels:[{level:0,tasks:["TASK-001"]}]}});assert.equal(r.status,"SPECIALISTS_SELECTED");assert.equal(r.assignments[0].assignment.specialist,"qa-engineer");});
test("v1.56-v1.59 form correction learning evolution loop",()=>{
 const v=new VerificationEngine().verify({executionResults:[{taskId:"T1",status:"FAILED"},{taskId:"T2",status:"COMPLETED"}]});
 assert.equal(v.status,"VERIFICATION_FAILED");
 const c=new SelfCorrectionEngine().correct({verification:v,assignments:[{id:"T1",specialist:"full-stack-engineer"}]});
 assert.equal(c.status,"CORRECTIONS_PLANNED");
 const l=new LearningEngine().learn({tasks:[{status:"FAILED"},{status:"COMPLETED"}],verification:v,corrections:c.corrections});
 assert.equal(l.status,"LEARNING_RECORDED");
 assert.equal(new EvolutionEngine().evolve({learning:l}).status,"EVOLUTION_PLAN_CREATED");
});
