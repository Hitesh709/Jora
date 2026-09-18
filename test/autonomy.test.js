import test from "node:test";
import assert from "node:assert/strict";
import {ContinuousWorker} from "../src/core/continuous-worker.js";
import {PromotionController} from "../src/core/promotion-controller.js";

test("continuous worker runs bounded cycles and can stop", async()=>{
  let calls=0;
  const worker=new ContinuousWorker({
    intervalMs:1,
    maxCycles:3,
    cycle:async()=>{calls+=1;}
  });
  const result=await worker.run();
  assert.equal(result.cycles,3);
  assert.equal(calls,3);
});

test("promotion controller rejects failed candidates", async()=>{
  const controller=new PromotionController({
    evaluator:{evaluate:async()=>({passed:false,reason:"regression"})},
    repository:{commit:async()=>({ref:"x"})}
  });
  const result=await controller.promote({candidate:{version:"1"},champion:{version:"0"}});
  assert.equal(result.status,"REJECTED");
});
