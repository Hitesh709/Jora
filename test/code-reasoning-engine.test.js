import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCodeEvidence,
  mapFailureToSource,
  generateSourceRepairCandidates,
  validateRepairPatch,
  applySourceRepair,
  runCodeReasoningRepairLoop
} from "../src/core/code-reasoning-engine.js";
import {createWorkspace,readWorkspaceFile} from "../src/core/workspace-engine.js";

test("Phase 3.1 maps a runtime health failure to the server source",()=>{
  const evidence={
    source:[{path:"src/index.js",content:"if(req.url===\"/broken-health\"){return res.end(\"bad\")}"}],
    failureText:"health endpoint failed: expected /health but found /broken-health",
    diagnosis:{rootCause:"runtime-or-server-contract",repairMode:"runtime-targeted",candidateTasks:["10-verify"]}
  };
  const mapping=mapFailureToSource(evidence);
  assert.equal(mapping.status,"MAPPED");
  assert.equal(mapping.candidates[0].file,"src/index.js");
  assert.equal(mapping.candidates[0].taskId,"10-verify");
});

test("Phase 3.1 generates an exact, minimal source patch",()=>{
  const evidence={
    source:[{path:"src/index.js",content:"if(req.url===\"/broken-health\"){return res.end(\"bad\")}"}],
    failureText:"health route failure",
    diagnosis:{rootCause:"runtime-or-server-contract",repairMode:"source-targeted",candidateTasks:["10-verify"]}
  };
  const candidates=generateSourceRepairCandidates(evidence);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].before,"/broken-health");
  assert.equal(candidates[0].after,"/health");
  assert.equal(validateRepairPatch(candidates[0],evidence).valid,true);
});

test("Phase 3.1 rejects path traversal and protected test edits",()=>{
  const evidence={source:[],failureText:"",diagnosis:{}};
  assert.equal(validateRepairPatch({
    path:"../test/index.test.js",operation:"replace",before:"x",after:"y"
  },evidence).valid,false);
  assert.equal(validateRepairPatch({
    path:"test/index.test.js",operation:"replace",before:"x",after:"y"
  },evidence).valid,false);
});

test("Phase 3.1 applies a patch only when its exact precondition still exists",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-code-reasoning-apply");
  const file="src/index.js";
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/"+file,"const route=\"/broken-health\";","utf8");

  const evidence=await collectCodeEvidence(ws.root,{
    workspaceTests:{passed:false,stderr:"health route failed"},
    engineeringIntelligence:{diagnosis:{rootCause:"runtime-or-server-contract",repairMode:"source-targeted"}}
  });
  const patch={id:"health",path:file,operation:"replace",before:"/broken-health",after:"/health",reason:"minimal fix"};
  const result=await applySourceRepair(ws.root,patch,evidence);
  assert.equal(result.applied,true);
  assert.equal(await readWorkspaceFile(ws.root,file),"const route=\"/health\";");

  const stale=await applySourceRepair(ws.root,patch,evidence);
  assert.equal(stale.applied,false);
  assert.match(stale.validation.reasons.join(" "),/precondition/);
});

test("Phase 3.1 repair loop repairs source and reruns workspace tests",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-code-reasoning-loop");
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/src/index.js","export const route=\"/broken-health\";","utf8");

  const result=await runCodeReasoningRepairLoop(ws.root,{
    engineeringIntelligence:{
      diagnosis:{
        rootCause:"runtime-or-server-contract",
        repairMode:"source-targeted",
        candidateTasks:["10-verify"]
      }
    },
    workspaceTests:{passed:false,stderr:"health endpoint failure /broken-health"},
    runTests:async(root)=>{
      const content=await readWorkspaceFile(root,"src/index.js");
      return {passed:content.includes("/health")&&!content.includes("/broken-health"),stdout:"",stderr:""};
    }
  });

  assert.equal(result.status,"SOURCE_REPAIRED");
  assert.equal(result.repaired,true);
  assert.equal(result.attempts,1);
  assert.equal(result.history[0].applied.applied,true);
  assert.match(await readWorkspaceFile(ws.root,"src/index.js"),/\/health/);
});
