import test from "node:test";
import assert from "node:assert/strict";
import {AgentCapabilityRegistry,AgentRoutingEngine,AgentNegotiationProtocol,ParallelSpecialistOrchestrator,SharedArtifactWorkspace,CollaborativeReviewGraph,AgentQualityGate,AgentLifecycleManager,AgentTeamOptimizer} from "../src/core/specialist-intelligence.js";
import {AgentRegistry} from "../src/core/agent-registry.js";

function registry(){const r=new AgentRegistry();r.register({id:"sec",capabilities:["security"],metrics:{score:.9,reliability:.95}});r.register({id:"dev",capabilities:["implementation"],metrics:{score:.8,reliability:.9}});return r;}
test("capability routing selects matching specialists",()=>{const r=registry();const x=new AgentRoutingEngine({registry:r}).route({requiredCapabilities:["security"]});assert.equal(x[0].id,"sec");});
test("negotiation creates and accepts handoffs",()=>{const p=new AgentNegotiationProtocol().negotiate({task:{id:"t"},agents:[{id:"a"},{id:"b"}]});assert.equal(new AgentNegotiationProtocol().accept(p,"b").handoffs[0].status,"ACCEPTED");});
test("parallel orchestrator executes bounded batches",async()=>{const runtime={run:async a=>({agentId:a.id,status:"COMPLETED"})};const x=await new ParallelSpecialistOrchestrator({runtime,concurrency:2}).run({agents:[{id:"a"},{id:"b"},{id:"c"}],input:"x"});assert.equal(x.results.length,3);});
test("shared artifacts detect stale writes",()=>{const w=new SharedArtifactWorkspace();const a=w.write({name:"x",content:"1",owner:"a"});assert.throws(()=>w.write({name:"x",content:"2",owner:"b",expectedVersion:a.version-1}));});
test("quality and review gates work",()=>{const r=registry();const g=new AgentQualityGate();assert.equal(g.evaluate({score:.9,evidence:{tests:true}},{requiredEvidence:["tests"]}).passed,true);const graph=new CollaborativeReviewGraph({registry:r}).create({artifact:"x"});const next=new CollaborativeReviewGraph({registry:r}).decide(graph,{agentId:"sec",decision:"APPROVE"});assert.equal(new CollaborativeReviewGraph({registry:r}).approved(next),true);});
test("lifecycle manager retires weak agents",async()=>{const r=registry();r.updateMetrics("dev",{score:.5,reliability:.5});const m=new AgentLifecycleManager({registry:r,factory:{buildSpecialist:async()=>({})}});assert.equal(m.retireUnderperformers().length,1);});
test("team optimizer emits measurable feedback",()=>{const r=registry();const x=new AgentTeamOptimizer({registry:r}).optimize({members:["sec"]},{outcomes:[{status:"COMPLETED"},{status:"FAILED"}]});assert.equal(x.optimization.sampleSize,2);});
