import test from "node:test";
import assert from "node:assert/strict";
import { TaskRegistry, STATUS, Orchestrator, Evaluator, EvolutionEngine } from "../src/index.js";

test("task dependencies gate execution", () => {
  const r = new TaskRegistry([
    { id: "T1", status: STATUS.READY },
    { id: "T2", status: STATUS.READY, dependencies: ["T1"] }
  ]);
  assert.equal(r.canStart("T2"), false);
  r.transition("T1", STATUS.IN_PROGRESS);
  r.transition("T1", STATUS.IMPLEMENTED);
  r.transition("T1", STATUS.TESTING);
  r.transition("T1", STATUS.REVIEW);
  r.transition("T1", STATUS.APPROVED);
  r.transition("T1", STATUS.DEPLOYED);
  r.transition("T1", STATUS.DONE);
  assert.equal(r.canStart("T2"), true);
});

test("orchestrator creates a controlled plan", () => {
  const r = new TaskRegistry();
  const o = new Orchestrator({ registry: r });
  assert.equal(o.plan("Build an agent").governance, "controlled");
});

test("evaluator requires tests, security and benchmark thresholds", () => {
  const e = new Evaluator({ minimumScore: 0.8 });
  assert.equal(e.evaluate({testsPassed:true, securityPassed:true, benchmarkScore:.9, qualityScore:.9}).passed, true);
  assert.equal(e.evaluate({testsPassed:true, securityPassed:false, benchmarkScore:.99, qualityScore:.99}).passed, false);
});

test("evolution proposal uses a controlled lifecycle", () => {
  const e = new EvolutionEngine({ evaluator: new Evaluator() });
  const p = e.propose({champion:"v1", weakness:"debugging", hypothesis:"add critic", candidate:"v2"});
  assert.equal(p.lifecycle.at(0), "GENERATE");
  assert.equal(p.lifecycle.at(-1), "ROLLBACK");
});