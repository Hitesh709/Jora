import test from "node:test";import assert from "node:assert/strict";import {AutonomousEvolutionController} from "../src/core/autonomous-evolution-controller.js";
test("runs repeated generations and learns",async()=>{let g=0;const c=new AutonomousEvolutionController({generationEngine:{generate:async()=>({best:{candidate:{version:"v"+(++g),evaluation:{score:.9}}},candidates:[{candidate:{version:"v"+g,evaluation:{score:.9}}}]})},experimentEngine:{run:async x=>x},learningMemory:{lessons:()=>[],record:()=>{}},scheduler:{shouldContinue:n=>n<2},selector:{select:()=>({selected:true})},maxGenerations:3});const r=await c.run({command:"improve"});assert.equal(r.generations.length,2);assert.equal(r.champion.version,"v2");});
test("autonomous evolution remains pending approval when governance is enabled",async()=>{
  const candidate={version:"v2",evaluation:{score:0.9},security:{passed:true},tests:{passed:true}};
  const controller=new AutonomousEvolutionController({
    generationEngine:{async generate(){return {best:{candidate},candidates:[{candidate}]};}},
    experimentEngine:{async run(){return {results:[]};}},
    learningMemory:{async lessons(){return [];},record(){}},
    scheduler:{shouldContinue(){return false;}},
    selector:{select(){return {selected:true,candidateScore:0.9};}},
    governance:{assess(){return {status:"EVOLUTION_READY_FOR_APPROVAL",productionReady:false};}},
    maxGenerations:1
  });
  const result=await controller.run({command:"Improve Jora",context:{champion:{version:"v1",score:0.8}}});
  assert.equal(result.generations[0].selected.selected,false);
  assert.equal(result.generations[0].selected.pendingApproval,true);
  assert.equal(result.champion.version,"v1");
});
