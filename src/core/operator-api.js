import http from "node:http";
import {randomUUID} from "node:crypto";
import {URL} from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import {AccessController} from "./access-controller.js";

function json(res,status,payload,headers={}) {
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, OPTIONS",...headers});
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
    trace:execution.trace??[],
    tenantId:execution.input?.tenantId??execution.tenantId??"default"
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
    maxBodyBytes=1_000_000,
    dashboardPath=null,
    healthMonitor=null,
    incidentManager=null,
    programManager=null,
    rateLimitPerMinute=120,
    accessController=null,
    auditLog=null
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
    this.dashboardPath=dashboardPath;
    this.healthMonitor=healthMonitor;
    this.incidentManager=incidentManager;
    this.programManager=programManager;
    this.rateLimitPerMinute=Math.max(1,Number(rateLimitPerMinute)||120);
    this.rateBuckets=new Map();
    this.accessController=accessController;
    this.auditLog=auditLog;\n    this.productUnderstanding=productUnderstanding;
    const localOnly=["127.0.0.1","localhost","::1"].includes(this.host);
    if(!localOnly && !this.authToken && !this.accessController) throw new Error("authToken or accessController is required when operator api is not bound to localhost");
    this.server=null;
    this.startedAt=null;
  }

  _rateLimited(req) {
    const now=Date.now(); const key=req.socket?.remoteAddress||"unknown";
    const bucket=this.rateBuckets.get(key);
    if(!bucket || now-bucket.startedAt>=60000){ this.rateBuckets.set(key,{startedAt:now,count:1}); return false; }
    bucket.count++;
    return bucket.count>this.rateLimitPerMinute;
  }

  _principal(req) {
    const header=req.headers.authorization??"";
    if(!header) {
      if(!this.authToken) return {id:"local",tenantId:"default",roles:["admin"]};
      return null;
    }
    const token=header.startsWith("Bearer ")?header.slice(7):null;
    if(this.authToken && token===this.authToken) return {id:"legacy",tenantId:"default",roles:["admin"]};
    return this.accessController?.authenticate(token)??null;
  }

  _authorized(req,action="read") {
    const principal=this._principal(req);
    if(this.accessController && principal?.id!=="legacy" && principal?.id!=="local") return this.accessController.authorize(principal,action);
    if(principal?.id==="legacy" || principal?.id==="local") return true;
    return false;
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

    if(method==="OPTIONS") {
      res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, OPTIONS"});
      res.end(); return;
    }

    if(method==="GET" && path==="/health") {
      return json(res,200,{status:"ok",service:"jora",timestamp:new Date().toISOString()});
    }

    if(this._rateLimited(req)) return json(res,429,{error:"rate_limit_exceeded",retryAfterSeconds:60});

    const principal=this._principal(req);
    const tenantId=this.accessController?.tenant(principal)||"default";
    const actorId=principal?.id||"local";
    const action=method==="GET"?"read":(path==="/v1/execute"||path==="/v1/jobs"||path.startsWith("/v1/worker")?"execute":"operate");
    if(!this._authorized(req,action)) {
      await this.auditLog?.record({action:"AUTH_DENIED",actorId,tenantId,resource:path,metadata:{method}});

      return json(res,401,{error:"unauthorized"});
    }

    if(method==="GET" && (path==="/" || path==="/dashboard")) {
      if(!this.dashboardPath) return json(res,404,{error:"dashboard_not_configured"});
      try {
        const body=await fs.readFile(this.dashboardPath,"utf8");
        res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
        res.end(body); return;
      } catch { return json(res,404,{error:"dashboard_not_found"}); }
    }

    await this.auditLog?.record({action:"API_ACCESS",actorId,tenantId,resource:path,metadata:{method}});

    if(method==="GET" && path==="/v1/incidents") {
      if(!this.incidentManager) return json(res,503,{error:"incident_manager_not_configured"});
      return json(res,200,{incidents:this.incidentManager.list({status:url.searchParams.get("status")||undefined,limit:url.searchParams.get("limit")||100})});
    }
    const incidentMatch=path.match(/^\/v1\/incidents\/([^/]+)$/);
    if(method==="GET" && incidentMatch) {
      const incident=this.incidentManager?.get(incidentMatch[1]);
      if(!incident) return json(res,404,{error:"incident_not_found"});
      return json(res,200,{incident});
    }

    if(method==="GET" && path==="/v1/mission") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      return json(res,200,await this.programManager.status());
    }

    if(method==="POST" && path==="/v1/mission/start") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      const objective=typeof body.objective==="string"&&body.objective.trim()
        ? body.objective.trim()
        : "Complete Jora roadmap autonomously";
      const promise=this.programManager.run({objective,context:{...(body.context??{}),tenantId}});
      promise.catch(()=>{});
      return json(res,202,{accepted:true,status:"STARTED",objective});
    }

    if(method==="POST" && path==="/v1/mission/stop") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      this.programManager.stop();
      return json(res,200,{accepted:true,status:"STOP_REQUESTED"});
    }

    if(method==="GET" && path==="/v1/health") {
      const result=this.healthMonitor?.check ? await this.healthMonitor.check() : {healthy:true,alerts:[]};
      return json(res,result.healthy?200:503,result);
    }

    if(method==="GET" && path==="/v1/audit") {
      if(!this.auditLog) return json(res,503,{error:"audit_log_not_configured"});
      return json(res,200,{entries:this.auditLog.list({tenantId,limit:url.searchParams.get("limit")||100}),integrity:this.auditLog.verify()});
    }

    if(method==="GET" && path==="/v1/metrics") {
      return json(res,200,this.metrics?.snapshot ? this.metrics.snapshot() : {counters:{},histograms:{}});
    }

    if(method==="POST" && path==="/v1/understand") {
      if(!this.productUnderstanding) return json(res,503,{error:"product_understanding_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.input!=="string" || !body.input.trim()) return json(res,400,{error:"input is required"});
      try {
        const specification=await this.productUnderstanding.understand({
          input:body.input.trim(),
          context:{...(body.context??{}),tenantId}
        });
        return json(res,200,{accepted:true,status:"UNDERSTOOD",specification});
      } catch(error) {
        return json(res,400,{accepted:false,status:"FAILED",error:error.message});
      }
    }

    if(method==="GET" && path==="/v1/status") {
      return json(res,200,await this._status());
    }

    if(method==="GET" && path==="/v1/executions") {
      const executions=this.executionStore?.list ? await this.executionStore.list() : [];
      const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||20)));
      return json(res,200,{executions:executions.filter(e=>(e.input?.tenantId??e.tenantId??"default")===tenantId).slice(-limit).map(safeExecution)});
    }

    const executionMatch=path.match(/^\/v1\/executions\/([^/]+)$/);
    if(method==="GET" && executionMatch) {
      const execution=this.executionStore?.get ? await this.executionStore.get(executionMatch[1]) : null;
      if(!execution) return json(res,404,{error:"execution_not_found"});
      if((execution.input?.tenantId??execution.tenantId??"default")!==tenantId) return json(res,404,{error:"execution_not_found"});
      return json(res,200,{execution:safeExecution(execution)});
    }

    if(method==="GET" && path==="/v1/jobs") {
      if(!this.queue?.list) return json(res,503,{error:"queue_not_configured"});
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      const status=url.searchParams.get("status")||undefined;
      const jobs=await this.queue.list({limit,status});
      return json(res,200,{jobs:jobs.filter(job=>(job.context?.tenantId??"default")===tenantId)});
    }

    const jobMatch=path.match(/^\/v1\/jobs\/([^/]+)$/);
    if(method==="GET" && jobMatch) {
      if(!this.queue?.get) return json(res,503,{error:"queue_not_configured"});
      const job=await this.queue.get(jobMatch[1]);
      if(!job || (job.context?.tenantId??"default")!==tenantId) return json(res,404,{error:"job_not_found"});
      return json(res,200,{job});
    }

    if(method==="POST" && path==="/v1/jobs") {
      if(!this.queue?.enqueue) return json(res,503,{error:"queue_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.command!=="string" || !body.command.trim()) return json(res,400,{error:"command is required"});
      const job=await this.queue.enqueue({
        command:body.command.trim(),
        constraints:body.constraints??{},
        context:{...(body.context??{}),tenantId}
      });
      return json(res,202,{accepted:true,status:"QUEUED",job});
    }

    if(method==="GET" && path==="/v1/observability") {
      const events=this.observability?.list ? await this.observability.list() : [];
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      return json(res,200,{events:events.filter(e=>!e.tenantId||e.tenantId===tenantId).slice(-limit)});
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
          context:{...(body.context??{}),apiRequestId:requestId,tenantId}
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
          await this.queue.enqueue({command,context:{...(body.context??{}),tenantId}});
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
