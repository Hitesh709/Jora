import test from "node:test";
import assert from "node:assert/strict";
import {
  ConversationIntelligenceEngine,
  detectResponseType
} from "../src/core/conversation-intelligence-engine.js";

const engine=new ConversationIntelligenceEngine();

test("detects confirmations",()=>{
  assert.equal(detectResponseType("Ha"),"confirmation");
  assert.equal(detectResponseType("Yes"),"confirmation");
  assert.equal(detectResponseType("Na"),"negation");
});

test("resolves a follow-up object from the previous conversation",()=>{
  const result=engine.understand({
    input:"Make it faster",
    messages:[
      {role:"user",content:"Build a racing game"},
      {role:"assistant",content:"Done — I built the racing game."}
    ]
  });
  assert.equal(result.action,"modify");
  assert.equal(result.conversation.project,"racing game");
  assert.equal(result.context.resolvedReferences.object,"racing game");
  assert.equal(result.scope.existingProject,true);
});

test("turns a confirmation into the pending action",()=>{
  const result=engine.understand({
    input:"Ha",
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

test("tracks an active goal across several turns",()=>{
  const result=engine.understand({
    input:"Add multiplayer to it",
    messages:[
      {role:"user",content:"Build a racing game"},
      {role:"assistant",content:"Done."},
      {role:"user",content:"Make the cars faster"},
      {role:"assistant",content:"Done."}
    ]
  });
  assert.equal(result.goal.active,true);
  assert.equal(result.goal.action,"modify");
  assert.equal(result.goal.project,"racing game");
  assert.equal(result.scope.existingProject,true);
});

test("handles Roman Gujarati follow-up language",()=>{
  const result=engine.understand({
    input:"Aa game ma multiplayer add karo",
    messages:[
      {role:"user",content:"Build a racing game"},
      {role:"assistant",content:"Done"}
    ]
  });
  assert.equal(result.language.code,"gu-Latn");
  assert.equal(result.action,"modify");
  assert.ok(result.context.references.includes("previous-turn-object"));
});
