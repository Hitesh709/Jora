import test from "node:test";
import assert from "node:assert/strict";
import {TenantIsolationEngine,SecretReferenceManager,RateBudgetController,CircuitBreaker,DistributedLeaseCoordinator,SandboxPolicyEngine,CostMeter,ReliabilityControlPlane} from "../src/core/reliability-control-plane-v2.js";

test("v2.21 tenant isolation rejects cross-tenant access",()=>{
  const t=new TenantIsolationEngine();t.resolve({tenantId:"a"});assert.throws(()=>t.assert("a","b"),/TENANT_ISOLATION_VIOLATION/);
});

test("v2.22 secret references only resolve allowed prefixes",()=>{
  const s=new SecretReferenceManager({env:{JORA_TEST_SECRET:"x",OTHER:"y"}});
  assert.equal(s.resolve("JORA_TEST_SECRET").found,true);
  assert.equal(s.resolve("OTHER").found,false);
  assert.equal(s.redact("x").includes("[REDACTED]"),true);
});

test("v2.23 rate and budget controls bound execution",()=>{
  const r=new RateBudgetController({maxRequests:1,maxConcurrent:1,costLimit:5});
  assert.equal(r.check("t",{cost:2}).allowed,true);
  assert.equal(r.check("t",{cost:2}).allowed,false);
  r.release("t");
});

test("v2.24 circuit breaker opens after failures",()=>{
  const c=new CircuitBreaker({failureThreshold:2});
  c.failure();c.failure();assert.equal(c.allow(),false);
});

test("v2.25 distributed lease prevents competing owners",async()=>{
  const l=new DistributedLeaseCoordinator({ttlMs:1000});
  assert.equal((await l.acquire("k","a")).acquired,true);
  assert.equal((await l.acquire("k","b")).acquired,false);
  assert.equal((await l.release("k","a")).released,true);
});

test("v2.26 sandbox policy blocks network by default",()=>{
  const p=new SandboxPolicyEngine();
  assert.equal(p.evaluate({network:true,shell:true}).allowed,false);
});

test("v2.27 cost meter enforces budget",()=>{
  const c=new CostMeter({budget:3});assert.equal(c.charge({cost:2}).accepted,true);assert.equal(c.charge({cost:2}).accepted,false);
});

test("v2.30 reliability control plane produces audited preflight",async()=>{
  const r=new ReliabilityControlPlane();
  const result=await r.preflight({tenantId:"t1",operation:"build",cost:1,network:false});
  assert.equal(result.version,"2.30.0");assert.equal(result.allowed,true);assert.equal(result.auditHash.length,64);
});
