import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";

export class ApprovalGate {
  constructor({autoApproveLowRisk=true}={}) {
    this.autoApproveLowRisk=autoApproveLowRisk;
    this.pending=new Map();
  }
  evaluate({operation,risk="medium",evidence=[]}={}) {
    const normalized=String(risk).toLowerCase();
    const approved=normalized==="low" && this.autoApproveLowRisk || evidence.length>=2 && normalized!=="high";
    if (approved) return {approved:true,status:"APPROVED",operation,risk,evidence};
    const id="approval_"+randomUUID();
    const request={id,operation,risk,evidence,status:"PENDING",createdAt:new Date().toISOString()};
    this.pending.set(id,request);
    return {approved:false,status:"APPROVAL_REQUIRED",request};
  }
  approve(id) {
    const request=this.pending.get(id);
    if(!request) return {approved:false,status:"NOT_FOUND",id};
    request.status="APPROVED";
    request.approvedAt=new Date().toISOString();
    this.pending.delete(id);
    return {approved:true,status:"APPROVED",request};
  }
  reject(id,reason="rejected by operator") {
    const request=this.pending.get(id);
    if(!request) return {approved:false,status:"NOT_FOUND",id};
    request.status="REJECTED"; request.reason=reason;
    this.pending.delete(id);
    return {approved:false,status:"REJECTED",request};
  }
  list() { return [...this.pending.values()]; }
}

export class PersistentLocalQueue {
  constructor({file="./.jora/v2-queue.json",maxAttempts=3}={}) {
    this.file=path.resolve(file);
    this.maxAttempts=maxAttempts;
    this.state=null;
  }
  async _load() {
    if(this.state) return this.state;
    try { this.state=JSON.parse(await fs.readFile(this.file,"utf8")); }
    catch { this.state={jobs:[]}; }
    return this.state;
  }
  async _save() {
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    const temp=this.file+".tmp";
    await fs.writeFile(temp,JSON.stringify(this.state,null,2),"utf8");
    await fs.rename(temp,this.file);
  }
  async enqueue({command,constraints={},context={},maxAttempts=this.maxAttempts}={}) {
    if(!command?.trim()) throw new Error("command is required");
    await this._load();
    const job={id:"job_"+randomUUID(),command:command.trim(),constraints,context,status:"QUEUED",attempts:0,maxAttempts,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    this.state.jobs.push(job); await this._save(); return job;
  }
  async get(id){await this._load();return this.state.jobs.find(x=>x.id===id)||null;}
  async list({limit=50,status}={}){await this._load();let jobs=this.state.jobs;if(status)jobs=jobs.filter(x=>x.status===status);return jobs.slice(-Math.min(200,Math.max(1,Number(limit)||50))).reverse();}
  async claim({workerId="jora-worker"}={}) {
    await this._load();
    const job=this.state.jobs.find(x=>x.status==="QUEUED");
    if(!job)return null;
    job.status="RUNNING";job.workerId=workerId;job.attempts+=1;job.updatedAt=new Date().toISOString();
    await this._save();return job;
  }
  async complete({id,workerId,result=null}={}) {
    const job=await this.get(id); if(!job||job.workerId!==workerId) throw new Error("job lease is not owned by worker");
    job.status="SUCCEEDED";job.result=result;job.finishedAt=new Date().toISOString();job.updatedAt=job.finishedAt;await this._save();return job;
  }
  async fail({id,workerId,error,retry=true}={}) {
    const job=await this.get(id); if(!job||job.workerId!==workerId) throw new Error("job lease is not owned by worker");
    job.error=error??"job failed";job.updatedAt=new Date().toISOString();
    job.status=retry&&job.attempts<job.maxAttempts?"QUEUED":"DEAD_LETTER";
    if(job.status==="DEAD_LETTER")job.finishedAt=job.updatedAt;
    await this._save();return job;
  }
}

export class WorkerPool {
  constructor({concurrency=2}={}) { this.concurrency=Math.max(1,Number(concurrency)||2);this.active=0;this.total=0; }
  async run(tasks=[]) {
    const queue=tasks.map((_,index)=>index);const results=new Array(tasks.length);
    const worker=async()=>{while(true){const index=queue.shift();if(index===undefined)return;this.active++;this.total++;try{results[index]=await tasks[index]();}catch(error){results[index]={status:"FAILED",error:error.message};}finally{this.active--;}}};
    await Promise.all(Array.from({length:Math.min(this.concurrency,tasks.length)},()=>worker()));
    return results;
  }
  status(){return {concurrency:this.concurrency,active:this.active,total:this.total};}
}

export class WebhookDeploymentClient {
  constructor({webhookUrl=null,timeoutMs=60000}={}) {this.webhookUrl=webhookUrl;this.timeoutMs=timeoutMs;}
  async deploy({target,payload={}}={}) {
    if(!this.webhookUrl)return {accepted:false,status:"DEPLOYMENT_WEBHOOK_NOT_CONFIGURED",target};
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await fetch(this.webhookUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({target,...payload}),signal:controller.signal});
      const text=await response.text();
      if(!response.ok) throw new Error("deployment webhook failed: "+response.status+" "+text.slice(0,1000));
      let result=text;try{result=JSON.parse(text);}catch{}
      return {accepted:true,status:"DEPLOYMENT_TRIGGERED",target,result};
    } finally {clearTimeout(timer);}
  }
}

export class ExecutionPlatformV2 {
  constructor({github=null,sandbox=null,testRunner=null,queue=null,approvalGate=null,workerPool=null,deploymentClients={}}={}) {
    this.version="2.10.0";
    this.github=github;this.sandbox=sandbox;this.testRunner=testRunner;this.queue=queue;
    this.approvalGate=approvalGate??new ApprovalGate();
    this.workerPool=workerPool??new WorkerPool();
    this.deploymentClients=deploymentClients;
  }
  status() {
    return {
      version:this.version,
      capabilities:{
        apiGateway:true,
        liveDashboard:true,
        github:Boolean(this.github),
        sandbox:Boolean(this.sandbox),
        tests:Boolean(this.testRunner),
        queue:Boolean(this.queue),
        workerPool:true,
        approvals:true,
        pullRequests:Boolean(this.github?.createPullRequest),
        deployment:{railway:Boolean(this.deploymentClients.railway),vercel:Boolean(this.deploymentClients.vercel)}
      },
      workers:this.workerPool.status(),
      pendingApprovals:this.approvalGate.list().length
    };
  }
  async runTests({cwd,commandArgs=["test"]}={}) {
    if(!this.testRunner)return {accepted:false,status:"TEST_RUNNER_NOT_CONNECTED"};
    return this.testRunner({cwd,commandArgs});
  }
  async executeGitHub({operation,payload={}}={}) {
    if(!this.github)return {accepted:false,status:"GITHUB_NOT_CONNECTED",operation};
    if(typeof this.github[operation]!=="function") throw new Error("unsupported GitHub operation: "+operation);
    return {accepted:true,status:"GITHUB_OPERATION_COMPLETED",operation,result:await this.github[operation](payload)};
  }
  requestApproval(input){return this.approvalGate.evaluate(input);}
  approve(id){return this.approvalGate.approve(id);}
  reject(id,reason){return this.approvalGate.reject(id,reason);}
  async deploy({provider,target,payload={}}={}) {
    const client=this.deploymentClients[provider];
    if(!client)return {accepted:false,status:"DEPLOYMENT_NOT_CONFIGURED",provider,target};
    return client.deploy({target,payload});
  }
}
