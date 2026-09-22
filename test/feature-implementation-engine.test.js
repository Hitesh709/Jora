import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createWorkspace} from "../src/core/workspace-engine.js";
import {runFeatureImplementationLoop,buildFeatureImplementationPlan,validateFeatureImplementationPlan,applyFeatureImplementation} from "../src/core/feature-implementation-engine.js";

async function seed(root,html){await fsWrite(root+"/src/index.html",html)}
async function fsWrite(p,c){const fs=await import("node:fs/promises");await fs.writeFile(p,c,"utf8")}

test("Phase 3.6 implements requested UI behavior",async()=>{
 const ws=await createWorkspace("jora-feature-36");
 await seed(ws.root,'<main><div id="list"><article class="item">Alpha</article></div></main><script></script></body>');
 const r=await runFeatureImplementationLoop(ws.root,{command:"Add search and login",desiredFeatures:["search","authentication"],runTests:async()=>({passed:true})});
 assert.equal(r.status,"FEATURES_IMPLEMENTED");const h=await readFile(ws.root+"/src/index.html","utf8");assert.match(h,/data-jora-feature="search"/);assert.match(h,/auth-submit/);assert.match(h,/feature-search/);
});
test("Phase 3.6 skips implemented features",async()=>{
 const ws=await createWorkspace("jora-feature-36-existing");await seed(ws.root,'<main><section data-jora-feature="search"></section></main>');
 const r=await runFeatureImplementationLoop(ws.root,{desiredFeatures:["search"],runTests:async()=>({passed:true})});assert.equal(r.status,"NO_FEATURE_IMPLEMENTATION");
});
test("Phase 3.6 validates feature plans",()=>{assert.equal(validateFeatureImplementationPlan({patches:[{feature:"unknown",html:"x"}]}).valid,false)});
test("Phase 3.6 rolls back on regression",async()=>{
 const ws=await createWorkspace("jora-feature-36-rollback");await seed(ws.root,"<main></main>");
 const p=buildFeatureImplementationPlan({missing:["chat"],html:"<main></main>"});
 const r=await applyFeatureImplementation(ws.root,p,{runTests:async()=>({passed:false})});assert.equal(r.status,"ROLLED_BACK");
 const h=await readFile(ws.root+"/src/index.html","utf8");assert.doesNotMatch(h,/data-jora-feature="chat"/);
});
