import test from "node:test";
import assert from "node:assert/strict";
import {MetricsCollector} from "../src/core/metrics-collector.js";
test("metrics collector exposes failure rate and release counters",async()=>{
 const m=new MetricsCollector();
 await m.recordExecution({status:"PROMOTED",durationMs:10});
 await m.recordExecution({status:"FAILED",durationMs:20});
 const s=m.snapshot();
 assert.equal(s.counters.jora_failures_total,1);
 assert.equal(s.counters.jora_successful_releases_total,1);
 assert.equal(s.health.executionFailureRate,0.5);
});
