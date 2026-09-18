import test from "node:test";
import assert from "node:assert/strict";
import {PolicyEngine} from "../src/core/policy-engine.js";
import {PolicyRegistry} from "../src/core/policy-registry.js";

test("policy engine allows compliant promotion",async()=>{
  const engine=new PolicyEngine({rules:{minBenchmarkScore:0.8,minQualityScore:0.8}});
  const d=await engine.evaluate({action:"PROMOTE",tenantId:"t1",metrics:{benchmarkScore:0.9,qualityScore:0.85,securityPassed:true}});
  assert.equal(d.allowed,true);
});

test("policy engine blocks denied actions and weak candidates",async()=>{
  const engine=new PolicyEngine({rules:{denyActions:["DEPLOY"],minBenchmarkScore:0.9}});
  assert.equal((await engine.evaluate({action:"DEPLOY",metrics:{benchmarkScore:1,qualityScore:1,securityPassed:true}})).allowed,false);
  assert.equal((await engine.evaluate({action:"PROMOTE",metrics:{benchmarkScore:0.7,qualityScore:1,securityPassed:true}})).allowed,false);
});

test("policy registry selects and lists policies",()=>{
  const registry=new PolicyRegistry({policies:{default:{enabled:true},strict:{enabled:true,minBenchmarkScore:0.95}},defaultPolicy:"strict"});
  assert.equal(registry.get().minBenchmarkScore,0.95);
  assert.equal(registry.list().length,2);
});
