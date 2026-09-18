import test from "node:test";
import assert from "node:assert/strict";
import {ContinuousWorker} from "../src/core/continuous-worker.js";
import {PromotionController} from "../src/core/promotion-controller.js";
import {ChampionStore} from "../src/core/champion-store.js";

test("continuous worker runs bounded cycles and forwards command/context", async()=>{
  let calls=0;
  const worker=new ContinuousWorker({
    intervalMs:1,
    maxCycles:3,
    cycle:async({command,context})=>{
      calls+=1;
      assert.equal(command,"Improve Jora");
      assert.equal(context.mode,"self");
    }
  });
  const result=await worker.run({command:"Improve Jora",context:{mode:"self"}});
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

test("champion store persists and restores the best promoted version", async()=>{
  let state={champion:null,history:[]};
  const store={
    async read(){return structuredClone(state);},
    async write(value){state=structuredClone(value);return value;}
  };
  const champions=new ChampionStore({store});
  await champions.promote({version:"1",evaluation:{benchmarkScore:0.8,qualityScore:0.8}},{score:0.8});
  const restored=new ChampionStore({store});
  await restored.load();
  assert.equal(restored.get().version,"1");
  assert.equal(restored.list().length,1);
  await restored.rollback();
  assert.equal(restored.get(),null);
});
