import {createHash,randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class ExecutionLedger {
  constructor({store=null,maxRecords=10000}={}){this.store=store;this.maxRecords=maxRecords;this.records=[];this.loaded=false;}
  async load(){if(this.loaded)return this.records;this.records=await this.store?.read?.([])??[];this.loaded=true;return this.records;}
  async append(event={}){await this.load();const record={id:"evt_"+randomUUID(),timestamp:new Date().toISOString(),...event};this.records.push(record);if(this.records.length>this.maxRecords)this.records.splice(0,this.records.length-this.maxRecords);await this.store?.write?.(this.records);return structuredClone(record);}
  async findByIdempotencyKey(key){await this.load();if(!key)return null;const record=this.records.find(x=>x.idempotencyKey===key);return record?structuredClone(record):null;}
  async list({limit=100,operation=null}={}){await this.load();let rows=this.records;if(operation)rows=rows.filter(x=>x.operation===operation);return rows.slice(-Math.min(500,Math.max(1,Number(limit)||100))).reverse().map(x=>structuredClone(x));}
}

export class IdempotencyGuard {
  constructor({ledger=null,ttlMs=24*60*60*1000}={}){this.ledger=ledger;this.ttlMs=ttlMs;this.memory=new Map();}
  async check(key){
    if(!key)return {replay:false};
    const now=Date.now();
    const local=this.memory.get(key);
    if(local && now-local.createdAt<this.ttlMs)return {replay:true,result:local.result};
    if(local)this.memory.delete(key);
    const stored=await this.ledger?.findByIdempotencyKey(key);
    if(stored && now-new Date(stored.timestamp).getTime()<this.ttlMs){this.memory.set(key,{createdAt:now,result:stored.result});return {replay:true,result:stored.result};}
    return {replay:false};
  }
  remember(key,result){if(key)this.memory.set(key,{createdAt:Date.now(),result});return result;}
}

export class PolicyEngine {
  constructor({rules={}}={}){this.rules=rules;}
  evaluate({operation,risk="medium",provider=null,context={}}={}){
    const normalized=String(risk).toLowerCase();
    const violations=[];
    if(normalized==="critical")violations.push("CRITICAL_RISK_REQUIRES_OPERATOR");
    if(provider==="production" && normalized!=="low")violations.push("PRODUCTION_REQUIRES_APPROVAL");
    if(this.rules[operation]?.enabled===false)violations.push("OPERATION_DISABLED");
    if(context.breakGlass===true && normalized==="critical")violations.push("BREAK_GLASS_BLOCKED_FOR_CRITICAL");
    return {allowed:violations.length===0,operation,risk:normalized,provider,violations,evaluatedAt:new Date().toISOString()};
  }
}

export class PreflightGate {
  constructor({policyEngine=null}={}){this.policyEngine=policyEngine??new PolicyEngine();}
  evaluate(input={}){
    const policy=this.policyEngine.evaluate(input);
    const checks=[
      {name:"operation",ok:Boolean(input.operation)},
      {name:"policy",ok:policy.allowed},
      {name:"evidence",ok:String(input.risk||"medium").toLowerCase()==="low"||Array.isArray(input.evidence)&&input.evidence.length>0}
    ];
    return {ready:checks.every(x=>x.ok),checks,policy};
  }
}

export class ArtifactManifest {
  async build({root,files=[]}={}){
    if(!root)throw new Error("root is required");
    const selected=files.length?files:[];
    const entries=[];
    for(const relative of selected){
      const safe=path.normalize(relative);
      if(safe.startsWith(".."))throw new Error("artifact path escapes root");
      const absolute=path.resolve(root,safe);
      const data=await fs.readFile(absolute);
      entries.push({path:safe,size:data.length,sha256:createHash("sha256").update(data).digest("hex")});
    }
    return {version:"2.13.0",root:path.resolve(root),files:entries,digest:createHash("sha256").update(JSON.stringify(entries)).digest("hex"),generatedAt:new Date().toISOString()};
  }
}

export class DeploymentHealthVerifier {
  constructor({fetchImpl=globalThis.fetch,timeoutMs=10000}={}){this.fetch=fetchImpl;this.timeoutMs=timeoutMs;}
  async verify({url,attempts=3,intervalMs=1000}={}){
    if(!url)return {healthy:false,status:"HEALTH_URL_REQUIRED",attempts:0};
    let last=null;
    for(let i=1;i<=Math.max(1,attempts);i++){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
      try{const response=await this.fetch(url,{signal:controller.signal,cache:"no-store"});last={attempt:i,statusCode:response.status,healthy:response.ok};if(response.ok)return {...last,status:"HEALTHY"};}
      catch(error){last={attempt:i,healthy:false,error:error.message};}
      finally{clearTimeout(timer);}
      if(i<attempts)await new Promise(r=>setTimeout(r,intervalMs));
    }
    return {...last,status:"UNHEALTHY"};
  }
}

export class RollbackCoordinator {
  constructor({deploymentClient=null,ledger=null}={}){this.deploymentClient=deploymentClient;this.ledger=ledger;}
  async rollback({target,reason="rollback requested",payload={}}={}){
    if(!this.deploymentClient)return {accepted:false,status:"ROLLBACK_CLIENT_NOT_CONFIGURED",target};
    const result=await this.deploymentClient({target,payload:{...payload,rollback:true,reason}});
    await this.ledger?.append({operation:"ROLLBACK",target,result,reason});
    return {accepted:true,status:"ROLLBACK_TRIGGERED",target,result};
  }
}

export class RecoveryController {
  constructor({healthVerifier=null,rollbackCoordinator=null,ledger=null}={}){this.healthVerifier=healthVerifier;this.rollbackCoordinator=rollbackCoordinator;this.ledger=ledger;}
  async recover({healthUrl,rollbackTarget,rollbackPayload={},attempts=3}={}){
    const health=await this.healthVerifier?.verify({url:healthUrl,attempts})??{healthy:false,status:"HEALTH_VERIFIER_NOT_CONFIGURED"};
    if(health.healthy)return {recovered:true,status:"HEALTHY",health};
    const rollback=await this.rollbackCoordinator?.rollback({target:rollbackTarget,payload:rollbackPayload,reason:health.status})??{accepted:false,status:"ROLLBACK_NOT_CONFIGURED"};
    const result={recovered:false,status:"ROLLBACK_REQUIRED",health,rollback};
    await this.ledger?.append({operation:"RECOVERY",result});
    return result;
  }
}

export class FactoryCheckpointStore {
  constructor({file="./.jora/v2-checkpoints.json"}={}){this.file=path.resolve(file);this.state=null;}
  async _load(){if(this.state)return this.state;try{this.state=JSON.parse(await fs.readFile(this.file,"utf8"));}catch{this.state={checkpoints:[]};}return this.state;}
  async save({name,phase,state={}}={}){if(!name)throw new Error("checkpoint name is required");await this._load();const checkpoint={id:"cp_"+randomUUID(),name,phase,state,savedAt:new Date().toISOString()};this.state.checkpoints.push(checkpoint);await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file,JSON.stringify(this.state,null,2));return checkpoint;}
  async latest(name=null){await this._load();const rows=name?this.state.checkpoints.filter(x=>x.name===name):this.state.checkpoints;return rows.at(-1)??null;}
}

export class AutonomousControlLoop {
  constructor({ledger=null,policy=null,preflight=null,checkpoints=null}={}){this.ledger=ledger;this.policy=policy??new PolicyEngine();this.preflight=preflight??new PreflightGate({policyEngine:this.policy});this.checkpoints=checkpoints??new FactoryCheckpointStore();}
  async evaluate({operation,risk="medium",evidence=[],context={},phase="execution"}={}){
    const preflight=this.preflight.evaluate({operation,risk,evidence,context});
    const checkpoint=await this.checkpoints.save({name:operation||"unknown",phase,state:{preflight}});
    const event=await this.ledger?.append({operation,risk,phase,status:preflight.ready?"READY":"BLOCKED",preflight,checkpointId:checkpoint.id});
    return {version:"2.20.0",ready:preflight.ready,preflight,checkpoint,event};
  }
}
