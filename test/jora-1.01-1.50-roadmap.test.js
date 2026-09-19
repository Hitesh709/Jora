import test from "node:test";
import assert from "node:assert/strict";
import {JORA_1_01_1_50_ROADMAP,JORA_MASTER_ROADMAP} from "../src/core/jora-1.01-1.50-roadmap.js";

test("v1.01-v1.50 roadmap contains 50 sequential milestones",()=>{
  assert.equal(JORA_1_01_1_50_ROADMAP.length,50);
  assert.equal(JORA_1_01_1_50_ROADMAP[0].version,"1.01");
  assert.equal(JORA_1_01_1_50_ROADMAP.at(-1).version,"1.50");
  assert.equal(JORA_1_01_1_50_ROADMAP[0].dependencies[0],"v100");
  for(let i=1;i<JORA_1_01_1_50_ROADMAP.length;i++){
    assert.equal(
      JORA_1_01_1_50_ROADMAP[i].dependencies[0],
      JORA_1_01_1_50_ROADMAP[i-1].id
    );
  }
  assert.equal(JORA_MASTER_ROADMAP.length,95);
});
