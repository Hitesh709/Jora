import test from "node:test";
import assert from "node:assert/strict";
import {DistributedWorker} from "../src/core/distributed-worker.js";

function leaseStore() {
  let held=null;
  return {
    async acquire({owner}) {
      if(held) return null;
      held={owner,token:"token-1"};
      return held;
    },
    async heartbeat({owner,token}) {
      return held?.owner===owner && held?.token===token;
    },
    async release({owner,token}) {
      if(held?.owner!==owner || held?.token!==token) return false;
      held=null;
      return true;
    },
    async status(){return held;}
  };
}

test("distributed worker acquires and releases a shared lease",async()=>{
  const calls=[];
  const worker={
    async run(options){calls.push(options); return {status:"COMPLETED"};},
    stop(){calls.push({stopped:true});},
    async status(){return {status:"IDLE"};}
  };
  const leases=leaseStore();
  const a=new DistributedWorker({worker,leaseStore:leases,owner:"node-a"});
  const b=new DistributedWorker({worker,leaseStore:leases,owner:"node-b"});
  assert.deepEqual(await a.run({command:"Improve Jora"}),{status:"COMPLETED"});
  await assert.rejects(()=>b.run({command:"Improve Jora"}),/already held/);
  assert.equal(await leases.status(),null);
  assert.equal(calls[0].command,"Improve Jora");
});

test("distributed heartbeat stops worker when lease is lost",async()=>{
  const worker={
    stopCalled:false,
    stop(){this.stopCalled=true;},
    async status(){return {status:"RUNNING"};}
  };
  const leases={
    async acquire(){return {token:"x"};},
    async heartbeat(){return false;},
    async release(){return true;},
    async status(){return null;}
  };
  const d=new DistributedWorker({worker,leaseStore:leases,owner:"node-a"});
  await d.run({command:"x"}).catch(()=>{});
  d.lease={token:"x"};
  assert.equal(await d.heartbeat(),false);
  assert.equal(worker.stopCalled,true);
});
