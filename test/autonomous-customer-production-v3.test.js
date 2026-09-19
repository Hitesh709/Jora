import test from "node:test";
import assert from "node:assert/strict";
import {CustomerControlPlaneV2} from "../src/core/customer-control-plane-v2.js";
import {AutonomousCustomerProductionPlatform,CustomerPolicyGate} from "../src/core/autonomous-customer-production-v3.js";

test("v2.91 customer mission reaches production execution platform",async()=>{
  const customer=new CustomerControlPlaneV2();
  const calls=[];
  const execution={control:async input=>(calls.push(input),{status:"COMPLETED",missionId:input.context.missionId})};
  const platform=new AutonomousCustomerProductionPlatform({customerControl:customer,executionPlatform:execution});
  const tenant=await customer.tenants.create({name:"Acme"});
  const project=customer.projects.create({tenantId:tenant.id,name:"SaaS"});
  const result=await platform.submit({tenantId:tenant.id,projectId:project.id,objective:"Build billing API"});
  assert.equal(result.status,"MISSION_EXECUTED");
  assert.equal(result.mission.status,"READY_FOR_EXECUTION");
  assert.equal(calls.length,1);
});

test("v2.92 policy gate blocks high-risk work without approval",()=>{
  const gate=new CustomerPolicyGate();
  assert.equal(gate.evaluate({tenantId:"t",projectId:"p",objective:"deploy",risk:"high"}).status,"CUSTOMER_APPROVAL_REQUIRED");
  assert.equal(gate.evaluate({tenantId:"t",projectId:"p",objective:"deploy",risk:"high",approved:true}).allowed,true);
});

test("v2.94 artifact lineage records customer production result",async()=>{
  const customer=new CustomerControlPlaneV2();
  const execution={control:async()=>({status:"COMPLETED"})};
  const platform=new AutonomousCustomerProductionPlatform({customerControl:customer,executionPlatform:execution});
  const t=await customer.tenants.create({name:"Acme"});
  const p=customer.projects.create({tenantId:t.id,name:"App"});
  await platform.submit({tenantId:t.id,projectId:p.id,objective:"Create app"});
  assert.equal(platform.lineage.list({tenantId:t.id}).length,1);
});

test("v3.00 exposes end-to-end customer production capabilities",()=>{
  const customer=new CustomerControlPlaneV2();
  const platform=new AutonomousCustomerProductionPlatform({customerControl:customer,executionPlatform:{}});
  assert.equal(platform.status().version,"3.00.0");
  assert.equal(platform.status().capabilities.productionPipeline,true);
});
