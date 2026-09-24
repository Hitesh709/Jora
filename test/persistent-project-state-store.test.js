import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {JsonStore} from "../src/core/json-store.js";
import {PersistentProjectStateStore} from "../src/core/persistent-project-state-store.js";

test("PersistentProjectStateStore persists compact project state and restores it",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jora-project-state-"));
  const store=new PersistentProjectStateStore({store:new JsonStore({file:join(dir,"projects.json")}),maxRecords:10});
  await store.save("Mini Car Racing Game",{
    project:"mini car racing game",
    domain:"game",
    goal:"Build a mini car racing game",
    requirements:["Build a mini car racing game","Add score"],
    completed:[],
    pending:[],
    constraints:[],
    lastAction:"modify",
    lastRequest:"Add score",
    turnCount:2
  });
  const restored=await store.get("mini car racing game");
  assert.equal(restored.projectId,"mini-car-racing-game");
  assert.equal(restored.state.project,"mini car racing game");
  assert.equal(restored.state.requirements.length,2);
});

test("PersistentProjectStateStore bounds retained projects",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jora-project-state-limit-"));
  const store=new PersistentProjectStateStore({store:new JsonStore({file:join(dir,"projects.json")}),maxRecords:20});
  for(let i=0;i<25;i++) await store.save("project-"+i,{project:"project-"+i,domain:"software",requirements:[]});
  const list=await store.list({limit:100});
  assert.equal(list.length,20);
});
