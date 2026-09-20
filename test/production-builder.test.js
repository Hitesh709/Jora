import test from "node:test";
import assert from "node:assert/strict";
import {ProductionAgentBuilder} from "../src/core/production-agent-builder.js";
import {AgentSpecPlanner} from "../src/core/agent-spec-planner.js";
import {ProjectFactory} from "../src/core/project-factory.js";

test("production agent builder composes planning and factory without recursive delivery", async()=>{
  const planner=new AgentSpecPlanner();
  let factoryCalls=0;
  let deliveryCalls=0;
  const factory=new ProjectFactory({
    pipeline:{
      async plan(x){return x;},
      async executeProject(){return {status:"SUCCEEDED"};}
    },
    evaluator:{async evaluateProject(){factoryCalls+=1;return {passed:true};}}
  });
  const delivery={async deliver(){deliveryCalls+=1;return {status:"DELIVERED"};}};
  const builder=new ProductionAgentBuilder({planner,factory,delivery});
  const result=await builder.build({command:"Build an AI research agent"});
  assert.equal(result.productionReady,true);
  assert.equal(factoryCalls,1);
  assert.equal(deliveryCalls,0);
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
