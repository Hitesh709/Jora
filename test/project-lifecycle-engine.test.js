import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildProjectLifecycle,
  buildProjectRoadmap,
  recordProjectLifecycle,
  initializeProjectLifecycle,
  transitionProjectLifecycle,
  validateProjectLifecycle,
  loadProjectLifecycle,
  loadProjectLifecycleHistory
} from "../src/core/project-lifecycle-engine.js";

async function temp(){return fs.mkdtemp(path.join(os.tmpdir(),"jora-lifecycle-"))}

test("builds a durable project lifecycle with identity and roadmap",()=>{
  const lifecycle=buildProjectLifecycle({
    projectName:"test-app",
    command:"Build a task app with search",
    state:"initialized",
    contract:{entrypoints:["src/index.js"],features:["search"]}
  });
  assert.equal(lifecycle.identity.name,"test-app");
  assert.equal(lifecycle.state,"initialized");
  assert.equal(lifecycle.identity.entrypoints[0],"src/index.js");
  assert.ok(lifecycle.roadmap.length===0);
  const roadmap=buildProjectRoadmap({command:"Build a task app",contract:{features:["search"]}});
  assert.ok(roadmap.some(x=>x.id==="mission"));
  assert.ok(roadmap.some(x=>x.id==="feature-search"));
});

test("initializes and persists lifecycle plus history",async()=>{
  const root=await temp();
  const contract={entrypoints:["src/index.js"],features:["search"],routes:["/api/search"],api:{routeCount:1}};
  const result=await initializeProjectLifecycle(root,{contract,command:"Build search app",projectName:"search-app"});
  assert.equal(result.status,"LIFECYCLE_RECORDED");
  const lifecycle=await loadProjectLifecycle(root);
  const history=await loadProjectLifecycleHistory(root);
  assert.equal(lifecycle.identity.name,"search-app");
  assert.equal(lifecycle.state,"initialized");
  assert.equal(history.length,1);
  await fs.rm(root,{recursive:true,force:true});
});

test("records lifecycle transitions and preserves versions",async()=>{
  const root=await temp();
  const contract={entrypoints:["src/index.js"],features:["chat"]};
  await initializeProjectLifecycle(root,{contract,command:"Build chat app",projectName:"chat-app"});
  const transitioned=await transitionProjectLifecycle(root,"verifying",{
    command:"Build chat app",
    phase:"verification",
    status:"VERIFYING",
    summary:"Browser verification started.",
    changes:["run browser verification"]
  });
  assert.equal(transitioned.lifecycle.state,"verifying");
  assert.equal(transitioned.lifecycle.versions.length,2);
  assert.equal(transitioned.lifecycle.history.length,2);
  const valid=validateProjectLifecycle(transitioned.lifecycle);
  assert.equal(valid.valid,true);
  await fs.rm(root,{recursive:true,force:true});
});

test("rejects invalid lifecycle states",()=>{
  const result=validateProjectLifecycle({version:"1.0",identity:{name:"x"},state:"invalid",roadmap:[],history:[]});
  assert.equal(result.valid,false);
  assert.ok(result.reasons.includes("invalid lifecycle state"));
});
