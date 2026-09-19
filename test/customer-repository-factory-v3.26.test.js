import test from "node:test";
import assert from "node:assert/strict";
import {CustomerControlPlaneV2,CustomerRepositoryFactory} from "../src/core/customer-control-plane-v2.js";

test("v3.21-v3.26 repository factory provisions and attaches customer repository",async()=>{
  const calls=[];
  const github={async provisionRepository(input){calls.push(input);return {owner:{login:"acme"},name:input.name,full_name:"acme/"+input.name,clone_url:"https://github.com/acme/"+input.name+".git",html_url:"https://github.com/acme/"+input.name,default_branch:"main"};}};
  const factory=new CustomerRepositoryFactory({github,privateRepositories:true});
  const control=new CustomerControlPlaneV2({repositoryFactory:factory});
  const tenant=await control.tenants.create({name:"Acme"});
  const project=control.projects.create({tenantId:tenant.id,name:"Billing App"});
  const result=await control.repositoryFactory.provision({tenantId:tenant.id,projectId:project.id,name:project.name});
  assert.equal(result.status,"REPOSITORY_PROVISIONED");
  await control.projects.attachRepository(project.id,result.repository);
  assert.equal(control.projects.get(project.id).repository.fullName,"acme/Billing-App");
  assert.equal(calls[0].private,true);
  assert.equal(control.status().capabilities.repositoryProvisioning,true);
});
