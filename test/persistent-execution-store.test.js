import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {JsonStore} from "../src/core/json-store.js";
import {PersistentExecutionStore} from "../src/core/persistent-execution-store.js";

test("PersistentExecutionStore does not persist generated source files in execution history",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jora-execution-store-"));
  const file=join(dir,"executions.json");
  const store=new PersistentExecutionStore({store:new JsonStore({file}),maxRecords:10});
  const created=await store.create({taskId:"task-1",agentId:"jora-master",input:{command:"Build image viewer",tenantId:"default"}});
  const hugeResult={
    status:"PROMOTED",
    files:Array.from({length:20},(_,i)=>({path:"src/file-"+i+".js",content:"x".repeat(500000)})),
    candidate:{project:{files:[{path:"src/index.html",content:"x".repeat(500000)}]}}
  };
  await store.finish(created.id,"PROMOTED",hugeResult);
  const saved=JSON.parse(await readFile(file,"utf8"));
  assert.equal(saved.executions.length,1);
  assert.equal(saved.executions[0].result.files,undefined);
  assert.equal(saved.executions[0].result.candidate,undefined);
  const size=(await stat(file)).size;
  assert.ok(size<20000,"execution state unexpectedly large: "+size+" bytes");
});
