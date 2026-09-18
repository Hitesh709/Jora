import test from "node:test";
import assert from "node:assert/strict";
import {ModelProjectBuilder,AutonomousBuildPipeline} from "../src/index.js";

test("model project builder parses and writes generated files",async()=>{
  const writes=[]; const builder=new ModelProjectBuilder({modelGateway:{complete:async()=>({text:JSON.stringify({files:[{path:"index.js",content:"console.log('ok')"}]}),model:"test"})},repository:{write:async(p,c)=>{writes.push([p,c]);return {path:p}}}});
  const result=await builder.build({command:"build agent",specification:{}});
  assert.equal(result.status,"SUCCEEDED"); assert.equal(writes.length,1);
});

test("autonomous build pipeline evaluates sandbox tests",async()=>{
  const p=new AutonomousBuildPipeline({projectBuilder:{build:async()=>({status:"SUCCEEDED"})},testRunner:async()=>({ok:true}),evaluator:{evaluate:x=>({passed:true,...x})}});
  const result=await p.executeProject({request:{command:"x"},specification:{}});
  assert.equal(result.status,"SUCCEEDED");
  const evaluation=await p.evaluateProject({request:{command:"x",context:{}},specification:{},result});
  assert.equal(evaluation.passed,true);
});
