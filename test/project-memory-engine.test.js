import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildProjectMemory,compareProjectMemory,recordProjectMemory,
  loadProjectMemory,loadProjectHistory,initializeProjectMemory,buildContinuationContext
} from "../src/core/project-memory-engine.js";

const contract={files:["src/index.js","src/index.html"],sourceCount:2,features:["search","leaderboard"],routes:["/health","/api/search"],entrypoints:["src/index.js"],api:{routeCount:1}};

test("Phase 3.9 builds a durable project fingerprint",()=>{
  const m=buildProjectMemory({contract,projectName:"demo"});
  assert.equal(m.project.name,"demo");
  assert.deepEqual(m.project.fingerprint.features,["leaderboard","search"]);
  assert.equal(m.project.fingerprint.fileCount,2);
});

test("Phase 3.9 detects changes since the previous project state",()=>{
  const old=buildProjectMemory({contract:{...contract,features:["search"],routes:["/health"]}});
  const comparison=compareProjectMemory(old,contract);
  assert.equal(comparison.changed,true);
  assert.deepEqual(comparison.delta.addedFeatures,["leaderboard"]);
  assert.deepEqual(comparison.delta.addedRoutes,["/api/search"]);
});

test("Phase 3.9 persists memory and bounded history",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"jora-3-9-"));
  const first=await initializeProjectMemory(root,contract,{command:"create app"});
  assert.equal(first.status,"MEMORY_INITIALIZED");
  await recordProjectMemory(root,{contract,command:"add leaderboard",status:"MODIFIED",changes:["leaderboard"],summary:"Added leaderboard."});
  const memory=await loadProjectMemory(root),history=await loadProjectHistory(root);
  assert.equal(memory.lastCommand,"add leaderboard");
  assert.equal(memory.lastStatus,"MODIFIED");
  assert.equal(history.length,2);
  const context=await buildContinuationContext(root,contract);
  assert.equal(context.status,"MEMORY_AVAILABLE");
  assert.equal(context.comparison.changed,false);
});
