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

test("maintains a phase 2 project state across feature turns",()=>{
  const first=engine.understand({
    input:"Build a racing game",
    messages:[]
  });
  assert.equal(first.projectState.project,"racing game");
  assert.equal(first.projectState.domain,"game");

  const second=engine.understand({
    input:"Add 3 enemy cars",
    messages:[
      {role:"user",content:"Build a racing game"},
      {role:"assistant",content:"Done — I built the racing game."}
    ],
    context:{projectState:first.projectState}
  });
  assert.equal(second.projectState.project,"racing game");
  assert.equal(second.projectState.lastAction,"modify");
  assert.equal(second.projectState.requirements.length,2);
  assert.match(second.projectState.requirements.at(-1),/Add 3 enemy cars/i);
});

test("keeps project state when Roman Gujarati changes the existing game",()=>{
  const result=engine.understand({
    input:"Aa game ma score add karo",
    messages:[
      {role:"user",content:"Mara mate mini car racing game banavo"},
      {role:"assistant",content:"Done"}
    ]
  });
  assert.equal(result.projectState.domain,"game");
  assert.equal(result.projectState.lastAction,"modify");
  assert.match(result.projectState.project,/mini car racing game/i);
});
