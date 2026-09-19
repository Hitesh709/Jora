import test from "node:test";
import assert from "node:assert/strict";
import {CustomerTenantRegistry,ProjectRegistry,CustomerMissionManager,QuotaGuard,UsageMeter,CustomerExecutionRouter,CustomerControlPlaneV2} from "../src/core/customer-control-plane-v2.js";

test("v2.81 tenant lifecycle creates and suspends tenants",async()=>{
  const tenants=new CustomerTenantRegistry();
  const tenant=await tenants.create({name:"Acme"});
  assert.equal(tenant.status,"ACTIVE");
  assert.equal((await tenants.suspend(tenant.id)).status,"SUSPENDED");
});

test("v2.82 project isolation binds projects to tenants",()=>{
  const projects=new ProjectRegistry();
  const p=projects.create({tenantId:"t1",name:"app"});
  assert.equal(p.tenantId,"t1");
  assert.equal(projects.list("t2").length,0);
});

test("v2.83 usage metering aggregates customer activity",()=>{
  const meter=new UsageMeter();
  meter.record({tenantId:"t1",metric:"missions",quantity:2});
  meter.record({tenantId:"t1",metric:"missions",quantity:3});
  assert.equal(meter.summarize({tenantId:"t1"}).missions,5);
});

test("v2.84 quota guard blocks excess usage",()=>{
  const q=new QuotaGuard({limits:{missions:5}});
  assert.equal(q.evaluate({metric:"missions",current:5,requested:1}).status,"QUOTA_EXCEEDED");
});

test("v2.85 customer mission router enforces tenant/project ownership",async()=>{
  const tenants=new CustomerTenantRegistry();
  const projects=new ProjectRegistry();
  const missions=new CustomerMissionManager();
  const meter=new UsageMeter();
  const router=new CustomerExecutionRouter({tenantRegistry:tenants,projectRegistry:projects,missionManager:missions,quotaGuard:new QuotaGuard(),meter});
  const t=await tenants.create({name:"Acme"});
  const p=projects.create({tenantId:t.id,name:"app"});
  const accepted=await router.submit({tenantId:t.id,projectId:p.id,objective:"Build API"});
  assert.equal(accepted.status,"MISSION_ACCEPTED");
  const denied=await router.submit({tenantId:"wrong",projectId:p.id,objective:"Build API"});
  assert.equal(denied.status,"TENANT_NOT_FOUND");
});

test("v2.90 customer control plane exposes capabilities",()=>{
  const plane=new CustomerControlPlaneV2();
  assert.equal(plane.status().version,"3.50.0");
  assert.equal(plane.status().capabilities.executionRouting,true);
});
