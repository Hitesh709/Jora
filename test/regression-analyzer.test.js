import test from "node:test";
import assert from "node:assert/strict";
import {RegressionAnalyzer} from "../src/core/regression-analyzer.js";
test("detects score and dimension regression",()=>{
 const a=new RegressionAnalyzer();
 const r=a.compare({evaluation:{score:.80,dimensions:{latency:.70}}},{evaluation:{score:.90,dimensions:{latency:.90}}});
 assert.equal(r.passed,false); assert.ok(r.regressions.length>0);
});
test("accepts equal or improved candidate",()=>{
 const r=new RegressionAnalyzer().compare({evaluation:{score:.92,dimensions:{latency:.92}}},{evaluation:{score:.90,dimensions:{latency:.90}}});
 assert.equal(r.passed,true); assert.ok(r.improvements.length>0);
});
