import test from "node:test";
import assert from "node:assert/strict";
import {AgentTeamRegistryV4,AgentTaskDecomposerV4,AgentNegotiationEngineV4,SharedAgentMemoryV4,CollaborativeReviewEngineV4,ConflictResolutionEngineV4,AgentTeamOrchestratorV4,AgentTeamControlPlaneV4} from "../src/core/agent-team-v4.40.js";

test("v4.21 team registry creates persistent team definition",()=>{const r=new AgentTeamRegistryV4();const t=r.create({id:"team1",specialists:["coder","tester"]});assert.equal(t.id,"team1");assert.equal(r.list().length,1);});
test("v4.23 task decomposer creates dependency DAG",()=>{const d=new AgentTaskDecomposerV4().decompose({mission:"build app"});assert.equal(d.length,3);assert.deepEqual(d[2].dependencies,["subtask_1"]);});
test("v4.25 negotiation selects compatible team",()=>{const r=new AgentNegotiationEngineV4();const out=r.negotiate({teams:[{id:"a",status:"ACTIVE",missionTypes:["research"]},{id:"b",status:"ACTIVE",missionTypes:["coding"]}],task:{type:"coding"}});assert.equal(out.team.id,"b");});
test("v4.27 shared memory searches records",()=>{const m=new SharedAgentMemoryV4();m.add({text:"database migration"});assert.equal(m.search({query:"migration"}).length,1);});
test("v4.30 collaborative review detects critical findings",()=>{const r=new CollaborativeReviewEngineV4().review({reviewers:[{findings:[{path:"a.js",severity:"critical"}]}]});assert.equal(r.approved,false);});
test("v4.33 conflict resolution resolves review conflicts",()=>{const r=new ConflictResolutionEngineV4().resolve({conflicts:[{id:"c"}]});assert.equal(r.status,"RESOLVED");});
test("v4.40 team control plane exposes orchestration",()=>{const p=new AgentTeamControlPlaneV4({swarm:{executeMany:async()=>[]}});assert.equal(p.status().version,"4.40.0");assert.equal(p.status().capabilities.teamOrchestration,true);});
test("v4.40 orchestrator executes team",async()=>{const registry=new AgentTeamRegistryV4();const team=registry.create({id:"t",missionTypes:["coding"]});const o=new AgentTeamOrchestratorV4({registry,decomposer:new AgentTaskDecomposerV4(),negotiation:new AgentNegotiationEngineV4(),swarm:{executeMany:async tasks=>tasks.map(t=>({status:"COMPLETED",task:t}))},memory:new SharedAgentMemoryV4(),review:new CollaborativeReviewEngineV4(),resolution:new ConflictResolutionEngineV4()});const r=await o.execute({mission:"code",type:"coding"});assert.equal(r.team.id,team.id);});
