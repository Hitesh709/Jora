import {randomUUID,createHash} from "node:crypto";

export class TenantIsolationEngine {
  constructor({defaultTenant="default",maxTenants=1000}={}){this.defaultTenant=defaultTenant;this.maxTenants=maxTenants;this.tenants=new Map();}
  resolve(input={}){const tenantId=String(input.tenantId||this.defaultTenant);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId))throw new Error("invalid tenantId");if(!this.tenants.has(tenantId)&&this.tenants.size>=this.maxTenants)throw new Error("tenant limit reached");this.tenants.set(tenantId,{id:tenantId,lastSeenAt:new Date().toISOString()});return tenantId;}
  assert(resourceTenant,requestTenant){if(String(resourceTenant||this.defaultTenant)!==this.resolve({tenantId:requestTenant}))throw new Error("TENANT_ISOLATION_VIOLATION");return true;}
  list(){return [...this.tenants.values()];}
}

export class SecretReferenceManager {
  constructor({env=process.env,allowedPrefixes=["JORA_"]}={}){this.env=env;this.allowedPrefixes=allowedPrefixes;}
  resolve(name){if(!name||!this.allowedPrefixes.some(prefix=>name.startsWith(prefix)))return {found:false,status:"SECRET_REFERENCE_REJECTED"};const value=this.env[name];return value?{found:true,name}: {found:false,status:"SECRET_NOT_CONFIGURED",name};}
  redact(value){if(value==null)return value;let out=String(value);for(const key of Object.keys(this.env)){if(this.allowedPrefixes.some(prefix=>key.startsWith(prefix))&&this.env[key])out=out.split(this.env[key]).join("[REDACTED]");}return out;}
}

export class RateBudgetController {
  constructor({maxRequests=120,maxConcurrent=10,costLimit=1000}={}){this.maxRequests=maxRequests;this.maxConcurrent=maxConcurrent;this.costLimit=costLimit;this.state=new Map();}
  check(tenant="default",{cost=1}={}){const now=Date.now();let s=this.state.get(tenant);if(!s||now-s.windowStart>=60000)s={windowStart:now,requests:0,concurrent:0,cost:0};if(s.requests>=this.maxRequests)return {allowed:false,reason:"RATE_LIMIT"};if(s.concurrent>=this.maxConcurrent)return {allowed:false,reason:"CONCURRENCY_LIMIT"};if(s.cost+cost>this.costLimit)return {allowed:false,reason:"COST_LIMIT"};s.requests++;s.concurrent++;s.cost+=Math.max(0,Number(cost)||0);this.state.set(tenant,s);return {allowed:true,remaining:{requests:this.maxRequests-s.requests,concurrent:this.maxConcurrent-s.concurrent,cost:this.costLimit-s.cost}};}
  release(tenant="default"){const s=this.state.get(tenant);if(s)s.concurrent=Math.max(0,s.concurrent-1);}
}

export class CircuitBreaker {
  constructor({failureThreshold=5,resetMs=30000}={}){this.failureThreshold=failureThreshold;this.resetMs=resetMs;this.state="CLOSED";this.failures=0;this.openedAt=0;}
  allow(){if(this.state==="OPEN"&&Date.now()-this.openedAt>=this.resetMs){this.state="HALF_OPEN";return true;}return this.state!=="OPEN";}
  success(){this.failures=0;this.state="CLOSED";}
  failure(){this.failures++;if(this.failures>=this.failureThreshold){this.state="OPEN";this.openedAt=Date.now();}}
  status(){return {state:this.state,failures:this.failures,openedAt:this.openedAt};}
}

export class DistributedLeaseCoordinator {
  constructor({store=null,ttlMs=120000}={}){this.store=store;this.ttlMs=ttlMs;this.local=new Map();}
  async acquire(key,owner){if(!key||!owner)throw new Error("key and owner are required");const now=Date.now();const existing=this.local.get(key);if(existing&&existing.expiresAt>now&&existing.owner!==owner)return {acquired:false,status:"LEASE_BUSY",lease:existing};const lease={id:"lease_"+randomUUID(),key,owner,expiresAt:now+this.ttlMs};this.local.set(key,lease);await this.store?.write?.(lease);return {acquired:true,status:"LEASE_ACQUIRED",lease};}
  async release(key,owner){const lease=this.local.get(key);if(!lease||lease.owner!==owner)return {released:false,status:"LEASE_NOT_OWNED"};this.local.delete(key);return {released:true,status:"LEASE_RELEASED"};}
}

export class SandboxPolicyEngine {
  constructor({allowNetwork=false,allowShell=true,maxOutputBytes=1_000_000}={}){this.allowNetwork=allowNetwork;this.allowShell=allowShell;this.maxOutputBytes=maxOutputBytes;}
  evaluate({network=false,shell=true,outputBytes=0}={}){const violations=[];if(network&&!this.allowNetwork)violations.push("NETWORK_DISABLED");if(shell&&!this.allowShell)violations.push("SHELL_DISABLED");if(Number(outputBytes)>this.maxOutputBytes)violations.push("OUTPUT_LIMIT");return {allowed:violations.length===0,violations,limits:{allowNetwork:this.allowNetwork,allowShell:this.allowShell,maxOutputBytes:this.maxOutputBytes}};}
}

export class CostMeter {
  constructor({budget=100}={}){this.budget=budget;this.total=0;this.events=[];}
  charge({tenant="default",operation,units=1,cost=0}={}){const amount=Math.max(0,Number(cost)||0);this.total+=amount;const event={id:"cost_"+randomUUID(),tenant,operation,units,cost:amount,timestamp:new Date().toISOString()};this.events.push(event);return {accepted:this.total<=this.budget,event,total:this.total,remaining:Math.max(0,this.budget-this.total)};}
  summary(){return {budget:this.budget,total:this.total,remaining:Math.max(0,this.budget-this.total),events:this.events.length};}
}

export class HealthEventBus {
  constructor(){this.events=[];this.handlers=new Set();}
  on(handler){this.handlers.add(handler);return()=>this.handlers.delete(handler);}
  async emit(event={}){const record={id:"health_"+randomUUID(),timestamp:new Date().toISOString(),...event};this.events.push(record);for(const handler of this.handlers){await handler(record);}return record;}
  list(limit=100){return this.events.slice(-Math.min(500,Math.max(1,Number(limit)||100))).reverse();}
}

export class ComplianceAuditHasher {
  hash(event){return createHash("sha256").update(JSON.stringify(event)).digest("hex");}
}

export class ReliabilityControlPlane {
  constructor({tenantIsolation=null,rateBudget=null,circuitBreaker=null,sandboxPolicy=null,costMeter=null,eventBus=null}={}){this.tenantIsolation=tenantIsolation??new TenantIsolationEngine();this.rateBudget=rateBudget??new RateBudgetController();this.circuitBreaker=circuitBreaker??new CircuitBreaker();this.sandboxPolicy=sandboxPolicy??new SandboxPolicyEngine();this.costMeter=costMeter??new CostMeter();this.eventBus=eventBus??new HealthEventBus();this.auditHasher=new ComplianceAuditHasher();}
  async preflight({tenantId="default",operation="unknown",cost=1,network=false,shell=true}={}){const tenant=this.tenantIsolation.resolve({tenantId});const rate=this.rateBudget.check(tenant,{cost});const sandbox=this.sandboxPolicy.evaluate({network,shell});const circuit=this.circuitBreaker.allow();const costResult=this.costMeter.charge({tenant,operation,cost});const allowed=rate.allowed&&sandbox.allowed&&circuit&&costResult.accepted;const event=await this.eventBus.emit({type:"PREFLIGHT",tenant,operation,allowed,rate,sandbox,cost:costResult});return {version:"2.30.0",allowed,tenant,rate,sandbox,circuitOpen:!circuit,cost:costResult,auditHash:this.auditHasher.hash(event)};}
}
