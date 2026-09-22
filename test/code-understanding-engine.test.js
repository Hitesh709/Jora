import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspace,readWorkspaceFile} from "../src/core/workspace-engine.js";
import {
  buildCodeDependencyGraph,
  rankDependencyNeighborhood,
  traceFailureAcrossFiles,
  buildMultiFileReasoningReport,
  collectMultiFileCodeUnderstanding,
  persistCodeUnderstandingReport
} from "../src/core/code-understanding-engine.js";

test("Phase 3.2 builds a dependency graph from local imports",async()=>{
  const fs=await import("node:fs/promises");
  const ws=await createWorkspace("jora-understanding-graph");
  await fs.mkdir(ws.root+"/src",{recursive:true});
  await fs.writeFile(ws.root+"/src/index.js",'import {health} from "./server.js"; export {health};',"utf8");
  await fs.writeFile(ws.root+"/src/server.js",'import {config} from "./config.js"; export const health=()=>config;',"utf8");
  await fs.writeFile(ws.root+"/src/config.js",'export const config={status:"ok"};',"utf8");

  const graph=await buildCodeDependencyGraph(ws.root);
  assert.equal(graph.nodes.length,3);
  assert.ok(graph.edges.some(e=>e.from==="src/index.js"&&e.to==="src/server.js"));
  assert.ok(graph.edges.some(e=>e.from==="src/server.js"&&e.to==="src/config.js"));
});

test("Phase 3.2 ranks connected source neighborhoods",()=>{
  const graph={
    nodes:[{path:"src/index.js"},{path:"src/server.js"},{path:"src/config.js"}],
    edges:[
      {from:"src/index.js",to:"src/server.js"},
      {from:"src/server.js",to:"src/config.js"}
    ]
  };
  const ranked=rankDependencyNeighborhood(graph,["src/server.js"]);
  assert.equal(ranked[0].file,"src/server.js");
  assert.ok(ranked.some(x=>x.file==="src/index.js"));
  assert.ok(ranked.some(x=>x.file==="src/config.js"));
});

test("Phase 3.2 traces a failure across API and module boundaries",()=>{
  const graph={
    nodes:[
      {path:"src/index.js",externalImports:[]},
      {path:"src/server.js",externalImports:[]},
      {path:"src/config.js",externalImports:[]}
    ],
    edges:[
      {from:"src/index.js",to:"src/server.js"},
      {from:"src/server.js",to:"src/config.js"}
    ]
  };
  const trace=traceFailureAcrossFiles(graph,"API fetch returned 500; module reference error",["src/server.js"]);
  assert.ok(trace.hints.includes("api"));
  assert.ok(trace.hints.includes("module"));
  assert.equal(trace.targets[0].file,"src/server.js");
  assert.ok(trace.targets.length>=2);
});

test("Phase 3.2 produces a multi-file reasoning report with guardrails",()=>{
  const graph={
    nodes:[{path:"src/a.js"},{path:"src/b.js"}],
    edges:[{from:"src/a.js",to:"src/b.js"}]
  };
  const report=buildMultiFileReasoningReport(graph,{failure:"module error",targets:[{file:"src/a.js",score:1},{file:"src/b.js",score:.6}]},{failureText:"module error"});
  assert.equal(report.status,"UNDERSTOOD");
  assert.equal(report.reasoning.scope,"multi-file");
  assert.equal(report.connectedFiles.length,2);
  assert.ok(report.guardrails.some(x=>/tests/i.test(x)));
});

test("Phase 3.2 persists machine-readable code understanding",async()=>{
  const ws=await createWorkspace("jora-understanding-persist");
  const report=await collectMultiFileCodeUnderstanding(ws.root,{
    workspaceTests:{passed:false,stderr:"API route failed"},
    engineeringIntelligence:{diagnosis:{candidateFiles:["src/index.js"]}}
  });
  await persistCodeUnderstandingReport(ws.root,report.report);
  const stored=JSON.parse(await readWorkspaceFile(ws.root,".jora/code-understanding.json"));
  assert.equal(stored.version,"1.0");
  assert.ok(["UNDERSTOOD","INSUFFICIENT_EVIDENCE"].includes(stored.status));
});
