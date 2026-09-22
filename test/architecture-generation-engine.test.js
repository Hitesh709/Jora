import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspace,readWorkspaceFile} from "../src/core/workspace-engine.js";
import {
  inspectArchitecture,
  buildArchitectureGenerationPlan,
  validateArchitectureGenerationPlan,
  applyArchitectureGeneration,
  runArchitectureGenerationLoop
} from "../src/core/architecture-generation-engine.js";

test("Phase 3.4 detects missing architecture modules from the blueprint",async()=>{
  const ws=await createWorkspace("jora-architecture-generation-inspect");
  const inspection=await inspectArchitecture(ws.root,{
    api:[{path:"/api/capabilities"}],
    entities:[{name:"User"}],
    kind:"game"
  });
  assert.ok(inspection.missing.some(x=>x.path==="src/modules/api-contract.js"));
  assert.ok(inspection.missing.some(x=>x.path==="src/modules/data-contract.js"));
  assert.ok(inspection.missing.some(x=>x.path==="src/modules/gameplay.js"));
});

test("Phase 3.4 creates a deterministic architecture generation plan",()=>{
  const plan=buildArchitectureGenerationPlan({
    missing:[
      {path:"src/modules/api-contract.js",role:"api-contract",content:"export const apiContract={};"}
    ],
    oversized:[{file:"src/index.js",lines:240}]
  });
  assert.equal(plan.strategy,"generate-missing-modules");
  assert.equal(plan.creates.length,1);
  assert.equal(plan.refactors.length,1);
  assert.ok(plan.steps.some(x=>x.id==="regression"));
});

test("Phase 3.4 protects tests and unsafe paths",()=>{
  const result=validateArchitectureGenerationPlan({
    creates:[
      {operation:"create",path:"../test/index.test.js",content:"bad"},
      {operation:"create",path:".jora/acceptance.json",content:"bad"}
    ]
  });
  assert.equal(result.valid,false);
  assert.ok(result.reasons.length>=2);
});

test("Phase 3.4 generates missing modules and preserves regression safety",async()=>{
  const ws=await createWorkspace("jora-architecture-generation-apply");
  const plan=buildArchitectureGenerationPlan({
    missing:[
      {path:"src/modules/api-contract.js",role:"api-contract",content:'export const apiContract={health:"/health"};'}
    ],
    oversized:[]
  });
  const result=await applyArchitectureGeneration(ws.root,plan,{runTests:async()=>({passed:true})});
  assert.equal(result.status,"GENERATED");
  assert.equal(await readWorkspaceFile(ws.root,"src/modules/api-contract.js"),'export const apiContract={health:"/health"};');
});

test("Phase 3.4 rolls back generated modules on regression failure",async()=>{
  const ws=await createWorkspace("jora-architecture-generation-rollback");
  const plan=buildArchitectureGenerationPlan({
    missing:[
      {path:"src/modules/api-contract.js",role:"api-contract",content:"export const apiContract={};"},
      {path:"src/modules/data-contract.js",role:"data-contract",content:"export const dataContract={};"}
    ],
    oversized:[]
  });
  const result=await applyArchitectureGeneration(ws.root,plan,{runTests:async()=>({passed:false})});
  assert.equal(result.status,"ROLLED_BACK");
  await assert.rejects(()=>readWorkspaceFile(ws.root,"src/modules/api-contract.js"));
  await assert.rejects(()=>readWorkspaceFile(ws.root,"src/modules/data-contract.js"));
});

test("Phase 3.4 loop returns architecture generation state",async()=>{
  const ws=await createWorkspace("jora-architecture-generation-loop");
  const result=await runArchitectureGenerationLoop(ws.root,{
    blueprint:{api:[{path:"/api/capabilities"}]},
    runTests:async()=>({passed:true})
  });
  assert.equal(result.status,"ARCHITECTURE_GENERATED");
  assert.equal(result.generated,true);
});
