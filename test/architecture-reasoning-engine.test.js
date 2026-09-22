import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspace,readWorkspaceFile} from "../src/core/workspace-engine.js";
import {
  identifyArchitectureScope,
  generateArchitectureRepairPlan,
  validateArchitecturePlan,
  applyArchitectureTransaction,
  runArchitectureReasoningLoop
} from "../src/core/architecture-reasoning-engine.js";

test("Phase 3.3 identifies a multi-file architecture scope",()=>{
  const scope=identifyArchitectureScope({
    report:{
      connectedFiles:[{file:"src/index.js"},{file:"src/server.js"}],
      dependencyEdges:[{from:"src/index.js",to:"src/server.js"}]
    }
  },{interactions:{error:"API endpoint returned 500"}});
  assert.equal(scope.scope,"multi-file");
  assert.equal(scope.connectedFiles.length,2);
});

test("Phase 3.3 creates an ordered cross-file repair plan",()=>{
  const plan=generateArchitectureRepairPlan({
    connectedFiles:["src/index.js","src/server.js"],
    failure:"API route failed with 500 and broken-api"
  });
  assert.equal(plan.strategy,"multi-file-contract-repair");
  assert.equal(plan.patches.length,2);
  assert.ok(plan.steps.some(x=>x.id==="apply-transaction"));
  assert.ok(plan.guardrails.some(x=>/rollback/i.test(x)));
});

test("Phase 3.3 rejects protected or unsafe architecture patches",()=>{
  const result=validateArchitecturePlan({
    patches:[
      {path:"../test/index.test.js",operation:"replace",before:"a",after:"b"},
      {path:".jora/acceptance.json",operation:"replace",before:"a",after:"b"}
    ]
  });
  assert.equal(result.valid,false);
  assert.ok(result.reasons.length>=2);
});

test("Phase 3.3 applies multiple source patches transactionally",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-architecture-apply");
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/src/index.js",'export const health="/broken-health";',"utf8");
  await fs.writeFile(ws.root+"/src/server.js",'export const api="/broken-api";',"utf8");

  const result=await applyArchitectureTransaction(ws.root,{
    patches:[
      {path:"src/index.js",operation:"replace",before:"/broken-health",after:"/health"},
      {path:"src/server.js",operation:"replace",before:"/broken-api",after:"/api/capabilities"}
    ]
  },{runTests:async()=>({passed:true})});

  assert.equal(result.status,"APPLIED");
  assert.equal(await readWorkspaceFile(ws.root,"src/index.js"),'export const health="/health";');
  assert.equal(await readWorkspaceFile(ws.root,"src/server.js"),'export const api="/api/capabilities";');
});

test("Phase 3.3 rolls back every file when regression fails",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-architecture-rollback");
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/src/index.js",'export const health="/broken-health";',"utf8");
  await fs.writeFile(ws.root+"/src/server.js",'export const api="/broken-api";',"utf8");

  const result=await applyArchitectureTransaction(ws.root,{
    patches:[
      {path:"src/index.js",operation:"replace",before:"/broken-health",after:"/health"},
      {path:"src/server.js",operation:"replace",before:"/broken-api",after:"/api/capabilities"}
    ]
  },{runTests:async()=>({passed:false,stderr:"regression"})});

  assert.equal(result.status,"ROLLED_BACK");
  assert.deepEqual(result.rollback.sort(),["src/index.js","src/server.js"].sort());
  assert.equal(await readWorkspaceFile(ws.root,"src/index.js"),'export const health="/broken-health";');
  assert.equal(await readWorkspaceFile(ws.root,"src/server.js"),'export const api="/broken-api";');
});

test("Phase 3.3 loop returns a machine-readable repair result",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-architecture-loop");
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/src/index.js",'export const health="/broken-health";',"utf8");
  await fs.writeFile(ws.root+"/src/server.js",'export const api="/broken-api";',"utf8");

  const result=await runArchitectureReasoningLoop(ws.root,{
    codeUnderstanding:{
      report:{
        connectedFiles:[{file:"src/index.js"},{file:"src/server.js"}],
        dependencyEdges:[{from:"src/index.js",to:"src/server.js"}]
      }
    },
    interactions:{error:"API endpoint broken-api returned 500"},
    runTests:async()=>({passed:true})
  });

  assert.equal(result.status,"ARCHITECTURE_REPAIRED");
  assert.equal(result.repaired,true);
  assert.equal(result.plan.patches.length,2);
});
