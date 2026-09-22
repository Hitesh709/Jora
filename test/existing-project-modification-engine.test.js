import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  inspectExistingProject,
  extractExistingProjectContract,
  diffRequirementsAgainstProject,
  buildExistingProjectModificationPlan,
  validateExistingProjectModificationPlan,
  runExistingProjectModificationLoop
} from "../src/core/existing-project-modification-engine.js";

async function workspace(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"jora-3-8-"));
  await fs.mkdir(path.join(root,"src"),{recursive:true});
  await fs.writeFile(path.join(root,"package.json"),'{"type":"module","scripts":{"test":"node --test"}}');
  await fs.writeFile(path.join(root,"src","index.html"),'<!doctype html><html><body><main><h1>Existing App</h1></main><script></script></body></html>');
  await fs.writeFile(path.join(root,"src","index.js"),'import http from "node:http";\nhttp.createServer((req,res)=>{if(req.url==="/health"){res.end("ok");}else res.end("ok")}).listen(process.env.PORT||0);');
  return root;
}

test("Phase 3.8 inspects an existing project and extracts its contract",async()=>{
  const root=await workspace();
  const inspection=await inspectExistingProject(root);
  const contract=extractExistingProjectContract(inspection);
  assert.equal(contract.package.present,true);
  assert.ok(contract.entrypoints.includes("src/index.js"));
  assert.ok(contract.entrypoints.includes("src/index.html"));
  assert.ok(contract.routes.includes("/health"));
});

test("Phase 3.8 diffs requested requirements without treating retained features as new",()=>{
  const diff=diffRequirementsAgainstProject({
    command:"Add search and leaderboard",
    existingContract:{features:["leaderboard"],routes:[]}
  });
  assert.deepEqual(diff.added,["search"]);
  assert.deepEqual(diff.retained,["leaderboard"]);
  assert.equal(diff.classification,"additive");
});

test("Phase 3.8 builds a guarded modification plan",()=>{
  const plan=buildExistingProjectModificationPlan({
    diff:{classification:"additive",added:["search"],missingRoutes:[]},
    impact:{scope:"multi-file"}
  });
  assert.equal(validateExistingProjectModificationPlan(plan).valid,true);
  assert.deepEqual(plan.steps.map(x=>x.id),["feature-evolution","feature-implementation","feature-integration","regression"]);
  assert.ok(plan.preserve.includes("Existing tests"));
});

test("Phase 3.8 modifies an existing project and persists a report",async()=>{
  const root=await workspace();
  const report=await runExistingProjectModificationLoop(root,{
    command:"Add search to this existing app",
    runTests:async()=>({passed:true,stdout:"",stderr:""})
  });
  assert.equal(report.status,"MODIFIED");
  assert.equal(report.modified,true);
  const html=await fs.readFile(path.join(root,"src","index.html"),"utf8");
  assert.match(html,/data-jora-feature="search"/);
  const saved=await fs.readFile(path.join(root,".jora","existing-project-modification.json"),"utf8");
  assert.match(saved,/"status": "MODIFIED"/);
});
