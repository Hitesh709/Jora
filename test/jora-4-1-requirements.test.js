import test from "node:test";
import assert from "node:assert/strict";
import {ProductUnderstandingEngine} from "../src/core/product-understanding-engine.js";
import {ArchitecturePlanningEngine} from "../src/core/architecture-planning-engine.js";
import {TaskDAGGenerationEngine} from "../src/core/task-dag-generation-engine.js";

test("Jora 4.1 extracts product actors features entities workflows and platform",async()=>{
  const understanding=new ProductUnderstandingEngine();
  const spec=await understanding.understand({
    input:"Build a mobile food delivery app where customers search restaurants, place orders, pay online and track drivers in real time"
  });
  assert.equal(spec.requirements.platform,"mobile");
  assert.ok(spec.requirements.features.includes("search"));
  assert.ok(spec.requirements.features.includes("payments"));
  assert.ok(spec.requirements.features.includes("realtime"));
  assert.ok(spec.requirements.entities.includes("customers"));
  assert.ok(spec.requirements.entities.includes("orders"));
  assert.ok(spec.requirements.workflows.length>0);
});

test("Jora 4.1 architecture and DAG preserve concrete product context",async()=>{
  const understanding=new ProductUnderstandingEngine();
  const architecture=new ArchitecturePlanningEngine();
  const dag=new TaskDAGGenerationEngine();
  const spec=await understanding.understand({input:"Build a multiplayer racing game for mobile players with realtime scores"});
  const plan=(await architecture.plan({specification:spec})).plan;
  const graph=dag.generate({specification:spec,architecture:plan}).dag;
  assert.equal(plan.productModel.platform,"mobile");
  assert.ok(plan.productModel.features.includes("multiplayer"));
  assert.ok(graph.productContext.features.includes("multiplayer"));
  assert.ok(graph.nodes.some(x=>x.title==="Implement product workflows"));
  assert.ok(graph.nodes.some(x=>x.title==="Implement requested capabilities"));
});
