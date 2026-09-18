import test from "node:test";
import assert from "node:assert/strict";
import {MetricsCollector} from "../src/core/metrics-collector.js";
test("metrics collector aggregates counters and durations",async()=>{
 const m=new MetricsCollector();
 m.increment("jobs",1,{status:"ok"});m.increment("jobs",2,{status:"ok"});
 m.observe("latency",10);m.observe("latency",20);
 const s=m.snapshot();
 assert.equal(s.counters['jobs{status="ok"}'],3);
 assert.equal(s.histograms.latency.count,2);
 assert.equal(s.histograms.latency.avg,15);
});
