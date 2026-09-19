import test from "node:test";
import assert from "node:assert/strict";
import {AgentCapabilityRegistryV4,AgentTaskRouterV4,AgentSwarmExecutorV4,AgentConsensusEngineV4,AgentBudgetControllerV4,AgentSwarmControlPlaneV4} from "../src/core/agent-swarm-v4.20.js";

test("v4.06-v4.10 routes by capability and quality",()=>{
 const r=new AgentCapabilityRegistryV4(); r.register({id:"a",capabilities:["coding"],quality:.9,cost:1,latencyMs:100}); r.register({id:"b",capabilities:["research"],quality:.5});
 const route=new AgentTaskRouterV4({registry:r}).route({capability:"coding"});
 assert.equal(route.selected.id,"a");
});
test("v4.11-v4.14 executes selected model",async()=>{
 const r=new AgentCapabilityRegistryV4(); r.register({id:"claude-agent",models:["claude-sonnet-4-5"],capabilities:["coding"]});
 const router=new AgentTaskRouterV4({registry:r}); const swarm=new AgentSwarmExecutorV4({router,gateway:{async complete(x){return {text:"done",model:x.model};}}});
 const result=await swarm.execute({capability:"coding"});
 assert.equal(result.status,"COMPLETED"); assert.equal(result.result.model,"claude-sonnet-4-5");
});
test("v4.15-v4.18 executes tasks in parallel",async()=>{
 let active=0,max=0; const swarm=new AgentSwarmExecutorV4({concurrency:2,router:{route(){return {status:"ROUTED",selected:{id:"a",models:["x"]}};}},gateway:{async complete(){active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return {text:"ok"};}}});
 const out=await swarm.executeMany([{id:"1"},{id:"2"},{id:"3"}]); assert.equal(out.length,3); assert.ok(max>=2);
});
test("v4.19 consensus requires evidence",async()=>{const c=new AgentConsensusEngineV4();assert.equal((await c.review({outputs:[{status:"COMPLETED"}],required:2})).approved,false);});
test("v4.20 exposes swarm capabilities",()=>{const p=new AgentSwarmControlPlaneV4({gateway:{complete(){}}});assert.equal(p.status().version,"4.20.0");assert.equal(p.status().capabilities.agentSwarm,true);});
test("budget controller blocks over budget",()=>{const b=new AgentBudgetControllerV4({budget:5});assert.equal(b.reserve(4).allowed,true);assert.equal(b.reserve(2).allowed,false);});
