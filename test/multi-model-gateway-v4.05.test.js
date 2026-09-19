import test from "node:test";
import assert from "node:assert/strict";
import {MultiModelGateway} from "../src/core/multi-model-gateway.js";

test("v4.01 routes GPT/Codex model names to OpenAI provider",async()=>{
 const calls=[]; const gateway=new MultiModelGateway({providers:new Map([["openai",{async complete(r){calls.push(r.model);return {text:"ok"};}}]])});
 const result=await gateway.complete({model:"gpt-5.6"});
 assert.equal(result.text,"ok"); assert.deepEqual(calls,["gpt-5.6"]);
});
test("v4.02 routes Claude model names to Anthropic provider",async()=>{
 const calls=[]; const gateway=new MultiModelGateway({providers:new Map([["claude",{async complete(r){calls.push(r.model);return {text:"claude"};}}]])});
 const result=await gateway.complete({model:"claude-sonnet-4-5"});
 assert.equal(result.text,"claude"); assert.deepEqual(calls,["claude-sonnet-4-5"]);
});
test("v4.04 falls back after provider failure",async()=>{
 let n=0; const gateway=new MultiModelGateway({providers:new Map([["openai",{async complete(){n++;throw new Error("down");}}],["claude",{async complete(){n++;return {text:"fallback"};}}]]),fallbackModels:["claude-sonnet-4-5"]});
 const result=await gateway.complete({model:"gpt-5.6"});
 assert.equal(result.text,"fallback"); assert.equal(n,2);
});
test("v4.05 exposes provider status",()=>{
 const gateway=new MultiModelGateway({providers:new Map([["openai",{complete(){}}],["claude",{complete(){}}]]),defaultModel:"openai"});
 assert.deepEqual(gateway.status().models,["openai","claude"]);
});
