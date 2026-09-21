import test from "node:test";
import assert from "node:assert/strict";
import {inspectHtml,createProjectInteractionVerifier} from "../src/core/project-interaction-verifier.js";

test("interaction verifier detects normal app controls",()=>{
  const result=inspectHtml("<body><main><form><input><button>Add</button></form><script></script></main></body>","Build a booking app");
  assert.equal(result.passed,true);
  assert.equal(result.buttons,1);
  assert.equal(result.forms,1);
});

test("interaction verifier detects game canvas",()=>{
  const result=inspectHtml("<body><canvas></canvas><script>requestAnimationFrame(loop)</script></body>","Build a card game");
  assert.equal(result.passed,true);
  assert.equal(result.game,true);
  assert.equal(result.canvas,1);
});

test("interaction verifier uses browser adapter when available",async()=>{
  const verifier=createProjectInteractionVerifier({
    browser:{verify:async({cwd,command})=>({ok:true,actions:["goto","click"],cwd,command})}
  });
  const result=await verifier({cwd:"/tmp/app",command:"Build game"});
  assert.equal(result.ok,true);
  assert.equal(result.mode,"BROWSER");
  assert.deepEqual(result.actions,["goto","click"]);
});

test("interaction verifier static fallback reports missing game surface",async()=>{
  const verifier=createProjectInteractionVerifier({
    runtimeVerifier:async()=>({ok:true,status:200,contentType:"text/html",bodyPreview:"<body><script></script></body>"})
  });
  const result=await verifier({cwd:"/tmp/app",command:"Build a game"});
  assert.equal(result.ok,false);
  assert.equal(result.mode,"STATIC_INTERACTION_CONTRACT");
});
