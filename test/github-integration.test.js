import test from "node:test";
import assert from "node:assert/strict";
import {GitHubRestRepository} from "../src/core/github-rest-repository.js";
import {GitHubCIGate} from "../src/core/github-ci-gate.js";

test("GitHub candidate publication builds an atomic commit from the target tree", async()=>{
  const calls=[];
  class FakeGitHub extends GitHubRestRepository {
    constructor(){super({token:"test-token",owner:"owner",repo:"repo"});}
    async request(path,options={}) {
      calls.push({path,options});
      if(path.includes("/git/ref/heads/jora%2Fcandidate-1")) throw new Error("GitHub request failed: 404");
      if(path.includes("/git/ref/heads/main")) return {object:{sha:"base-sha"}};
      if(path.includes("/git/commits/base-sha")) return {tree:{sha:"base-tree"}};
      if(path.includes("/git/trees")) return {sha:"candidate-tree"};
      if(path.includes("/git/commits") && options.method==="POST") return {sha:"candidate-sha"};
      if(path.includes("/git/refs") && options.method==="POST") return {ref:"refs/heads/jora/candidate-1",object:{sha:"candidate-sha"}};
      throw new Error("unexpected request: "+path);
    }
  }
  const repo=new FakeGitHub();
  const result=await repo.publishCandidate({
    branch:"jora/candidate-1",targetBranch:"main",
    files:[{path:"package.json",content:"{}"},{path:"src/index.js",content:"export {};"}]
  });
  assert.equal(result.commit,"candidate-sha");
  assert.equal(result.parent,"base-sha");
  assert.equal(result.updatedExisting,false);
  const treeCall=calls.find(call=>call.path.endsWith("/git/trees"));
  const body=JSON.parse(treeCall.options.body);
  assert.equal(body.base_tree,"base-tree");
  assert.equal(body.tree.length,2);
  assert.equal(body.tree[0].type,"blob");
  assert.equal(body.tree[0].content,"{}");
});

test("GitHub candidate publication advances an existing candidate branch without force", async()=>{
  const calls=[];
  class FakeGitHub extends GitHubRestRepository {
    constructor(){super({token:"test-token",owner:"owner",repo:"repo"});}
    async request(path,options={}) {
      calls.push({path,options});
      if(path.includes("/git/ref/heads/jora%2Fcandidate-1")) return {object:{sha:"old-candidate"}};
      if(path.includes("/git/commits/old-candidate")) return {tree:{sha:"old-tree"}};
      if(path.includes("/git/trees")) return {sha:"new-tree"};
      if(path.includes("/git/commits") && options.method==="POST") return {sha:"new-candidate"};
      if(path.includes("/git/refs/heads/jora%2Fcandidate-1") && options.method==="PATCH") return {ref:"refs/heads/jora/candidate-1",object:{sha:"new-candidate"}};
      throw new Error("unexpected request: "+path);
    }
  }
  const result=await new FakeGitHub().publishCandidate({
    branch:"jora/candidate-1",targetBranch:"main",files:[{path:"src/index.js",content:"export {};"}]
  });
  assert.equal(result.parent,"old-candidate");
  assert.equal(result.commit,"new-candidate");
  assert.equal(result.updatedExisting,true);
  const patch=calls.find(call=>call.options.method==="PATCH");
  assert.equal(JSON.parse(patch.options.body).force,false);
});

test("GitHub CI gate waits for the candidate commit and passes only completed successful workflows", async()=>{
  let calls=0;
  const repository={async waitForWorkflow(input){
    calls+=1;
    assert.deepEqual(input,{branch:"jora/candidate-1",headSha:"candidate-sha",timeoutMs:1234,pollMs:10});
    return {passed:true,status:"PASSED",runs:[{name:"CI",conclusion:"success"}]};
  }};
  const gate=new GitHubCIGate({repository,timeoutMs:1234,pollMs:10});
  const result=await gate.review({branch:"jora/candidate-1",commit:"candidate-sha"});
  assert.equal(calls,1);
  assert.equal(result.passed,true);
});

test("GitHub CI gate blocks when no remote candidate commit exists", async()=>{
  const gate=new GitHubCIGate({repository:{waitForWorkflow:async()=>{throw new Error("must not poll");}}});
  const result=await gate.review({branch:"jora/candidate-1"});
  assert.equal(result.passed,false);
  assert.equal(result.status,"NO_REMOTE_COMMIT");
});

test("GitHub workflow polling returns failed job logs as repair evidence", async()=>{
  const calls=[];
  class FakeGitHub extends GitHubRestRepository {
    constructor(){super({token:"test-token",owner:"owner",repo:"repo"});}
    async request(path,options={}) {
      calls.push({path,options});
      if(path.includes("/actions/runs?")) return {workflow_runs:[{
        id:42,workflow_id:1,name:"CI",status:"completed",conclusion:"failure",
        head_branch:"jora/candidate-1",head_sha:"candidate-sha",created_at:"2026-09-18T17:00:00Z"
      }]};
      if(path.includes("/actions/runs/42/jobs")) return {jobs:[{id:99,name:"test",conclusion:"failure",steps:[]}]};
      throw new Error("unexpected request: "+path);
    }
  }
  const repo=new FakeGitHub();
  repo.workflowFailureEvidence=async run=>({run,failedJobs:[{id:99,name:"test",conclusion:"failure",logs:"AssertionError: expected 1"}]});
  const result=await repo.waitForWorkflow({branch:"jora/candidate-1",headSha:"candidate-sha",timeoutMs:50,pollMs:1});
  assert.equal(result.passed,false);
  assert.equal(result.status,"FAILED");
  assert.match(result.evidence.failedJobs[0].logs,/AssertionError/);
});

test("GitHub workflow polling passes after the candidate run completes successfully", async()=>{
  let poll=0;
  class FakeGitHub extends GitHubRestRepository {
    constructor(){super({token:"test-token",owner:"owner",repo:"repo"});}
    async request(path) {
      assert.match(path,/actions\/runs/);
      poll+=1;
      return {workflow_runs:[{
        id:poll,workflow_id:1,name:"CI",head_branch:"jora/candidate-1",head_sha:"candidate-sha",
        status:poll===1?"queued":"completed",conclusion:poll===1?null:"success",created_at:new Date().toISOString()
      }]};
    }
  }
  const result=await new FakeGitHub().waitForWorkflow({branch:"jora/candidate-1",headSha:"candidate-sha",timeoutMs:100,pollMs:1});
  assert.equal(result.passed,true);
  assert.equal(result.status,"PASSED");
  assert.equal(poll,2);
});
