import test from "node:test";
import assert from "node:assert/strict";
import {CustomerApplicationFactoryControlPlane,CustomerArtifactSecurityGate,CustomerProductionUrlRegistry} from "../src/core/customer-application-factory-v3.70.js";

test("v3.71-v3.80 customer SaaS control foundation",async()=>{
  const data=[]; const store={async read(){return data;},async write(v){data.splice(0,data.length,...v);}};
  const urls=new CustomerProductionUrlRegistry({store});
  await urls.record({tenantId:"t",projectId:"p",missionId:"m",url:"https://app.example",status:"DELIVERED"});
  assert.equal(urls.list({tenantId:"t"})[0].url,"https://app.example");
});

test("v3.71 security remains enforced for SaaS delivery",()=>{
  const factory=new CustomerApplicationFactoryControlPlane({security:new CustomerArtifactSecurityGate()});
  assert.equal(factory.validateArtifacts({files:[{path:".git/config",content:"x"}]}).allowed,false);
  assert.equal(factory.status().version,"3.70.0");
});
