import test from "node:test";
import assert from "node:assert/strict";
import {generateUniversalProject} from "../src/core/universal-project-generator.js";
import {executeImplementationPlan} from "../src/core/execution-engine.js";
import {CodeGenerationEngine} from "../src/core/code-generation-engine.js";

const cases=[
  ["Build a restaurant booking system", "web", "bookings"],
  ["Build an e-commerce store with products and checkout", "web", "products"],
  ["Build a customer CRM dashboard", "web", "customers"],
  ["Build a chat application", "web", "items"],
  ["Build a racing game for mobile", "game", "items"],
  ["Build a REST API for inventory management", "api", "items"]
];

test("Universal Builder derives different product blueprints from natural-language requests",()=>{
  for(const [command,kind,entity] of cases){
    const project=generateUniversalProject(command);
    assert.equal(project.blueprint.kind,kind,command);
    assert.ok(project.files.some(file=>file.path==="src/index.html"),command);
    assert.ok(project.files.some(file=>file.path==="src/index.js"),command);
    assert.ok(project.files.some(file=>file.path==="test/index.test.js"),command);
    assert.match(project.files.find(file=>file.path==="README.md").content,/Jora Universal Builder/);
    assert.equal(project.blueprint.entities[0].name,entity,command);
  }
});

test("Universal Builder creates a playable game artifact without game-name-specific routing",()=>{
  const project=generateUniversalProject("Build a spaceship survival game with mobile controls");
  const html=project.files.find(file=>file.path==="src/index.html").content;
  assert.match(html,/canvas id="game"/);
  assert.match(html,/requestAnimationFrame\(loop\)/);
  assert.match(html,/pointermove/);
  assert.match(project.files.find(file=>file.path==="src/index.js").content,/jora-universal-builder/);
});


test("Universal Builder selects game-specific mechanics instead of one generic game for different requests",()=>{
  const cases=[
    ["Build a snake game","snake",/function tick\(\)/],
    ["Build a racing game","racing",/Distance:/],
    ["Build a space shooter game","space-shooter",/shots/],
    ["Build a platformer game","platformer",/vy=-12/]
  ];
  for(const [command,type,marker] of cases){
    const project=generateUniversalProject(command);
    assert.equal(project.blueprint.kind,"game",command);
    assert.equal(project.blueprint.gameType,type,command);
    const html=project.files.find(file=>file.path==="src/index.html").content;
    assert.match(html,marker,command);
    assert.match(html,/canvas id="game"/,command);
  }
});

test("Universal Builder extracts Phase 1 requirements from natural-language requests",()=>{
  const project=generateUniversalProject("Build a mobile booking app with login, search, admin dashboard, REST API, Razorpay, and email notifications");
  const r=project.blueprint.requirements;
  assert.ok(r.platform.includes("mobile"));
  assert.ok(r.auth.includes("Users can sign in"));
  assert.ok(r.ui.includes("dashboard"));
  assert.ok(r.userFlows.includes("search/filter"));
  assert.ok(r.api.includes("REST API"));
  assert.ok(r.integrations.includes("Razorpay"));
  assert.ok(r.integrations.includes("email delivery"));
  assert.ok(r.acceptanceCriteria.length>=2);
});

test("Universal Builder emits a complete structured Phase 1 project blueprint",()=>{
  const project=generateUniversalProject("Build a mobile booking app with login, admin dashboard, REST API, Razorpay and email notifications");
  const b=project.blueprint.projectBlueprint;
  assert.equal(b.version,"1.0");
  assert.equal(b.product.kind,"web");
  assert.ok(b.product.title.includes("mobile booking app"));
  assert.ok(b.flows.includes("book/reserve"));
  assert.ok(b.screens.includes("dashboard"));
  assert.ok(b.entities.some(x=>x.name==="bookings"));
  assert.ok(b.api.includes("REST API"));
  assert.ok(b.authentication.includes("Users can sign in"));
  assert.ok(b.integrations.includes("Razorpay"));
  assert.ok(b.platform.includes("mobile"));
  assert.ok(b.acceptanceCriteria.length>=2);
});

test("Universal Builder creates a dependency-aware Phase 1.3 implementation plan",()=>{
  const project=generateUniversalProject("Build a mobile booking app with login, admin dashboard, REST API, Razorpay and email notifications");
  const plan=project.blueprint.plan;
  assert.equal(plan.version,"1.0");
  assert.equal(plan.strategy,"dependency-aware");
  assert.equal(plan.entryStep,"01-analyze");
  assert.equal(plan.finalStep,"12-preview");
  const ids=plan.steps.map(step=>step.id);
  assert.ok(ids.includes("03-data"));
  assert.ok(ids.includes("05-screens"));
  assert.ok(ids.includes("06-flows"));
  assert.ok(ids.includes("07-api"));
  assert.ok(ids.includes("08-integrations"));
  assert.ok(ids.includes("10-verify"));
  assert.ok(ids.includes("11-repair"));
  assert.ok(ids.includes("12-preview"));
  const verify=plan.steps.find(step=>step.id==="10-verify");
  assert.ok(verify.dependsOn.includes("08-integrations"));
  const preview=plan.steps.find(step=>step.id==="12-preview");
  assert.deepEqual(preview.dependsOn,["11-repair"]);
});

test("Phase 1.4 execution engine runs planner steps in dependency order",()=>{
  const project=generateUniversalProject("Build a snake game for mobile");
  const result=executeImplementationPlan(project.blueprint.plan);
  assert.equal(result.status,"COMPLETED");
  assert.equal(result.completedSteps.length,project.blueprint.plan.steps.length);
  assert.equal(result.completedSteps[0],"01-analyze");
  assert.equal(result.completedSteps.at(-1),"12-preview");
  assert.equal(result.context.gameplay,true);
  assert.equal(result.context.previewReady,true);
  assert.ok(result.events.some(event=>event.type==="step_started"&&event.stepId==="09-gameplay"));
});
test("Phase 1.4 execution engine detects dependency deadlocks",()=>{
  const plan={steps:[
    {id:"a",dependsOn:["missing"],type:"foundation",title:"A"},
    {id:"b",dependsOn:["a"],type:"delivery",title:"B"}
  ]};
  const result=executeImplementationPlan(plan);
  assert.equal(result.status,"FAILED");
  assert.match(result.error,/deadlock/i);
});

test("Phase 1.5 compiles planner tasks into traceable code artifacts",()=>{
  const project=generateUniversalProject("Build a mobile booking app with login, REST API, Razorpay and admin dashboard");
  const generation=project.generation;
  assert.equal(generation.strategy,"task-to-code");
  assert.ok(generation.files.some(file=>file.path===".jora/plan.json"));
  assert.ok(generation.files.some(file=>file.path===".jora/requirements.json"));
  assert.ok(generation.files.some(file=>file.path===".jora/data-model.json"));
  assert.ok(generation.files.some(file=>file.path===".jora/api-contract.json"));
  assert.ok(generation.files.some(file=>file.path===".jora/integrations.json"));
  assert.ok(generation.files.some(file=>file.path===".jora/generation-manifest.json"));
  const apiTask=generation.taskMap.find(task=>task.taskId==="07-api");
  assert.ok(apiTask);
  assert.ok(apiTask.outputs.includes(".jora/api-contract.json"));
});
test("Phase 1.5 engine rejects missing blueprint or plan",()=>{
  const engine=new CodeGenerationEngine();
  assert.throws(()=>engine.generate({}),/blueprint and plan are required/);
});
