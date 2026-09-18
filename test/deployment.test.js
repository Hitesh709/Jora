import test from "node:test";
import assert from "node:assert/strict";
import {DeploymentController} from "../src/core/deployment-controller.js";
import {HealthCheck} from "../src/core/health-check.js";
import {ObservabilityStore} from "../src/core/observability-store.js";
import {redactSecrets,requiredSecrets,isSecretName} from "../src/core/secret-config.js";

test("deployment controller deploys and records a healthy release",async()=>{
  const events=[];
  const store={async record(e){events.push(e);}};
  const controller=new DeploymentController({
    adapter:{async deploy(candidate){return {ref:"v1",url:"https://example.test"};}},
    healthCheck:{async check(){return {passed:true,status:200};}},
    store
  });
  const result=await controller.deploy({candidate:{version:"v1"},version:"v1"});
  assert.equal(result.status,"DEPLOYED");
  assert.equal(result.healthChecked,true);
  assert.equal(events.some(e=>e.type==="DEPLOYMENT_SUCCEEDED"),true);
});

test("deployment controller rolls back an unhealthy release",async()=>{
  let rolledBack=null;
  const controller=new DeploymentController({
    adapter:{
      async deploy(){return {ref:"v2"};},
      async rollback(ref){rolledBack=ref;return {rolledBack:true,ref};}
    },
    healthCheck:{async check(){return {passed:false,status:503};}}
  });
  const result=await controller.deploy({candidate:{version:"v2"},version:"v2"});
  assert.equal(result.status,"ROLLED_BACK");
  assert.equal(rolledBack,"v2");
});

test("health check retries until a passing result",async()=>{
  let calls=0;
  const health=new HealthCheck({
    attempts:3,
    intervalMs:1,
    checkFn:async()=>({passed:++calls===2})
  });
  const result=await health.check();
  assert.equal(result.passed,true);
  assert.equal(result.attempt,2);
});

test("secret controls require values and redact secret material",()=>{
  assert.deepEqual(requiredSecrets({A_TOKEN:"abc123"},["A_TOKEN"]),{A_TOKEN:"abc123"});
  assert.throws(()=>requiredSecrets({},["A_TOKEN"]),/Missing required secrets/);
  assert.equal(redactSecrets("token=abc123",["abc123"]),"token=[REDACTED]");
  assert.equal(isSecretName("OPENAI_API_KEY"),true);
});
