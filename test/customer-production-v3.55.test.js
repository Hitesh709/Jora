import test from "node:test";
import assert from "node:assert/strict";
import {CustomerArtifactLineage} from "../src/core/autonomous-customer-production-v3.js";
import {CustomerWorkspaceRegistry,CustomerControlPlaneV2} from "../src/core/customer-control-plane-v2.js";

test("v3.45-v3.53 customer lineage persists and reloads",async()=>{
  let data=[];
  const store={async write(v){data=v;},async read(){return data;}};
  const lineage=new CustomerArtifactLineage({store});
  lineage.record({tenantId:"t",projectId:"p",missionId:"m",artifact:"application",result:{status:"DELIVERED"}});
  const restored=new CustomerArtifactLineage({store});
  await restored.load();
  assert.equal(restored.list({tenantId:"t",projectId:"p"}).length,1);
  assert.equal(restored.list({tenantId:"t"})[0].result.status,"DELIVERED");
});

test("v3.43 customer workspace gets isolated fallback path",async()=>{
  const ws=new CustomerWorkspaceRegistry();
  const control=new CustomerControlPlaneV2({workspaceRegistry:ws});
  const tenant=await control.tenants.create({name:"Acme"});
  const project=control.projects.create({tenantId:tenant.id,name:"App"});
  const accepted=await control.router.submit({tenantId:tenant.id,projectId:project.id,objective:"Build app"});
  assert.equal(accepted.accepted,true);
  assert.ok(accepted.workspace.path.includes(tenant.id));
  assert.ok(accepted.workspace.path.includes(project.id));
});
