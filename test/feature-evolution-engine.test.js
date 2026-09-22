import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspace,readWorkspaceFile} from "../src/core/workspace-engine.js";
import {
  extractFeatureDelta,
  inspectFeatureEvolution,
  buildFeatureEvolutionPlan,
  validateFeatureEvolutionPlan,
  applyFeatureEvolution,
  runFeatureEvolutionLoop
} from "../src/core/feature-evolution-engine.js";

test("Phase 3.5 extracts additive feature requirements",()=>{
  const delta=extractFeatureDelta({
    command:"Add multiplayer and leaderboard to the existing game",
    existingFeatures:["gameplay"]
  });
  assert.ok(delta.added.includes("multiplayer"));
  assert.ok(delta.added.includes("leaderboard"));
  assert.ok(delta.retained.includes("gameplay"));
});

test("Phase 3.5 detects missing feature modules",async()=>{
  const ws=await createWorkspace("jora-feature-inspect");
  const result=await inspectFeatureEvolution(ws.root,{
    command:"Add login, search and payments",
    existingFeatures:[]
  });
  assert.ok(result.missing.some(x=>x.feature==="authentication"));
  assert.ok(result.missing.some(x=>x.feature==="search"));
  assert.ok(result.missing.some(x=>x.feature==="commerce"));
});

test("Phase 3.5 builds a requirement-to-code evolution plan",()=>{
  const plan=buildFeatureEvolutionPlan({
    delta:{added:["multiplayer"]},
    missing:[{feature:"multiplayer",path:"src/features/multiplayer.js",content:"export const multiplayerFeature={};"}]
  });
  assert.equal(plan.strategy,"feature-expansion");
  assert.equal(plan.creates.length,1);
  assert.ok(plan.steps.some(x=>x.id==="impact"));
});

test("Phase 3.5 protects unsafe and acceptance paths",()=>{
  const result=validateFeatureEvolutionPlan({
    creates:[
      {path:"../test/x.js",content:"bad"},
      {path:".jora/acceptance.json",content:"bad"}
    ]
  });
  assert.equal(result.valid,false);
});

test("Phase 3.5 expands features transactionally",async()=>{
  const ws=await createWorkspace("jora-feature-apply");
  const plan=buildFeatureEvolutionPlan({
    delta:{added:["leaderboard"]},
    missing:[{feature:"leaderboard",path:"src/features/leaderboard.js",content:'export const leaderboardFeature={name:"leaderboard"};'}]
  });
  const result=await applyFeatureEvolution(ws.root,plan,{runTests:async()=>({passed:true})});
  assert.equal(result.status,"FEATURES_EXPANDED");
  assert.match(await readWorkspaceFile(ws.root,"src/features/leaderboard.js"),/leaderboard/);
});

test("Phase 3.5 rolls back feature expansion on regression",async()=>{
  const ws=await createWorkspace("jora-feature-rollback");
  const plan=buildFeatureEvolutionPlan({
    delta:{added:["chat","search"]},
    missing:[
      {feature:"chat",path:"src/features/chat.js",content:"export const chatFeature={};"},
      {feature:"search",path:"src/features/search.js",content:"export const searchFeature={};"}
    ]
  });
  const result=await applyFeatureEvolution(ws.root,plan,{runTests:async()=>({passed:false})});
  assert.equal(result.status,"ROLLED_BACK");
  await assert.rejects(()=>readWorkspaceFile(ws.root,"src/features/chat.js"));
  await assert.rejects(()=>readWorkspaceFile(ws.root,"src/features/search.js"));
});

test("Phase 3.5 loop expands an existing project from a new request",async()=>{
  const ws=await createWorkspace("jora-feature-loop");
  const result=await runFeatureEvolutionLoop(ws.root,{
    command:"Add leaderboard to my game",
    existingFeatures:["gameplay"],
    runTests:async()=>({passed:true})
  });
  assert.equal(result.status,"FEATURES_EXPANDED");
  assert.equal(result.expanded,true);
});
