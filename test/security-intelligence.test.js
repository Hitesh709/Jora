import test from "node:test";
import assert from "node:assert/strict";
import {SecurityIntelligence} from "../src/core/security-intelligence.js";

const repo=(files)=>({list:async()=>Object.keys(files),read:async f=>files[f]});
test("security intelligence detects secrets and dangerous code",async()=>{
  const scan=await new SecurityIntelligence({repository:repo({"a.js":"const x=eval(input);","b.txt":"api_key='abcdefghijklmnopqrstuvwxyz'"})}).scan();
  assert.equal(scan.passed,false);
  assert.equal(scan.findings.some(x=>x.type==="SECRET"),true);
  assert.equal(scan.findings.some(x=>x.type==="DANGEROUS_CODE"),true);
});
test("runtime security requires isolated sandbox and disabled network",async()=>{
  const s=new SecurityIntelligence({repository:repo({})});
  assert.equal((await s.checkRuntime({sandbox:{},network:"none"})).passed,true);
  assert.equal((await s.checkRuntime({sandbox:null,network:"bridge"})).passed,false);
});
