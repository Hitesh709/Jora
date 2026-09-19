import test from "node:test";
import assert from "node:assert/strict";
import {CustomerVersionRegistry} from "../src/core/customer-control-plane-v2.js";
import {CustomerMissionOrchestrator} from "../src/core/autonomous-customer-production-v3.js";

test("v3.38 customer versions persist",async()=>{
  let saved=null;
  const store={async write(v){saved=v;},async read(){return saved||[];}};
  const registry=new CustomerVersionRegistry({store});
  registry.record({tenantId:"t",projectId:"p",missionId:"m",revision:"abc",status:"DELIVERED"});
  assert.equal(saved[0].revision,"abc");
  const restored=new CustomerVersionRegistry({store});
  await restored.load();
  assert.equal(restored.list({tenantId:"t"})[0].status,"DELIVERED");
});

test("v3.33 local test failure blocks delivery",async()=>{
  const transitions=[];
  const versions=[];
  const mission={id:"m1",tenantId:"t1",projectId:"p1",objective:"build app",status:"QUEUED"};
  const missionManager={transition(id,status,result){transitions.push(status);mission.status=status;mission.result=result;return mission;}};
  const project={id:"p1",tenantId:"t1",repository:{owner:"acme",name:"app",defaultBranch:"main"},workspace:{path:"/tmp/jora-test"}};
  const control={projects:{get(){return project;}},versions:{record(v){versions.push(v);return v;}}};
  const execution={
    customerControl:control,
    async control(){return {ready:true};},
    async runTests(){return {ok:false,stderr:"test failure"}}
  };
  const repositoryFactory={repositoryFor(){return {branch:"main"};}};
  const projectBuilder={async build(){return {status:"SUCCEEDED"};}};
  const orchestrator=new CustomerMissionOrchestrator({
    missionManager,executionPlatform:execution,
    productUnderstanding:{async understand(){return {name:"app"};}},
    architecturePlanner:{async plan(){return {plan:{}};}},
    taskDAGGenerator:{async generate(){return {dag:[]};}},
    projectBuilder,repositoryFactory
  });
  const result=await orchestrator.execute(mission,{context:{}});
  assert.equal(result.status,"FAILED");
  assert.ok(versions.some(v=>v.status==="LOCAL_TEST_FAILED"));
  assert.equal(transitions.at(-1),"FAILED");
});
