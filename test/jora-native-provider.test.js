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
