#!/usr/bin/env node

import {
  ExecutionStore,
  InMemoryRepository,
  SelfDevelopmentEngine,
  SelfInspector,
  SelfTaskGenerator
} from "./index.js";

const objective = process.argv.slice(2).join(" ").trim() ||
  "Evolve Jora into a production-grade autonomous AI software engineering platform.";

const repository = new InMemoryRepository();
const store = new ExecutionStore();

const inspector = new SelfInspector({repository});
const taskGenerator = new SelfTaskGenerator({
  model: {
    async generate({objective: goal}) {
      return [{
        id: `BOOTSTRAP-${Date.now()}`,
        title: "Bootstrap self-development integration",
        description: goal,
        priority: 100,
        agentId: "jora-code-master"
      }];
    }
  }
});

const executor = {
  async execute(task) {
    return {
      passed: false,
      error: "Bootstrap executor is a safety stub. Connect a real Code Master + isolated sandbox before autonomous execution."
    };
  },
  async diagnose({result}) {
    return {reason: result.error, nextAction: "Configure a real executor and isolated sandbox adapter."};
  }
};

const evaluator = {
  async evaluate({result}) {
    return {
      passed: result?.passed === true,
      testsPassed: result?.passed === true,
      securityPassed: false,
      benchmarkScore: 0,
      qualityScore: 0,
      reason: result?.error
    };
  }
};

const engine = new SelfDevelopmentEngine({
  inspector,
  taskGenerator,
  executor,
  evaluator,
  store
});

const result = await engine.run({objective, cycles: 1});
console.log(JSON.stringify(result, null, 2));
