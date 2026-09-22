import test from "node:test";
import assert from "node:assert/strict";
import {
  IntentUnderstandingEngine,
  detectLanguage,
  normalizeUserText
} from "../src/core/intent-understanding-engine.js";

const engine = new IntentUnderstandingEngine();

test("detects Gujarati written in English letters",()=>{
  assert.equal(detectLanguage("mare ek snake game banavvu che").code,"gu-Latn");
  assert.equal(detectLanguage("mari app ma login add karo").code,"gu-Latn");
});

test("normalizes common Roman Gujarati build intent",()=>{
  const result=engine.understand({
    input:"mare ek snake game banavvu che",
    messages:[{role:"user",content:"Build something fun"}]
  });
  assert.equal(result.action,"build");
  assert.equal(result.domain,"game");
  assert.equal(result.entities.gameType,"snake");
  assert.match(result.normalizedText,/snake game/i);
  assert.equal(result.context.hasConversation,true);
});

test("understands mixed Gujarati and English feature changes",()=>{
  const result=engine.understand({
    input:"mari app ma login add karo ane button blue karo"
  });
  assert.equal(result.action,"modify");
  assert.equal(result.domain,"software");
});

test("understands Gujarati script and keeps native-language metadata",()=>{
  const result=engine.understand({input:"મને સમજાવો કે API શું છે?"});
  assert.equal(result.language.code,"gu");
  assert.equal(result.action,"answer");
});

test("keeps normal English conversation as conversation",()=>{
  const result=engine.understand({input:"What is JavaScript?"});
  assert.equal(result.intent,"conversation.answer");
  assert.equal(result.action,"answer");
  assert.equal(result.domain,"general");
});

test("preserves technical English inside Roman Gujarati",()=>{
  const normalized=normalizeUserText("mare ek REST API banavvu che",detectLanguage("mare ek REST API banavvu che"));
  assert.match(normalized,/REST API/i);
  assert.match(normalized,/build/i);
});
