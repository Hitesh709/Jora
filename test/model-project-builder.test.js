import test from "node:test";
import assert from "node:assert/strict";
import {ModelProjectBuilder,AutonomousBuildPipeline} from "../src/index.js";

function makeBuilder(text,writes,calls=[]) {
  return new ModelProjectBuilder({
    modelGateway:{complete:async(request)=>{calls.push(request);return {text,model:"test"}}},
    repository:{write:async(p,c)=>{writes.push([p,c]);return {path:p}}}
  });
}

test("model project builder parses and writes generated files",async()=>{
  const writes=[];
  const builder=makeBuilder(JSON.stringify({files:[{path:"index.js",content:"console.log('ok')"}]}),writes);
  const result=await builder.build({command:"build agent",specification:{}});
  assert.equal(result.status,"SUCCEEDED");
  assert.equal(writes.length,1);
});

test("model project builder accepts prose plus a complete JSON object",async()=>{
  const writes=[];
  const payload=JSON.stringify({files:[{path:"app.js",content:"export default 1;"}]});
  const builder=makeBuilder("Here is the project:\n"+payload+"\nDone.",writes);
  const result=await builder.build({command:"build app",specification:{}});
  assert.equal(result.status,"SUCCEEDED");
  assert.deepEqual(writes,[["app.js","export default 1;"]]);
});

test("model project builder ignores a trailing JSON document",async()=>{
  const writes=[];
  const project=JSON.stringify({files:[{path:"main.js",content:"console.log('ok')"}]});
  const trailing=JSON.stringify({status:"DONE",message:"extra model metadata"});
  const builder=makeBuilder(project+trailing,writes);
  const result=await builder.build({command:"build app",specification:{}});
  assert.equal(result.status,"SUCCEEDED");
  assert.deepEqual(writes,[["main.js","console.log('ok')"]]);
});

test("autonomous build pipeline evaluates sandbox tests",async()=>{
  const p=new AutonomousBuildPipeline({projectBuilder:{build:async()=>({status:"SUCCEEDED"})},testRunner:async()=>({ok:true}),evaluator:{evaluate:x=>({passed:true,...x})}});
  const result=await p.executeProject({request:{command:"x"},specification:{}});
  assert.equal(result.status,"SUCCEEDED");
  const evaluation=await p.evaluateProject({request:{command:"x",context:{}},specification:{},result});
  assert.equal(evaluation.passed,true);
});


test("autonomous build pipeline uses repository workspace when request context has no workspace",async()=>{
  let testedCwd=null;
  const p=new AutonomousBuildPipeline({
    projectBuilder:{
      repository:{root:"/tmp/jora-generated-project"},
      build:async()=>({status:"SUCCEEDED"})
    },
    testRunner:async({cwd})=>{testedCwd=cwd;return {ok:true}},
    evaluator:{evaluate:x=>({passed:true,...x})}
  });
  const result=await p.executeProject({request:{command:"today's date",context:{}},specification:{}});
  const evaluation=await p.evaluateProject({request:{command:"today's date",context:{}},specification:{},result});
  assert.equal(evaluation.passed,true);
  assert.equal(testedCwd,"/tmp/jora-generated-project");
});


test("model project builder passes product planning and demands real workflows",async()=>{
  const writes=[];
  const calls=[];
  const builder=makeBuilder(JSON.stringify({files:[{path:"src/index.html",content:"<main>booking workflow</main>"}]}),writes,calls);
  await builder.build({
    command:"Build a restaurant booking platform",
    specification:{goals:["search restaurants","create booking"],entities:["restaurant","booking"]},
    context:{planning:{architecture:{components:["search","booking"]},dag:{nodes:[{title:"Implement booking workflow"}]}}}
  });
  const prompt=calls[0].messages.find(message=>message.role==="user").content;
  assert.match(prompt,/restaurant booking platform/i);
  assert.match(prompt,/search restaurants/i);
  assert.match(prompt,/Implement booking workflow/i);
  assert.match(prompt,/real implementation/i);
});


test("autonomous build pipeline repairs a failed project and verifies it on retry",async()=>{
  let testRuns=0;
  const buildContexts=[];
  const p=new AutonomousBuildPipeline({
    maxRepairCycles:2,
    projectBuilder:{
      repository:{root:"/tmp/jora-generated-project"},
      build:async(args)=>{
        buildContexts.push(args.context);
        return {status:"SUCCEEDED",files:[{path:"src/index.js",hash:"fixed"}]};
      }
    },
    testRunner:async()=>{
      testRuns++;
      return testRuns===1
        ? {ok:false,code:1,stderr:"AssertionError: expected booking button"}
        : {ok:true,code:0,stdout:"2 tests passed"};
    },
    evaluator:{evaluate:x=>({passed:x.testsPassed&&x.securityPassed,...x})}
  });
  const result=await p.executeProject({request:{command:"Build booking app",context:{}},specification:{}});
  const evaluation=await p.evaluateProject({
    request:{command:"Build booking app",context:{}},
    specification:{},
    result
  });
  assert.equal(testRuns,2);
  assert.equal(evaluation.passed,true);
  assert.equal(evaluation.repairCycles,1);
  assert.match(buildContexts[1].repairFeedback.diagnosis,/failed/i);
});


test("repair cycle receives the real project snapshot and failing file list",async()=>{
  let repairContext=null;
  const repository={
    root:"/tmp/jora-repair",
    snapshot:async()=>[{path:"src/index.js",content:"broken()"}],
    write:async(p,c)=>({path:p})
  };
  const p=new AutonomousBuildPipeline({
    maxRepairCycles:1,
    projectBuilder:{
      repository,
      build:async(args)=>{ repairContext=args.context; return {status:"SUCCEEDED",files:[]}; }
    },
    testRunner:async()=>({ok:false,code:1,files:["src/index.js"],stderr:"AssertionError"}),
    evaluator:{evaluate:x=>({passed:false,...x})}
  });
  await p.evaluateProject({request:{command:"repair app",context:{}},specification:{},result:{status:"SUCCEEDED"}});
  assert.deepEqual(repairContext.existingProject.files,[{path:"src/index.js",content:"broken()"}]);
  assert.deepEqual(repairContext.repairFeedback.failingFiles,["src/index.js"]);
});
