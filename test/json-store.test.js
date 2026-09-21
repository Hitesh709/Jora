import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {JsonStore} from "../src/core/json-store.js";

test("JsonStore quarantines malformed JSON and restores the default state", async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jora-json-store-"));
  const file=join(dir,"state.json");
  await writeFile(file,'{"broken": true} trailing',"utf8");

  const store=new JsonStore({file});
  const value=await store.read({items:[]});

  assert.deepEqual(value,{items:[]});
  assert.deepEqual(JSON.parse(await readFile(file,"utf8")),{items:[]});

  const files=await readdir(dir);
  assert.equal(files.filter(name=>name.startsWith("state.json.corrupt-")).length,1);
});

test("JsonStore still propagates non-JSON filesystem errors", async()=>{
  const store=new JsonStore({file:"/dev/null/jora-state.json"});
  await assert.rejects(()=>store.read({items:[]})); 
});


test("JsonStore serializes concurrent writes to the same file",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jora-json-race-"));
  const file=join(dir,"observability.json");
  const storeA=new JsonStore({file});
  const storeB=new JsonStore({file});
  await Promise.all([
    storeA.write({events:[{id:"a"}]}),
    storeB.write({events:[{id:"b"}]}),
    storeA.write({events:[{id:"c"}]}),
    storeB.write({events:[{id:"d"}]})
  ]);
  const value=JSON.parse(await readFile(file,"utf8"));
  assert.ok(Array.isArray(value.events));
  assert.equal(value.events.length,1);
});
