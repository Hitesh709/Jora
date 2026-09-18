import test from "node:test";
import assert from "node:assert/strict";
import { AgentFactory } from "../src/core/agent-factory.js";
import { AgentSpecPlanner } from "../src/core/agent-spec-planner.js";
import { ProjectFactory } from "../src/core/project-factory.js";
import { AutonomousDelivery } from "../src/core/autonomous-delivery.js";

test("agent factory turns a command into a production agent project", async () => {
  const planner = new AgentSpecPlanner();
  const pipeline = {
    async plan(input) { return {kind: "plan", input}; },
    async executeProject() { return {status: "SUCCEEDED"}; }
  };
  const evaluator = {
    async evaluateProject() { return {passed: true, security: "PASS", regression: "PASS"}; }
  };
  const factory = new AgentFactory({
    planner,
    projectFactory: new ProjectFactory({pipeline, evaluator})
  });

  const result = await factory.build({command: "Build a production AI coding agent"});
  assert.equal(result.type, "ai-agent");
  assert.equal(result.productionReady, true);
  assert.equal(result.specification.requirements.sandbox, true);
});

test("autonomous delivery stops after a successful production gate", async () => {
  let calls = 0;
  const agentFactory = {
    async build() {
      calls += 1;
      return {productionReady: true, id: "agent-1"};
    }
  };
  const evolution = {async propose() { throw new Error("should not be called"); }};
  const delivery = new AutonomousDelivery({agentFactory, evolution});

  const result = await delivery.deliver({command: "Build an AI agent"});
  assert.equal(result.status, "DELIVERED");
  assert.equal(result.cycles, 1);
  assert.equal(calls, 1);
});

test("autonomous delivery feeds failed evaluation into the next repair cycle", async () => {
  const contexts=[];
  let calls=0;
  const agentFactory={
    async build({context}) {
      calls+=1;
      contexts.push(context);
      if(calls===1) return {productionReady:false,evaluation:{testsPassed:false,error:"syntax"}};
      return {productionReady:true,evaluation:{testsPassed:true}};
    }
  };
  const evolution={
    async propose({weakness}) {
      return {hypothesis:"Fix the syntax failure",weakness,lifecycle:["GENERATE","TEST","PROMOTE"]};
    }
  };
  const delivery=new AutonomousDelivery({agentFactory,evolution,maxRepairCycles:2});
  const result=await delivery.deliver({command:"Build an agent"});
  assert.equal(result.status,"DELIVERED");
  assert.equal(result.cycles,2);
  assert.equal(contexts[0].repairFeedback,null);
  assert.equal(contexts[1].repairFeedback.diagnosis.testsPassed,false);
  assert.equal(contexts[1].repairFeedback.hypothesis,"Fix the syntax failure");
  assert.equal(result.history.length,2);
});

import { AgentRegistry } from "../src/core/agent-registry.js";
import { AgentTeamCoordinator } from "../src/core/agent-factory.js";
test("agent factory creates specialized teams", async () => {
  const planner=new AgentSpecPlanner(); const pipeline={async plan(){return {kind:"plan"}},async executeProject(){return {status:"SUCCEEDED"}}}; const evaluator={async evaluateProject(){return {passed:true}}};
  const registry=new AgentRegistry(); const factory=new AgentFactory({planner,projectFactory:new ProjectFactory({pipeline,evaluator}),registry});
  const team=await factory.buildTeam({command:"Build a secure AI platform",roles:[{name:"security",capabilities:["security"]},{name:"coding",capabilities:["coding"]}]});
  assert.equal(team.members.length,2); assert.equal(registry.list().length,2);
  assert.equal(new AgentTeamCoordinator({registry}).route({requiredCapabilities:["security"]})[0].specialization.role,"security");
});
test("agent registry evaluates and retires weak agents",()=>{const r=new AgentRegistry();r.register({id:"a",capabilities:["x"],metrics:{score:.5,reliability:.9}});assert.equal(r.evaluate("a").passed,false);assert.equal(r.retire("a","below threshold").status,"RETIRED");});
