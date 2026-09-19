import test from "node:test";
import assert from "node:assert/strict";
import {TaskDAGGenerationEngine} from "../src/core/task-dag-generation-engine.js";

test("v1.53 generates an acyclic executable task DAG",()=>{
  const engine=new TaskDAGGenerationEngine();
  const result=engine.generate({
    specification:{requirements:{functional:[{id:"FR-001",statement:"Manage loans"}]}},
    architecture:{components:[
      {id:"COMP-001"},{id:"COMP-002"},{id:"COMP-003"},{id:"COMP-004"},{id:"COMP-005"},{id:"COMP-006"}
    ]}
  });
  assert.equal(result.status,"TASK_DAG_GENERATED");
  assert.equal(result.dag.version,"1.53.0");
  assert.ok(result.dag.nodes.length>=6);
  assert.ok(result.dag.levels.length>=6);
  assert.equal(result.dag.entryTask,"TASK-001");
  assert.equal(result.dag.terminalTasks[0],"TASK-006");
});
