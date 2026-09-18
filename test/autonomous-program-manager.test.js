import test from "node:test";
import assert from "node:assert/strict";
import {RoadmapEngine} from "../src/core/roadmap-engine.js";
import {MissionManager} from "../src/core/mission-manager.js";
import {AutonomousMissionRunner} from "../src/core/autonomous-mission-runner.js";

class MemoryStore {
  constructor(){this.value=null;}
  async read(fallback){return this.value?structuredClone(this.value):structuredClone(fallback);}
  async write(value){this.value=structuredClone(value);}
}

test("roadmap persists claims, attempts and completion", async()=>{
  const store=new MemoryStore();
  const roadmap=new RoadmapEngine({
    store,
    roadmap:[
      {id:"a",title:"A",priority:2,dependencies:[]},
      {id:"b",title:"B",priority:1,dependencies:["a"]}
    ]
  });
  const manager=new MissionManager({roadmap,maxAttempts:2});
  await manager.initialize();
  const [a]=await manager.nextWork({objective:"x"});
  await manager.claim(a);
  await manager.fail(a,{reason:"test"});
  assert.equal(roadmap.get("a").status,"FAILED");
  assert.equal(roadmap.get("a").attempts,1);
  const [retry]=await manager.nextWork({objective:"x"});
  await manager.claim(retry);
  await manager.complete(retry,{verified:true});
  assert.equal(roadmap.get("a").status,"DONE");
  assert.equal((await manager.nextWork({objective:"x"}))[0].id,"b");
});

test("verified mission runner does not mark an unverified task done", async()=>{
  const roadmap=new RoadmapEngine({roadmap:[{id:"a",title:"A",dependencies:[]}]});
  const manager=new MissionManager({roadmap,maxAttempts:2});
  await manager.initialize();
  const runner=new AutonomousMissionRunner({
    missionManager:manager,
    executeTask:async()=>({status:"COMPLETED"}),
    maxCycles:1
  });
  const result=await runner.run({objective:"x"});
  assert.equal(result.results[0].status,"VERIFICATION_FAILED");
  assert.equal(roadmap.get("a").status,"FAILED");
});

test("verified mission runner completes promoted work", async()=>{
  const roadmap=new RoadmapEngine({roadmap:[{id:"a",title:"A",dependencies:[]}]});
  const manager=new MissionManager({roadmap});
  await manager.initialize();
  const runner=new AutonomousMissionRunner({
    missionManager:manager,
    executeTask:async()=>({status:"PROMOTED",promotion:{commit:"abc"}}),
    maxCycles:1
  });
  const result=await runner.run({objective:"x"});
  assert.equal(result.results[0].status,"DONE");
  assert.equal(roadmap.get("a").status,"DONE");
});
