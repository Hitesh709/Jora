import test from "node:test";
import assert from "node:assert/strict";
import {MultiModelGateway,withModelSelection} from "../src/core/multi-model-gateway.js";

test("Jora is the single request-scoped provider",async()=>{
  const calls=[];
  const gateway=new MultiModelGateway({
    providers:new Map([
      ["jora",{complete:async r=>{calls.push(r.model);return {text:"jora"}}}]
    ]),
    defaultModel:"jora"
  });
  const result=await withModelSelection("jora",()=>gateway.complete({messages:[]}));
  assert.equal(result.text,"jora");
  assert.equal(result.model,"jora");
  assert.deepEqual(calls,["jora"]);
});

test("Jora selection does not leak across requests",async()=>{
  const gateway=new MultiModelGateway({
    providers:new Map([
      ["jora",{complete:async r=>({text:r.model})}]
    ]),
    defaultModel:"jora"
  });
  await withModelSelection("jora",()=>gateway.complete({messages:[]}));
  const result=await gateway.complete({messages:[]});
  assert.equal(result.model,"jora");
});
