import test from "node:test";
import assert from "node:assert/strict";
import {Evaluator} from "../src/core/evaluator.js";
test("multidimensional evaluator returns weighted score",()=>{
 const r=new Evaluator({minimumScore:.8}).evaluate({testsPassed:true,securityPassed:true,benchmarkScore:.9,qualityScore:.9});
 assert.equal(r.passed,true); assert.equal(r.dimensions.correctness,1); assert.ok(r.score>=.8);
});
test("weak latency dimension blocks promotion",()=>{
 const r=new Evaluator({minimumScore:.8}).evaluate({testsPassed:true,securityPassed:true,benchmarkScore:.95,qualityScore:.95,metrics:{latency:.2}});
 assert.equal(r.passed,false); assert.equal(r.failedDimensions.some(x=>x.dimension==="latency"),true);
});