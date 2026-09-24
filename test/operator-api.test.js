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



test("operator api restores async execution by request id from durable store",async()=>{
  const persisted={
    id:"exec_42",
    taskId:"request-42",
    agentId:"jora-master",
    status:"COMPLETED",
    createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-01-01T00:00:01.000Z",
    trace:[{type:"EXECUTION_ACCEPTED",status:"RUNNING"}],
    result:{status:"COMPLETED",version:"v1"}
  };
  const durableStore={
    async list(){return [persisted];},
    async get(){return undefined;},
    async getByTaskId(id){return id==="request-42"?persisted:undefined;}
  };
  const api=new OperatorApi({runtime:{execute:async()=>({status:"COMPLETED"})},executionStore:durableStore,port:0});
  const address=await api.start();
  try {
    const response=await fetch(`http://${address.host}:${address.port}/v1/execute/async/request-42`);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.requestId,"request-42");
    assert.equal(body.status,"COMPLETED");
    assert.equal(body.result.version,"v1");
  } finally {
    await api.stop();
  }
});


test("operator api persists and restores project memory",async()=>{
  let saved=null;
  const projectStateStore={
    async get(id){ return id==="mini-car-racing-game" && saved ? {projectId:id,state:saved} : undefined; },
    async save(id,state){ saved=state; return {projectId:id,state}; }
  };
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"PROMOTED"})},
    executionStore:store(),
    projectStateStore,
    port:0
  });
  const address=await api.start();
  try {
    const first=await fetch(`http://${address.host}:${address.port}/v1/understand`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({input:"Mara mate mini car racing game banavo"})
    });
    assert.equal(first.status,200);
    const firstBody=await first.json();
    assert.equal(firstBody.projectId,"mini-car-racing-game");
    assert.equal(saved.project,"mini car racing game");

    const second=await fetch(`http://${address.host}:${address.port}/v1/understand`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({input:"Aa game ma score add karo",context:{projectId:"mini-car-racing-game"}})
    });
    assert.equal(second.status,200);
    const secondBody=await second.json();
    assert.equal(secondBody.projectState.project,"mini car racing game");
    assert.equal(secondBody.projectState.lastAction,"modify");
  } finally { await api.stop(); }
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


test("operator api protects dashboard and enforces rate limit",async()=>{
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"OK"})},
    executionStore:store(),
    authToken:"secret",
    rateLimitPerMinute:2,
    port:0,
    dashboardPath:new URL("../src/operator/dashboard.html",import.meta.url).pathname
  });
  const address=await api.start();
  try {
    const denied=await fetch("http://"+address.host+":"+address.port+"/dashboard");
    assert.equal(denied.status,401);
    const first=await fetch("http://"+address.host+":"+address.port+"/dashboard",{headers:{authorization:"Bearer secret"}});
    assert.equal(first.status,200);
    const second=await fetch("http://"+address.host+":"+address.port+"/v1/status",{headers:{authorization:"Bearer secret"}});
    assert.equal(second.status,429);
  } finally { await api.stop(); }
});
