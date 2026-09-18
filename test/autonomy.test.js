import test from "node:test";
import assert from "node:assert/strict";
import {ContinuousWorker} from "../src/core/continuous-worker.js";
import {PromotionController} from "../src/core/promotion-controller.js";
import {ChampionStore} from "../src/core/champion-store.js";
import {AutonomousController} from "../src/core/autonomous-controller.js";

test("continuous worker runs bounded cycles and forwards command/context", async()=>{
  let calls=0;
  const worker=new ContinuousWorker({intervalMs:1,maxCycles:3,cycle:async({command,context})=>{
    calls+=1; assert.equal(command,"Improve Jora"); assert.equal(context.mode,"self");
  }});
  const result=await worker.run({command:"Improve Jora",context:{mode:"self"}});
  assert.equal(result.cycles,3); assert.equal(calls,3);
});

test("promotion controller rejects failed candidates", async()=>{
  const controller=new PromotionController({evaluator:{evaluate:async()=>({passed:false,reason:"regression"})},repository:{commit:async()=>({ref:"x"})}});
  const result=await controller.promote({candidate:{version:"1"},champion:{version:"0"}});
  assert.equal(result.status,"REJECTED");
});

test("promotion controller commits and atomically promotes a validated candidate", async()=>{
  const calls=[];
  const controller=new PromotionController({
    evaluator:{evaluate:async()=>({passed:true,benchmarkScore:0.95,qualityScore:0.9})},
    repository:{
      async commit(message){calls.push(["commit",message]);return {committed:true,commit:"candidate-sha",branch:"jora/candidate-1"};},
      async promoteCandidate(input){calls.push(["promote",input]);return {promoted:true,commit:"promoted-sha",previous:"champion-sha",...input};}
    }
  });
  const result=await controller.promote({candidate:{version:"candidate-1",evaluation:{passed:true}},champion:{version:"champion"}});
  assert.equal(result.status,"PROMOTED"); assert.equal(result.version,"promoted-sha");
  assert.deepEqual(calls,[["commit","Candidate validation candidate-1"],["promote",{branch:"jora/candidate-1",targetBranch:"main"}]]);
});

test("champion store persists and restores the best promoted version", async()=>{
  let state={champion:null,history:[]};
  const store={async read(){return structuredClone(state);},async write(value){state=structuredClone(value);return value;}};
  const champions=new ChampionStore({store});
  await champions.promote({version:"1",evaluation:{benchmarkScore:0.8,qualityScore:0.8}},{score:0.8});
  const restored=new ChampionStore({store});
  await restored.load();
  assert.equal(restored.get().version,"1"); assert.equal(restored.list().length,1);
  await restored.rollback(); assert.equal(restored.get(),null);
});

test("autonomous controller repairs after CI failure and retries promotion", async()=>{
  const builds=[];
  let promotions=0;
  const controller=new AutonomousController({
    delivery:{deliver:async({context})=>{
      builds.push(context.repairFeedback);
      return {status:"DELIVERED",project:{version:"candidate-"+builds.length,evaluation:{passed:true,benchmarkScore:0.9,qualityScore:0.9}}};
    }},
    securityCouncil:{review:async()=>({passed:true})},
    promotion:{promote:async()=>++promotions===1
      ? {status:"CI_BLOCKED",ci:{passed:false,status:"FAILED",evidence:{failedJobs:[{logs:"npm test failed"}]}}}
      : {status:"PROMOTED",candidate:{version:"candidate-2"},decision:{passed:true},ci:{passed:true}}},
    maxCycles:2
  });
  const result=await controller.run({
    command:"repair me",
    context:{built:{project:{version:"candidate-1",evaluation:{passed:true,benchmarkScore:0.9,qualityScore:0.9}}}}
  });
  assert.equal(result.status,"PROMOTED");
  assert.equal(builds.length,1);
  assert.equal(builds[0].source,"CI");
  assert.match(JSON.stringify(builds[0].diagnosis),/npm test failed/);
});
