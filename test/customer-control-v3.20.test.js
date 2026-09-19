import test from "node:test";
import assert from "node:assert/strict";
import {CustomerControlPlaneV2} from "../src/core/customer-control-plane-v2.js";
import {AutonomousCustomerProductionPlatform} from "../src/core/autonomous-customer-production-v3.js";

test("v3.11-v3.20 customer factory persists lifecycle concepts", async()=>{
  const customerControl=new CustomerControlPlaneV2();
  const execution={async control(){return {ready:true};}};
  const platform=new AutonomousCustomerProductionPlatform({customerControl,executionPlatform:execution});
  const tenant=await customerControl.tenants.create({name:"Acme",plan:"standard"});
  const project=customerControl.projects.create({tenantId:tenant.id,name:"Acme App",repository:"acme/app",environment:"staging",workspace:"/workspace/acme"});
  const accepted=await customerControl.router.submit({tenantId:tenant.id,projectId:project.id,objective:"Build app"});
  assert.equal(accepted.accepted,true);
  assert.equal(accepted.workspace.environment,"staging");
  assert.equal(customerControl.meter.summarize({tenantId:tenant.id}).missions,1);
  const result=await platform.submit({tenantId:tenant.id,projectId:project.id,objective:"Build app"});
  assert.equal(result.accepted,true);
  assert.equal(result.mission.status,"READY_FOR_EXECUTION");
  assert.ok(result.mission.result.version.id.startsWith("version_"));
  assert.equal(customerControl.status().capabilities.durableCustomerState,false);
});
