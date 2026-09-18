import test from "node:test";
import assert from "node:assert/strict";
import {OperatorApi} from "../src/core/operator-api.js";

function store() {
  const executions=[{
    id:"exec_1",
    taskId:"command",
    agentId:"jora-master",
    status:"PROMOTED",
    createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-01-01T00:00:01.000Z",
    trace:[{type:"COMMAND_ACCEPTED"}],
    result:{status:"PROMOTED"}
  }];
  return {
    async list(){return executions;},
    async get(id){return executions.find(x=>x.id===id);}
  };
}

test("operator api exposes health and authenticated status",async()=>{
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"PROMOTED"})},
    executionStore:store(),
    authToken:"secret",
    port:0
  });
  const address=await api.start();
  try {
    const health=await fetch(`http://${address.host}:${address.port}/health`);
    assert.equal(health.status,200);
    assert.equal((await health.json()).status,"ok");

    const denied=await fetch(`http://${address.host}:${address.port}/v1/status`);
    assert.equal(denied.status,401);

    const status=await fetch(`http://${address.host}:${address.port}/v1/status`,{
      headers:{authorization:"Bearer secret"}
    });
    assert.equal(status.status,200);
    const body=await status.json();
    assert.equal(body.service,"jora");
    assert.equal(body.executions.total,1);
  } finally {
    await api.stop();
  }
});

test("operator api executes commands and returns runtime result",async()=>{
  let received=null;
  const api=new OperatorApi({
    runtime:{execute:async(args)=>{received=args;return {status:"PROMOTED",version:"v1"};}},
    executionStore:store(),
    port:0
  });
  const address=await api.start();
  try {
    const response=await fetch(`http://${address.host}:${address.port}/v1/execute`,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({command:"build agent",constraints:{quality:0.9}})
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.accepted,true);
    assert.equal(body.status,"PROMOTED");
    assert.equal(received.command,"build agent");
    assert.equal(received.constraints.quality,0.9);
  } finally {
    await api.stop();
  }
});

test("operator api starts and stops durable worker",async()=>{
  const calls=[];
  let resolve;
  const workerPromise=new Promise(r=>{resolve=r;});
  const worker={
    run:async(args)=>{calls.push(args);return workerPromise;},
    stop(){calls.push("stop");}
  };
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"PROMOTED"})},
    executionStore:store(),
    worker,
    authToken:"secret",
    port:0
  });
  const address=await api.start();
  try {
    const start=await fetch(`http://${address.host}:${address.port}/v1/worker/start`,{
      method:"POST",
      headers:{authorization:"Bearer secret","content-type":"application/json"},
      body:JSON.stringify({command:"Improve Jora"})
    });
    assert.equal(start.status,202);
    assert.equal(calls[0].command,"Improve Jora");

    const stop=await fetch(`http://${address.host}:${address.port}/v1/worker/stop`,{
      method:"POST",
      headers:{authorization:"Bearer secret"}
    });
    assert.equal(stop.status,200);
    assert.equal(calls[1],"stop");
    resolve();
  } finally {
    await api.stop();
  }
});
