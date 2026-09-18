import test from "node:test";
import assert from "node:assert/strict";
import {SecurityGate} from "../src/core/security-gate.js";
import {SecurityCouncil} from "../src/core/security-council.js";
import {AutonomousController} from "../src/core/autonomous-controller.js";

test("security council requires its configured quorum", async()=>{
  const gate = (name, passed) => new SecurityGate({checks:[Object.defineProperty(async()=>({passed}),"name",{value:name})]});
  const council = new SecurityCouncil({gates:[gate("static",true),gate("dependency",true),gate("policy",false)],quorum:2});
  const report=await council.review();
  assert.equal(report.passed,true);
  assert.equal(report.passedGates,2);
});

test("autonomous controller blocks promotion when security quorum fails", async()=>{
  const delivery={deliver:async()=>({project:{version:"candidate"}})};
  const securityCouncil={review:async()=>({passed:false,reports:[]})};
  const promotion={promote:async()=>({status:"PROMOTED"})};
  const controller=new AutonomousController({delivery,securityCouncil,promotion,maxCycles:1});
  const result=await controller.run({command:"build agent"});
  assert.equal(result.status,"NOT_PROMOTED");
  assert.equal(result.results[0].status,"SECURITY_BLOCKED");
});
