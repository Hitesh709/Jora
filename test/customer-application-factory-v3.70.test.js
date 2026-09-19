import test from "node:test";
import assert from "node:assert/strict";
import {
  CustomerArtifactSecurityGate,
  CustomerBuildValidationGate,
  CustomerTestCommandController,
  CustomerDeliveryRecordStore,
  CustomerProductionUrlRegistry,
  CustomerApplicationFactoryControlPlane
} from "../src/core/customer-application-factory-v3.70.js";

test("v3.57 security gate blocks unsafe paths and secrets",()=>{
  const gate=new CustomerArtifactSecurityGate({maxFiles:2,maxFileBytes:100});
  const result=gate.validate([
    {path:"../escape.js",content:"safe"},
    {path:"config.js",content:"api_key='supersecretvalue123'"}
  ]);
  assert.equal(result.allowed,false);
  assert.ok(result.errors.some(x=>x.code==="UNSAFE_PATH"));
  assert.ok(result.errors.some(x=>x.code==="SECRET_DETECTED"));
});

test("v3.59 security gate enforces file limits",()=>{
  const gate=new CustomerArtifactSecurityGate({maxFiles:1,maxFileBytes:4,maxTotalBytes:5});
  const result=gate.validate([{path:"a.txt",content:"12345"} ,{path:"b.txt",content:"1"}]);
  assert.equal(result.allowed,false);
  assert.ok(result.errors.some(x=>x.code==="FILE_COUNT_LIMIT"));
  assert.ok(result.errors.some(x=>x.code==="FILE_SIZE_LIMIT"));
});

test("v3.60 build validation requires generated application",()=>{
  const gate=new CustomerBuildValidationGate();
  assert.equal(gate.validate({files:[],specification:{},architecture:{}}).allowed,false);
  assert.equal(gate.validate({files:[{path:"README.md",content:"# app"}],specification:{},architecture:{}}).allowed,true);
});

test("v3.61 test controller normalizes command and timeout",()=>{
  const controller=new CustomerTestCommandController({timeoutMs:1234});
  assert.deepEqual(controller.normalize(["test","--runInBand"]),{commandArgs:["test","--runInBand"],timeoutMs:1234});
});

test("v3.63 delivery records and v3.64 production URLs persist",async()=>{
  let deliveries=[]; let urls=[];
  const ds={async read(){return deliveries;},async write(v){deliveries=v;}};
  const us={async read(){return urls;},async write(v){urls=v;}};
  const records=new CustomerDeliveryRecordStore({store:ds});
  const production=new CustomerProductionUrlRegistry({store:us});
  const delivery=await records.record({tenantId:"t",projectId:"p",missionId:"m",status:"DELIVERED"});
  await production.record({tenantId:"t",projectId:"p",missionId:"m",url:"https://example.com",revision:"abc"});
  assert.equal(records.list({missionId:"m"})[0].status,"DELIVERED");
  assert.equal(production.list({projectId:"p"})[0].url,"https://example.com");
  assert.ok(deliveries.length===1&&urls.length===1);
  assert.ok(delivery.id.startsWith("delivery_"));
});

test("v3.70 factory exposes production capabilities",()=>{
  const factory=new CustomerApplicationFactoryControlPlane();
  const status=factory.status();
  assert.equal(status.version,"3.70.0");
  assert.equal(status.capabilities.artifactSecurity,true);
  assert.equal(status.capabilities.productionUrlRegistry,false);
});
