import test from "node:test";
import assert from "node:assert/strict";
import {DurableWorker} from "../src/core/durable-worker.js";

function memoryStore(initial){
  let state=structuredClone(initial);
  return {
    async read(defaultValue){return state===undefined?structuredClone(defaultValue):structuredClone(state);},
    async write(value){state=structuredClone(value);return value;},
    snapshot(){return structuredClone(state);}
  };
}

test("durable worker persists cycles and heartbeat lifecycle",async()=>{
  const store=memoryStore(undefined);
  const calls=[];
  const worker=new DurableWorker({
    store,
    intervalMs:1,
    heartbeatMs:250,
    maxCycles:2,
    cycle:async({cycle,command,context})=>{
      calls.push({cycle,command,context});
    }
  });
  const result=await worker.run({command:"Improve Jora",context:{mode:"self"}});
  assert.equal(result.status,"COMPLETED");
  assert.equal(result.cycles,2);
  assert.deepEqual(calls,[
    {cycle:1,command:"Improve Jora",context:{mode:"self"}},
    {cycle:2,command:"Improve Jora",context:{mode:"self"}}
  ]);
  const state=store.snapshot();
  assert.equal(state.worker.status,"IDLE");
  assert.equal(state.job.status,"COMPLETED");
  assert.equal(state.job.cycles,2);
  assert.equal(state.job.activeCycle,null);
});

test("durable worker rejects a fresh active lease",async()=>{
  const store=memoryStore({
    version:1,
    worker:{id:"other-worker",status:"RUNNING",heartbeatAt:new Date().toISOString()},
    job:{id:"job-1",status:"RUNNING",cycles:0},
    history:[]
  });
  const worker=new DurableWorker({store,staleAfterMs:60_000,cycle:async()=>{}});
  await assert.rejects(
    worker.run({command:"blocked"}),
    /worker lease is already active/
  );
});

test("durable worker recovers a stale job and retries its interrupted cycle",async()=>{
  const stale=new Date(Date.now()-120_000).toISOString();
  const store=memoryStore({
    version:1,
    worker:{id:"old-worker",status:"RUNNING",heartbeatAt:stale},
    job:{
      id:"job-recover",
      command:"Resume Jora",
      status:"RUNNING",
      attempts:1,
      cycles:0,
      activeCycle:1,
      startedAt:stale,
      heartbeatAt:stale
    },
    history:[]
  });
  const calls=[];
  const worker=new DurableWorker({
    store,
    intervalMs:1,
    heartbeatMs:250,
    staleAfterMs:1_000,
    maxCycles:1,
    cycle:async(args)=>calls.push(args)
  });
  const result=await worker.run({command:"Resume Jora"});
  assert.equal(result.status,"COMPLETED");
  assert.equal(calls.length,1);
  assert.equal(calls[0].cycle,1);
  const state=store.snapshot();
  assert.equal(state.job.attempts,2);
  assert.equal(state.job.cycles,1);
  assert.equal(state.history.some(x=>x.type==="RECOVERED"),true);
});
