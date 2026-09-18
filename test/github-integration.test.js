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
      if(path.includes("/git/ref/heads/main")) {
        return {object:{sha:"base-sha"}};
      }
      if(path.includes("/git/commits/base-sha")) {
        return {tree:{sha:"base-tree"}};
      }
      if(path.includes("/git/trees")) return {sha:"candidate-tree"};
      if(path.includes("/git/commits") && options.method==="POST") return {sha:"candidate-sha"};
      if(path.includes("/git/refs") && options.method==="POST") return {ref:"refs/heads/jora/candidate-1",object:{sha:"candidate-sha"}};
      throw new Error("unexpected request: "+path);
    }
  }
  const repo=new FakeGitHub();
  const result=await repo.publishCandidate({
    branch:"jora/candidate-1",
    targetBranch:"main",
    files:[{path:"package.json",content:"{}"},{path:"src/index.js",content:"export {};"}]
  });
  assert.equal(result.commit,"candidate-sha");
  assert.equal(result.parent,"base-sha");
  const treeCall=calls.find(call=>call.path.endsWith("/git/trees"));
  const body=JSON.parse(treeCall.options.body);
  assert.equal(body.base_tree,"base-tree");
  assert.equal(body.tree.length,2);
  assert.equal(body.tree[0].type,"blob");
  assert.equal(body.tree[0].content,"{}");
});

test("GitHub CI gate waits for the candidate commit and passes only completed successful workflows", async()=>{
  let calls=0;
  const repository={
    async waitForWorkflow(input){
      calls+=1;
      assert.deepEqual(input,{
        branch:"jora/candidate-1",
        headSha:"candidate-sha",
        timeoutMs:1234,
        pollMs:10
      });
      return {passed:true,status:"PASSED",runs:[{name:"CI",conclusion:"success"}]};
    }
  };
  const gate=new GitHubCIGate({repository,timeoutMs:1234,pollMs:10});
  const result=await gate.review({branch:"jora/candidate-1",commit:"candidate-sha"});
  assert.equal(calls,1);
  assert.equal(result.passed,true);
});

test("GitHub CI gate blocks when no remote candidate commit exists", async()=>{
  const gate=new GitHubCIGate({
    repository:{waitForWorkflow:async()=>{throw new Error("must not poll");}}
  });
  const result=await gate.review({branch:"jora/candidate-1"});
  assert.equal(result.passed,false);
  assert.equal(result.status,"NO_REMOTE_COMMIT");
});
