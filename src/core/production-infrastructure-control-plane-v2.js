import {randomUUID} from "node:crypto";

export class StartupConfigValidator {
  validate({config={},required=[]}={}) {
    const missing=required.filter(key=>key.split(".").reduce((v,k)=>v?.[k],config)==null);
    const api=config.api||{};
    if(api.enabled && !["127.0.0.1","localhost","::1"].includes(api.host) && !api.authToken && !api.accessTokens) missing.push("api.auth");
    return {valid:missing.length===0,missing:[...new Set(missing)]};
  }
}

export class ReadinessProbe {
  constructor({checks={}}={}) {this.checks=checks;this.last=null;}
  async check(context={}) {
    const results={}; let ready=true;
    for(const [name,fn] of Object.entries(this.checks)) {
      try { const value=await fn(context); results[name]={ok:value!==false,status:value?.status||"OK"}; if(value===false) ready=false; }
      catch(error){results[name]={ok:false,status:"FAILED",error:error.message};ready=false;}
    }
    this.last={ready,results,checkedAt:new Date().toISOString()}; return this.last;
  }
  status(){return this.last||{ready:false,results:{},checkedAt:null};}
}

export class LivenessProbe {
  constructor(){this.startedAt=new Date().toISOString();this.heartbeatAt=this.startedAt;this.failures=0;}
  beat(){this.heartbeatAt=new Date().toISOString();this.failures=0;return this.status();}
  fail(){this.failures++;return this.status();}
  status(){return {alive:this.failures<3,startedAt:this.startedAt,heartbeatAt:this.heartbeatAt,failures:this.failures};}
}

export class GracefulShutdownCoordinator {
  constructor({timeoutMs=30000}={}) {this.timeoutMs=timeoutMs;this.hooks=[];this.shuttingDown=false;}
  register(name,fn){this.hooks.push({name,fn});return this;}
  async shutdown(reason="shutdown") {
    if(this.shuttingDown)return {status:"ALREADY_SHUTTING_DOWN"};
    this.shuttingDown=true; const results=[];
    for(const hook of this.hooks) {
      try { await Promise.race([Promise.resolve().then(()=>hook.fn(reason)),new Promise((_,reject)=>setTimeout(()=>reject(new Error("shutdown timeout")),this.timeoutMs))]);results.push({name:hook.name,status:"STOPPED"}); }
      catch(error){results.push({name:hook.name,status:"FAILED",error:error.message});}
    }
    return {status:"SHUTDOWN_COMPLETE",reason,results};
  }
}

export class RequestContextManager {
  create({requestId=null,tenantId="default",actorId="system",operation="unknown"}={}) {
    return {requestId:requestId||"req_"+randomUUID(),tenantId,actorId,operation,createdAt:new Date().toISOString()};
  }
}

export class DependencyHealthRegistry {
  constructor(){this.dependencies=new Map();}
  register(name,check,{critical=true}={}){this.dependencies.set(name,{check,critical});return this;}
  async check(context={}) {
    const dependencies={}; let healthy=true;
    for(const [name,item] of this.dependencies) {
      try {const result=await item.check(context);dependencies[name]={ok:result!==false,critical:item.critical,result};if(item.critical&&result===false)healthy=false;}
      catch(error){dependencies[name]={ok:false,critical:item.critical,error:error.message};if(item.critical)healthy=false;}
    }
    return {healthy,dependencies,checkedAt:new Date().toISOString()};
  }
}

export class DurableStateRecoveryScanner {
  constructor({stores=[]}={}){this.stores=stores;}
  async scan(){const results=[];for(const store of this.stores){try{const value=await store.load?.();results.push({name:store.name||"store",status:"RECOVERED",loaded:value!==undefined});}catch(error){results.push({name:store.name||"store",status:"FAILED",error:error.message});}}return {status:results.some(x=>x.status==="FAILED")?"PARTIAL":"RECOVERED",stores:results};}
}

export class RuntimeResourceGuard {
  constructor({maxConcurrent=100,maxMemoryMb=2048}={}){this.maxConcurrent=maxConcurrent;this.maxMemoryMb=maxMemoryMb;this.active=0;}
  acquire(){if(this.active>=this.maxConcurrent)return {allowed:false,status:"CONCURRENCY_LIMIT"};this.active++;return {allowed:true,status:"ACQUIRED",active:this.active};}
  release(){this.active=Math.max(0,this.active-1);return this.active;}
  status(){const memoryMb=Math.round(process.memoryUsage().rss/1048576);return {active:this.active,maxConcurrent:this.maxConcurrent,memoryMb,maxMemoryMb:this.maxMemoryMb,memoryHealthy:memoryMb<=this.maxMemoryMb};}
}

export class RuntimeConfigSnapshot {
  constructor({version="2.61.0",config={}}={}){this.version=version;this.config=config;this.createdAt=new Date().toISOString();}
  summary(){return {version:this.version,createdAt:this.createdAt,apiEnabled:Boolean(this.config.api?.enabled),distributed:Boolean(this.config.distributed?.enabled),deploymentEnabled:Boolean(this.config.deployment?.enabled)};}
}

export class ProductionInfrastructureControlPlane {
  constructor({validator=new StartupConfigValidator(),readiness=null,liveness=new LivenessProbe(),shutdown=null,context=new RequestContextManager(),dependencies=null,recovery=null,resources=null,configSnapshot=null}={}) {
    this.version="2.70.0";this.validator=validator;this.readiness=readiness||new ReadinessProbe();this.liveness=liveness;this.shutdown=shutdown||new GracefulShutdownCoordinator();this.context=context;this.dependencies=dependencies||new DependencyHealthRegistry();this.recovery=recovery;this.resources=resources||new RuntimeResourceGuard();this.configSnapshot=configSnapshot||new RuntimeConfigSnapshot();
  }
  async ready(ctx={}){const dependencies=await this.dependencies.check(ctx);const readiness=await this.readiness.check({...ctx,dependencies});return {...readiness,dependencies};}
  live(){return this.liveness.status();}
  request(input={}){return this.context.create(input);}
  acquire(){return this.resources.acquire();}
  release(){return this.resources.release();}
  async recover(){return this.recovery?.scan?.()||{status:"NO_RECOVERY_SCANNER"};}
  status(){return {version:this.version,capabilities:{startupValidation:true,readiness:true,liveness:true,gracefulShutdown:true,requestContext:true,dependencyHealth:true,durableStateRecovery:true,resourceGuard:true,configSnapshot:true},live:this.live(),resources:this.resources.status(),config:this.configSnapshot.summary()};}
}
