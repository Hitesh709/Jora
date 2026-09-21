import test from "node:test";
import assert from "node:assert/strict";
import {JoraNativeProvider} from "../src/core/jora-native-provider.js";

test("Jora native engine answers without external credentials",async()=>{
  const provider=new JoraNativeProvider();
  const result=await provider.complete({messages:[{role:"user",content:"Explain what Jora can do"}]});
  assert.equal(result.model,"jora");
  assert.match(result.text,/autonomous engineering/i);
});

test("Jora native engine generates a runnable project contract",async()=>{
  const provider=new JoraNativeProvider();
  const result=await provider.complete({messages:[{role:"user",content:"Design and implement a production-ready AI agent project for this command. Return ONLY JSON with a files array. Command: Build a customer dashboard"}]});
  const parsed=JSON.parse(result.text);
  assert.ok(Array.isArray(parsed.files));
  assert.ok(parsed.files.some(file=>file.path==="package.json"));
  assert.ok(parsed.files.some(file=>file.path==="src/index.js"));
  assert.ok(parsed.files.some(file=>file.path==="test/index.test.js"));
});


test("Jora native engine answers arithmetic questions",async()=>{
  const provider=new JoraNativeProvider();
  const result=await provider.complete({messages:[{role:"user",content:"What is 125 * 8 + 20?"}]});
  assert.match(result.text,/The answer is 1020/);
});

test("Jora native engine answers common knowledge questions",async()=>{
  const provider=new JoraNativeProvider();
  const result=await provider.complete({messages:[{role:"user",content:"What is JavaScript?"}]});
  assert.match(result.text,/programming language/i);
});


test("Jora native engine modifies an existing project instead of replacing it",async()=>{
  const provider=new JoraNativeProvider();
  const existing={
    project:{name:"mini-game"},
    files:[
      {path:"src/index.html",content:'<!doctype html><html><head><title>Game</title></head><body><h1>Game</h1><button id="start">Start</button><script>const player={speed:7};</script></body></html>'},
      {path:"README.md",content:"# Game"}
    ]
  };
  const prompt="Design and implement a production-ready AI agent project for this command. Return ONLY JSON with a files array. Each item must contain path and content. Command: Change the title to New Game and button text to Play Now. Existing project JSON (preserve all working behavior and modify these files for the new request): "+JSON.stringify(existing);
  const result=await provider.complete({messages:[{role:"user",content:prompt}]});
  const parsed=JSON.parse(result.text);
  const html=parsed.files.find(file=>file.path==="src/index.html").content;
  assert.match(html,/<title>New Game<\/title>/);
  assert.match(html,/>Play Now<\/button>/);
});
