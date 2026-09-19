import test from "node:test";
import assert from "node:assert/strict";
import {ArchitecturePlanningEngine} from "../src/core/architecture-planning-engine.js";

test("v1.52 creates a traceable architecture plan",async()=>{
  const engine=new ArchitecturePlanningEngine();
  const result=await engine.plan({specification:{
    version:"1.51.0",
    intent:{summary:"Build a loan platform"},
    goals:["Build a loan platform"],
    requirements:{functional:[{id:"FR-001",statement:"Manage loans"}],constraints:[]},
    ambiguities:[]
  }});
  assert.equal(result.status,"ARCHITECTURE_PLANNED");
  assert.equal(result.plan.version,"1.52.0");
  assert.ok(result.plan.components.length>=5);
  assert.ok(result.plan.traceability.length===1);
  assert.equal(result.plan.readiness,"READY_FOR_TASK_DAG");
});
