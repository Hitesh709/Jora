import test from "node:test";
import assert from "node:assert/strict";
import {ProductUnderstandingEngine} from "../src/core/product-understanding-engine.js";

test("v1.51 extracts intent, goals, constraints and ambiguity",async()=>{
  const engine=new ProductUnderstandingEngine();
  const result=await engine.understand({
    input:"Build a web loan platform for 1000 customers under 30 days with Stripe integration"
  });
  assert.equal(result.version,"1.51.0");
  assert.equal(result.intent.type,"product_build");
  assert.ok(result.goals.length>=1);
  assert.ok(result.requirements.functional.length>=1);
  assert.ok(result.requirements.constraints.some(x=>x.type==="deadline"));
  assert.ok(result.requirements.constraints.some(x=>x.type==="platform"));
  assert.ok(Array.isArray(result.ambiguities));
  assert.ok(result.executionReadiness);
});

test("v1.51 rejects empty input",async()=>{
  const engine=new ProductUnderstandingEngine();
  await assert.rejects(()=>engine.understand({input:""}),/input is required/);
});

test("v1.51 corrects a likely typo in a game request and preserves the original",async()=>{
  const engine=new ProductUnderstandingEngine();
  const result=await engine.understand({input:"Build snack game"});
  assert.equal(result.request,"Build snack game");
  assert.equal(result.interpretedRequest,"Build snake game");
  assert.deepEqual(result.corrections[0],{from:"snack",to:"snake",reason:"likely typo in game name"});
  assert.equal(result.requirements.platform,"game");
  assert.equal(result.goals[0],"snake game");
});
