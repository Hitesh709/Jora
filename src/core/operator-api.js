import http from "node:http";
import {randomUUID} from "node:crypto";
import {URL} from "node:url";

function json(res,status,payload,headers={}) {
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers});
  res.end(body);
}

async function readBody(req,maxBytes=1_000_000) {
  let size=0;
  const chunks=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>maxBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  const raw=Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); }
  catch { throw new Error("invalid JSON body"); }
}

function safeExecution(execution) {
  if(!execution) return null;
  return {
    id:execution.id,
    taskId:execution.taskId,
    agentId:execution.agentId,
    status:execution.status,
    createdAt:execution.createdAt,
    updatedAt:execution.updatedAt,
    result:execution.result??null,
    trace:execution.trace??[]
  };
}

export class OperatorApi {
  constructor({
    runtime,
    executionStore,
    observability=null,
    metrics=null,
    worker=null,
    queue=null,
    host="127.0.0.1",
    port=8787,
    authToken=null,
    maxBodyBytes=1_000_000
  }={}) {
    if(!runtime) throw new Error("runtime is required");
    this.runtime=runtime;
    this.executionStore=executionStore;
    this.observability=observability;
    this.metrics=metrics;
    this.worker=worker;
    this.queue=queue;
    this.host=host;
    this.port=port;
    this.authToken=authToken;
    this.maxBodyBytes=maxBodyBytes;
    const localOnly=["127.0.0.1","localhost","::1"].includes(this.host);
    if(!localOnly && !this.authToken) throw new Error("authToken is required when operator api is not bound to localhost");
    this.server=null;
    this.startedAt=null;
  }

  _authorized(req) {
    if(!this.authToken) return true;
    const header=req.headers.authorization??"";
    return header===`Bearer ${this.authToken}`;
  }

  async _status() {
    const worker=this.worker?.status ? await this.worker.status() : null;
    const executions=this.executionStore?.list ? await this.executionStore.list() : [];
    const recent=executions.slice(-20).map(safeExecution);
    return {
      service:"jora",
      status:"OK",
      uptimeMs:this.startedAt ? Date.now()-this.startedAt : 0,
      worker,
      executions:{total:executions.length,recent},
      timestamp:new Date().toISOString()
    };
  }

  async _route(req,res) {
    const url=new URL(req.url??"/",`http://${this.host}`);
    const method=req.method??"GET";
    const path=url.pathname;

    if(method==="GET" && path==="/health") {
      return json(res,200,{status:"ok",service:"jora",timestamp:new Date().toISOString()});
    }

    if(!this._authorized(req)) {
      return json(res,401,{error:"unauthorized"});
    }

    if(method==="GET" && path==="/v1/metrics") {
      return json(res,200,this.metrics?.snapshot ? this.metrics.snapshot() : {counters:{},histograms:{}});
    }

    if(method==="GET" && path==="/v1/status") {
      return json(res,200,await this._status());
    }

    if(method==="GET" && path==="/v1/executions") {
      const executions=this.executionStore?.list ? await this.executionStore.list() : [];
      const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||20)));
      return json(res,200,{executions:executions.slice(-limit).map(safeExecution)});
    }

    const executionMatch=path.match(/^\/v1\/executions\/([^/]+)$/);
    if(method==="GET" && executionMatch) {
      const execution=this.executionStore?.get ? await this.executionStore.get(executionMatch[1]) : null;
      if(!execution) return json(res,404,{error:"execution_not_found"});
      return json(res,200,{execution:safeExecution(execution)});
    }

    if(method==="GET" && path==="/v1/jobs") {
      if(!this.queue?.list) return json(res,503,{error:"queue_not_configured"});
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      const status=url.searchParams.get("status")||undefined;
      return json(res,200,{jobs:await this.queue.list({limit,status})});
    }

    const jobMatch=path.match(/^\/v1\/jobs\/([^/]+)$/);
    if(method==="GET" && jobMatch) {
      if(!this.queue?.get) return json(res,503,{error:"queue_not_configured"});
      const job=await this.queue.get(jobMatch[1]);
      if(!job) return json(res,404,{error:"job_not_found"});
      return json(res,200,{job});
    }

    if(method==="POST" && path==="/v1/jobs") {
      if(!this.queue?.enqueue) return json(res,503,{error:"queue_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.command!=="string" || !body.command.trim()) return json(res,400,{error:"command is required"});
      const job=await this.queue.enqueue({
        command:body.command.trim(),
        constraints:body.constraints??{},
        context:body.context??{}
      });
      return json(res,202,{accepted:true,status:"QUEUED",job});
    }

    if(method==="GET" && path==="/v1/observability") {
      const events=this.observability?.list ? await this.observability.list() : [];
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      return json(res,200,{events:events.slice(-limit)});
    }

    if(method==="POST" && path==="/v1/execute") {
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.command!=="string" || !body.command.trim()) {
        return json(res,400,{error:"command is required"});
      }
      const requestId=randomUUID();
      try {
        const result=await this.runtime.execute({
          command:body.command.trim(),
          constraints:body.constraints??{},
          context:{...(body.context??{}),apiRequestId:requestId}
        });
        return json(res,200,{requestId,accepted:true,status:result.status,result});
      } catch(error) {
        return json(res,500,{requestId,accepted:false,status:"FAILED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/worker/start") {
      if(!this.worker?.run) return json(res,503,{error:"worker_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      const command=typeof body.command==="string" && body.command.trim()
        ? body.command.trim()
        : "Improve Jora continuously";
      try {
        if(this.queue) {
          await this.queue.enqueue({command,context:body.context??{}});
          if(!this.worker.running) {
            const promise=this.worker.run({context:body.context??{}});
            promise.catch(()=>{});
          }
          return json(res,202,{accepted:true,command,status:"QUEUED"});
        }
        const promise=this.worker.run({command,context:body.context??{}});
        promise.catch(()=>{});
        return json(res,202,{accepted:true,command,status:"STARTED"});
      } catch(error) {
        return json(res,409,{accepted:false,status:"REJECTED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/worker/stop") {
      if(!this.worker?.stop) return json(res,503,{error:"worker_not_configured"});
      this.worker.stop();
      return json(res,200,{accepted:true,status:"STOP_REQUESTED"});
    }

    return json(res,404,{error:"not_found"});
  }

  async start() {
    if(this.server) return this.address();
    this.server=http.createServer((req,res)=>{
      this._route(req,res).catch(error=>{
        if(!res.headersSent) json(res,500,{error:error.message});
        else res.destroy();
      });
    });
    await new Promise((resolve,reject)=>{
      const onError=error=>{this.server?.off("error",onError);reject(error);};
      this.server.once("error",onError);
      this.server.listen(this.port,this.host,()=>{
        this.server?.off("error",onError);
        this.startedAt=Date.now();
        resolve();
      });
    });
    return this.address();
  }

  address() {
    const address=this.server?.address();
    return typeof address==="string"
      ? {address}
      : {host:address?.address??this.host,port:address?.port??this.port};
  }

  async stop() {
    if(!this.server) return;
    const server=this.server;
    this.server=null;
    await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
    });
  }
}
