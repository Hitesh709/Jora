import test from "node:test";
import assert from "node:assert/strict";
import {GitHubExecutionAdapter,RealTestExecutionAdapter,DeploymentProviderAdapter,ProductionHealthVerifier,AutomaticRollbackExecutor,ExecutionEvidenceStore,ExternalExecutionControlPlaneV2} from "../src/core/external-execution-control-plane-v2.js";

test("v2.71 GitHub adapter delegates mutation and PR operations",async()=>{
  const calls=[];
  const repository={
    publishCandidate:async x=>(calls.push(["mutate",x]),{commit:"abc123",branch:x.branch}),
    createPullRequest:async x=>(calls.push(["pr",x]),{number:7})
  };
  const github=new GitHubExecutionAdapter({repository});
  assert.equal((await github.mutate({branch:"jora/test",files:[]})).status,"GITHUB_MUTATION_COMPLETED");
  assert.equal((await github.pullRequest({title:"test",head:"jora/test",base:"main"})).pullRequest.number,7);
  assert.equal(calls.length,2);
});

test("v2.73 test adapter executes the real injected runner",async()=>{
  const adapter=new RealTestExecutionAdapter({runner:async({commandArgs})=>({status:"PASSED",commandArgs})});
  const result=await adapter.run({commandArgs:["test","--watch=false"]});
  assert.equal(result.status,"PASSED");
  assert.deepEqual(result.result.commandArgs,["test","--watch=false"]);
});

test("v2.75 deployment adapter delegates to configured provider",async()=>{
  const adapter=new DeploymentProviderAdapter({name:"railway",client:{deploy:async x=>({accepted:true,status:"DEPLOYMENT_TRIGGERED",...x})}});
  const result=await adapter.deploy({target:"production"});
  assert.equal(result.status,"DEPLOYMENT_TRIGGERED");
});

test("v2.77 health verifier checks endpoint",async()=>{
  const verifier=new ProductionHealthVerifier();
  const result=await verifier.verify({url:"data:text/plain,healthy"});
  assert.equal(result.healthy,true);
});

test("v2.78 rollback executor delegates rollback",async()=>{
  const executor=new AutomaticRollbackExecutor({rollback:async x=>({rolledBack:true,target:x.target,ref:x.ref})});
  const result=await executor.execute({target:"railway",ref:"abc"});
  assert.equal(result.rolledBack,true);
});

test("v2.79 evidence is persisted and v2.80 loop records external execution",async()=>{
  const evidence=new ExecutionEvidenceStore();
  const plane=new ExternalExecutionControlPlaneV2({
    github:{
      mutate:async()=>({status:"GITHUB_MUTATION_COMPLETED",commit:"abc"}),
      waitForCI:async()=>({passed:true,status:"PASSED"}),
      pullRequest:async()=>({status:"PULL_REQUEST_CREATED",pullRequest:{number:1}})
    },
    deployments:{railway:{deploy:async()=>({accepted:true,status:"DEPLOYMENT_TRIGGERED"})}},
    health:{verify:async()=>({healthy:true,status:"HEALTHY"})},
    evidence
  });
  const result=await plane.endToEnd({branch:"jora/test",base:"main",provider:"railway",target:"production",healthUrl:"https://example.invalid"});
  assert.equal(result.status,"DELIVERED");
  assert.ok(evidence.list().length>=4);
  assert.equal(plane.status().version,"2.80.0");
});
