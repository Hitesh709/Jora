import test from "node:test";
import assert from "node:assert/strict";
import {createJoraRuntime} from "../src/index.js";

test("runtime composer wires provider, persistence and execution",async()=>{
  let built=false,ran=false;
  const composed=createJoraRuntime({
    planner:{specify:async()=>({kind:"agent"})},
    factory:{create:async()=>({productionReady:true})},
    delivery:{deliver:async()=>({status:"DELIVERED"})},
    controller:{run:async()=>{ran=true;return {status:"PROMOTED"}},stop(){}},
    modelProvider:{complete:async()=>({text:"ok"})},
    config:{model:{},persistence:"/tmp/jora-composer.json",worker:{intervalMs:1,maxCycles:1}}
  });
  assert.deepEqual(composed.providers.list(),["default"]);
  const result=await composed.runtime.execute({command:"build"});
  built=true;
  assert.equal(result.status,"PROMOTED"); assert.equal(ran,true); assert.equal(built,true);
});
