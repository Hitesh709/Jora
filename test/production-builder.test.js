import test from "node:test";
import assert from "node:assert/strict";
import {ProductionAgentBuilder} from "../src/core/production-agent-builder.js";
import {AgentSpecPlanner} from "../src/core/agent-spec-planner.js";
import {ProjectFactory} from "../src/core/project-factory.js";

test("production agent builder composes planning, factory and delivery", async()=>{
  const planner=new AgentSpecPlanner();
  const factory=new ProjectFactory({
    pipeline:{
      async plan(x){return x;},
      async executeProject(){return {status:"SUCCEEDED"};}
    },
    evaluator:{async evaluateProject(){return {passed:true};}}
  });
  const delivery={async deliver({command}){return {status:"DELIVERED",command};}};
  const builder=new ProductionAgentBuilder({planner,factory,delivery});
  const result=await builder.build({command:"Build an AI research agent"});
  assert.equal(result.status,"DELIVERED");
  assert.equal(result.command,"Build an AI research agent");
});

test("project factory marks a passing project production ready", async()=>{
  const factory=new ProjectFactory({
    pipeline:{
      async plan(x){return x;},
      async executeProject(){return {status:"SUCCEEDED"};}
    },
    evaluator:{async evaluateProject(){return {passed:true};}}
  });
  const result=await factory.create({request:{command:"agent"},specification:{requirements:{}}});
  assert.equal(result.productionReady,true);
});
