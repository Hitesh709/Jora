import test from "node:test";
import assert from "node:assert/strict";
import {DistributedArtifactWorkspace,DurableTeamCollaboration,SpecialistConsensusGate,CollaborativeReviewEngine,AgentLifecycleGovernor,TeamOptimizationEngine,ContinuousEvolutionScheduler,AutonomousDeliveryControlPlane} from "../src/core/autonomous-delivery-control-plane-v2.js";

test("v2.41 distributed artifact workspace stores revisions",()=>{const w=new DistributedArtifactWorkspace();const a=w.put({name:"plan",content:"v1"});w.revise({name:"plan",content:"v2"});assert.equal(w.get(a.id).content,"v1");assert.equal(w.latest("plan").content,"v2");});
test("v2.42 durable team collaboration tracks messages",()=>{const t=new DurableTeamCollaboration();const x=t.createThread({mission:"m",title:"review"});t.message({threadId:x.id,agent:"a1",content:"ready"});assert.equal(t.get(x.id).messages.length,1);});
test("v2.43 consensus gate reaches majority approval",()=>{const g=new SpecialistConsensusGate();const r=g.evaluate({proposal:"x",reviewers:[{decision:"APPROVE"},{decision:"APPROVE"},{decision:"REJECT"}]});assert.equal(r.consensus,true);});
test("v2.44 collaborative review uses consensus",()=>{const r=new CollaborativeReviewEngine().review({change:"x",reviewers:[{decision:"APPROVE"},{decision:"APPROVE"}]});assert.equal(r.consensus,true);});
test("v2.45 agent lifecycle enforces states",()=>{const g=new AgentLifecycleGovernor();g.register({agentId:"a"});assert.equal(g.transition("a","RUNNING").state,"RUNNING");assert.throws(()=>g.transition("a","INVALID"));});
test("v2.46 team optimization assigns tasks",()=>{const r=new TeamOptimizationEngine().optimize({agents:[{agentId:"a",state:"READY"}],tasks:["t1","t2"]});assert.equal(r.assignments[0].agent,"a");});
test("v2.48 evolution scheduler persists schedule in memory",()=>{const s=new ContinuousEvolutionScheduler();const x=s.schedule({mission:"m"});assert.equal(s.list()[0].id,x.id);s.cancel(x.id);assert.equal(s.list()[0].enabled,false);});
test("v2.50 delivery control plane reports capabilities",()=>{const p=new AutonomousDeliveryControlPlane();const s=p.status();assert.equal(s.version,"2.50.0");assert.equal(s.capabilities.autonomousDelivery,true);});
