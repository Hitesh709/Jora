import test from "node:test";
import assert from "node:assert/strict";
import {IntentUnderstandingEngine} from "../src/core/intent-understanding-engine.js";
import {ConversationIntelligenceEngine, detectResponseType} from "../src/core/conversation-intelligence-engine.js";

test("Phase 1: Roman Gujarati complete game request is understood as a whole project",()=>{
  const engine=new IntentUnderstandingEngine();
  const result=engine.understand({input:"Mara mate mini car racing game banavo"});
  assert.equal(result.language.code,"gu-Latn");
  assert.equal(result.action,"build");
  assert.equal(result.domain,"game");
  assert.equal(result.scope.scope,"game");
  assert.equal(result.scope.wholeProject,true);
  assert.equal(result.entities.gameType,"racing");
});

test("Phase 1: Gujarati and Hindi build requests route to engineering",()=>{
  const engine=new IntentUnderstandingEngine();
  const gu=engine.understand({input:"મારા માટે એક racing game બનાવો"});
  const hi=engine.understand({input:"Mujhe ek racing game banana hai"});
  assert.equal(gu.action,"build");
  assert.equal(gu.language.code,"gu");
  assert.equal(hi.action,"build");
  assert.equal(hi.language.code,"hi-Latn");
});

test("Phase 1: arbitrary project names survive follow-up turns",()=>{
  const engine=new ConversationIntelligenceEngine();
  const result=engine.understand({
    input:"Make it faster",
    messages:[
      {role:"user",content:"Build an ecommerce platform"},
      {role:"assistant",content:"Done — I built the ecommerce platform."}
    ]
  });
  assert.equal(result.action,"modify");
  assert.equal(result.scope.existingProject,true);
  assert.equal(result.conversation.project,"ecommerce platform");
  assert.equal(result.context.resolvedReferences.object,"ecommerce platform");
});

test("Phase 1: Roman Gujarati follow-up resolves the existing project",()=>{
  const engine=new ConversationIntelligenceEngine();
  const result=engine.understand({
    input:"Aa game ma multiplayer add karo",
    messages:[
      {role:"user",content:"Mara mate mini car racing game banavo"},
      {role:"assistant",content:"Done — I built the game."}
    ]
  });
  assert.equal(result.action,"modify");
  assert.equal(result.language.code,"gu-Latn");
  assert.equal(result.scope.existingProject,true);
  assert.ok(result.context.references.includes("previous-turn-object"));
});

test("Phase 1: confirmations and Gujarati negatives are explicit response types",()=>{
  assert.equal(detectResponseType("Ha"),"confirmation");
  assert.equal(detectResponseType("haan karo"),"confirmation");
  assert.equal(detectResponseType("barabar che"),"confirmation");
  assert.equal(detectResponseType("Na"),"negation");
  assert.equal(detectResponseType("naa"),"negation");
  assert.equal(detectResponseType("nathi"),"negation");
});

test("Phase 1: confirmation continues the pending engineering action",()=>{
  const engine=new ConversationIntelligenceEngine();
  const result=engine.understand({
    input:"Ha karo",
    messages:[
      {role:"user",content:"Build a calculator"},
      {role:"assistant",content:"Should I add calculation history?"}
    ]
  });
  assert.equal(result.context.responseType,"confirmation");
  assert.equal(result.action,"modify");
  assert.equal(result.intent,"engineering.modify");
  assert.equal(result.context.previousAssistantQuestion,"Should I add calculation history?");
});

test("Phase 1: correction remains an actionable engineering turn",()=>{
  const engine=new ConversationIntelligenceEngine();
  const result=engine.understand({
    input:"Actually add multiplayer",
    messages:[
      {role:"user",content:"Build a racing game"},
      {role:"assistant",content:"Done."}
    ]
  });
  assert.equal(result.action,"modify");
  assert.equal(result.intent,"engineering.modify");
});
