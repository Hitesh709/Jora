import test from "node:test";
import assert from "node:assert/strict";
import {AutonomousArchitect} from "../src/core/autonomous-architect.js";

test("autonomous architect creates and validates an architecture plan",async()=>{
  const architect=new AutonomousArchitect();
  const plan=await architect.plan({objective:"Build a secure service"});
  assert.equal(plan.validation.passed,true);
  assert.ok(plan.contract.id);
  assert.ok(plan.taskDAG.length>0);
  assert.ok(plan.agentTeam.length>0);
});

test("architecture validator rejects unknown dependencies and insecure network policy",()=>{
  const architect=new AutonomousArchitect();
  const result=architect.validateContract({
    id:"a",objective:"x",
    components:[{id:"api",dependsOn:["missing"]}],
    security:{networkPolicy:"allow-all"}
  });
  assert.equal(result.passed,false);
  assert.ok(result.errors.some(x=>x.includes("unknown dependency")));
  assert.ok(result.errors.some(x=>x.includes("deny-by-default")));
});
