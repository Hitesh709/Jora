import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionStore } from "../src/core/execution-store.js";
import { InMemoryRepository } from "../src/core/repository.js";
import { SelfDevelopmentEngine } from "../src/core/self-development.js";
import { SelfInspector } from "../src/core/self-inspector.js";
import { SelfTaskGenerator } from "../src/core/task-generator.js";

test("self-development engine repairs failed work and succeeds on a later attempt", async () => {
  const store = new ExecutionStore();
  const inspector = new SelfInspector({repository: new InMemoryRepository({"/src/a.js": "export const a=1;"})});
  const taskGenerator = new SelfTaskGenerator({
    model: {async generate: undefined}
  });
  taskGenerator.model = {
    async generate() {
      return [{id: "SELF-1", title: "repairable task"}];
    }
  };

  let attempts = 0;
  const executor = {
    async execute() {
      attempts += 1;
      return {passed: attempts === 2};
    },
    async diagnose() {
      return {reason: "test failure", nextAction: "repair"};
    }
  };
  const evaluator = {
    async evaluate({result}) {
      return {passed: result.passed, testsPassed: result.passed, securityPassed: result.passed, benchmarkScore: result.passed ? 1 : 0, qualityScore: result.passed ? 1 : 0};
    }
  };

  const engine = new SelfDevelopmentEngine({
    inspector,
    taskGenerator,
    executor,
    evaluator,
    store,
    maxRepairAttempts: 3
  });

  const result = await engine.run({objective: "improve Jora"});
  assert.equal(result[0].tasks[0].status, "IDLE");
  assert.equal(result[0].tasks[0].tasks?.[0], undefined);
  assert.equal(attempts, 2);
});

test("stop prevents future cycles", async () => {
  const store = new ExecutionStore();
  const engine = new SelfDevelopmentEngine({
    inspector: {inspect: async () => ({})},
    taskGenerator: {generate: async () => []},
    executor: {execute: async () => ({passed: true})},
    evaluator: {evaluate: async () => ({passed: true})},
    store
  });
  engine.stop();
  const result = await engine.run({objective: "improve"});
  assert.deepEqual(result, []);
});
