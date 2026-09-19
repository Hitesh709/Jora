import test from "node:test";
import assert from "node:assert/strict";
import {MultiModelGateway,withModelSelection} from "../src/core/multi-model-gateway.js";

test("request-scoped provider selection overrides the default gateway model",async()=>{
  const calls=[];
  const gateway=new MultiModelGateway({
    providers:new Map([
      ["default",{complete:async r=>{calls.push(["default",r.model]);return {text:"default"}}}],
      ["kilo-free",{complete:async r=>{calls.push(["kilo-free",r.model]);return {text:"free"}}}]
    ]),
    defaultModel:"default"
  });
  const result=await withModelSelection("kilo-free",()=>gateway.complete({messages:[]}));
  assert.equal(result.text,"free");
  assert.equal(result.model,"kilo-free");
  assert.deepEqual(calls,[["kilo-free","kilo-free"]]);
});

test("provider selection does not leak across requests",async()=>{
  const gateway=new MultiModelGateway({
    providers:new Map([
      ["default",{complete:async r=>({text:r.model})}],
      ["kilo-free",{complete:async r=>({text:r.model})}]
    ]),
    defaultModel:"default"
  });
  await withModelSelection("kilo-free",()=>gateway.complete({messages:[]}));
  const result=await gateway.complete({messages:[]});
  assert.equal(result.model,"default");
});

test("anonymous OpenAI-compatible provider can be used without an API key",async()=>{
  const {OpenAICompatibleProvider}=await import("../src/core/openai-compatible-provider.js");
  const provider=new OpenAICompatibleProvider({apiKey:null,allowAnonymous:true,baseUrl:"https://example.invalid/v1",model:"free"});
  assert.equal(provider.apiKey,null);
  assert.equal(provider.allowAnonymous,true);
});
