import test from "node:test";
import assert from "node:assert/strict";
import {CustomerControlPlaneV2} from "../src/core/customer-control-plane-v2.js";
import {AutonomousCustomerProductionPlatform} from "../src/core/autonomous-customer-production-v3.js";

test("v3.10 customer mission runs understanding -> architecture -> DAG -> delivery", async()=>{
  const customerControl=new CustomerControlPlaneV2();
  const calls=[];
  const execution={
    externalExecution:{},
    testRunner:{},
    deploymentClients:{railway:{}},
    healthVerifier:{},
    recovery:{},
    async control(input){calls.push(["control",input.operation]);return {ready:true,status:"READY"};},
    async externalEndToEnd(input){calls.push(["delivery",input]);return {status:"DELIVERED",commit:"abc123"};}
  };
  const platform=new AutonomousCustomerProductionPlatform({
    customerControl,
    executionPlatform:execution,
    productUnderstanding:{async understand({input}){calls.push(["understand",input]);return {name:"Demo",requirements:[input]};}},
    architecturePlanner:{async plan({specification}){calls.push(["architecture",specification.name]);return {plan:{services:["api"],specification};}}},
    taskDAGGenerator:{async generate({architecture}){calls.push(["dag",architecture.services[0]]);return {dag:[{id:"task-1",title:"implement api"}]};}}
  });
  const tenant=await customerControl.tenants.create({name:"Demo Customer"});
  const project=customerControl.projects.create({tenantId:tenant.id,name:"Demo Project"});
  const result=await platform.submit({
    tenantId:tenant.id,projectId:project.id,objective:"Build a demo API",
    context:{delivery:{branch:"jora/customer-demo",base:"main",files:[{path:"README.md",content:"# demo"}],message:"customer demo"}}
  });
  assert.equal(result.accepted,true);
  assert.equal(result.mission.status,"DELIVERED");
  assert.deepEqual(calls.map(x=>x[0]),["control","understand","architecture","dag","delivery"]);
  assert.equal(result.mission.result.delivery.status,"DELIVERED");
  assert.equal(result.mission.result.planning.dag[0].id,"task-1");
  assert.equal(platform.status().version,"3.10.0");
});
