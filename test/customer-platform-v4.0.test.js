import test from "node:test";
import assert from "node:assert/strict";
import {CustomerPlatformV4,CustomerAccessGovernance,CustomerEntitlementEngine,CustomerSLAEngine} from "../src/core/customer-platform-v4.0.js";

test("v3.91 RBAC authorizes scoped customer role",()=>{
 const access=new CustomerAccessGovernance(); access.grant({tenantId:"t",userId:"u",projectId:"p",role:"operator"});
 assert.equal(access.authorize({tenantId:"t",userId:"u",projectId:"p",requiredRole:"member"}).allowed,true);
 assert.equal(access.authorize({tenantId:"t",userId:"x",projectId:"p"}).allowed,false);
});
test("v3.93 plan entitlement enforces limits",()=>{
 const e=new CustomerEntitlementEngine({plans:{pro:{missions:2}}});
 assert.equal(e.evaluate({plan:"pro",metric:"missions",value:1}).allowed,true);
 assert.equal(e.evaluate({plan:"pro",metric:"missions",value:2}).allowed,false);
});
test("v3.95 SLA evaluates measured samples",()=>{
 const s=new CustomerSLAEngine({targets:{availability:.99,responseMs:1000}});
 s.record({tenantId:"t",availability:1,responseMs:500});
 assert.equal(s.evaluate({tenantId:"t"}).withinSLA,true);
});
test("v4.0 exposes enterprise governance capabilities",()=>{
 const p=new CustomerPlatformV4();
 assert.equal(p.status().version,"4.0.0");
 assert.equal(p.status().capabilities.customerRBAC,true);
 assert.equal(p.status().capabilities.auditLedger,true);
});
