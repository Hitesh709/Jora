import test from "node:test";
import assert from "node:assert/strict";
import {EvolutionGovernanceEngine} from "../src/core/evolution-governance-engine.js";

test("Phase 5 blocks a candidate that fails required gates",()=>{
  const engine=new EvolutionGovernanceEngine({minimumBenchmarkScore:0.8,minimumDelta:0.02});
  const result=engine.assess({
    baseline:{version:"v1",score:0.80},
    candidate:{version:"v2",score:0.81},
    evaluation:{score:0.81},
    security:{passed:true},
    tests:{passed:false}
  });
  assert.equal(result.status,"EVOLUTION_BLOCKED");
  assert.deepEqual(result.failedGates,["improvement","tests","approval"]);
  assert.equal(result.productionReady,false);
});

test("Phase 5 requires explicit approval before promotion",()=>{
  const engine=new EvolutionGovernanceEngine({minimumBenchmarkScore:0.8,minimumDelta:0.02});
  const assessment=engine.assess({
    baseline:null,
    candidate:{version:"v2",score:0.84},
    evaluation:{score:0.84},
    security:{passed:true},
    tests:{passed:true}
  });
  assert.equal(assessment.status,"EVOLUTION_READY_FOR_APPROVAL");
  assert.equal(assessment.productionReady,false);
  const rejected=engine.approve({assessment,approved:false});
  assert.equal(rejected.status,"EVOLUTION_REJECTED");
  const approved=engine.approve({assessment,approved:true});
  assert.equal(approved.status,"EVOLUTION_APPROVED");
  assert.equal(approved.assessment.productionReady,true);
});

test("Phase 5 blocks regressions against the champion",()=>{
  const engine=new EvolutionGovernanceEngine({minimumBenchmarkScore:0.8,minimumDelta:0});
  const result=engine.assess({
    baseline:{version:"v3",score:0.90},
    candidate:{version:"v4",score:0.88},
    evaluation:{score:0.88},
    security:{passed:true},
    tests:{passed:true},
    approval:true
  });
  assert.equal(result.status,"EVOLUTION_BLOCKED");
  assert.ok(result.failedGates.includes("improvement"));
});
