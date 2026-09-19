import test from "node:test";
import assert from "node:assert/strict";
import {ApprovalGate,PersistentLocalQueue,WorkerPool} from "../src/core/execution-platform-v2.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("v2 approval gate authorizes low-risk and queues high-risk",()=>{
  const gate=new ApprovalGate();
  assert.equal(gate.evaluate({operation:"docs",risk:"low"}).status,"APPROVED");
  const pending=gate.evaluate({operation:"production deploy",risk:"high"});
  assert.equal(pending.status,"APPROVAL_REQUIRED");
  assert.equal(gate.list().length,1);
  assert.equal(gate.approve(pending.request.id).status,"APPROVED");
  assert.equal(gate.list().length,0);
});

test("v2 local queue persists jobs",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"jora-v2-"));
  const file=path.join(dir,"queue.json");
  const q=new PersistentLocalQueue({file});
  const job=await q.enqueue({command:"npm test"});
  assert.equal((await q.list({status:"QUEUED"})).length,1);
  const claimed=await q.claim({workerId:"test-worker"});
  assert.equal(claimed.id,job.id);
  await q.complete({id:job.id,workerId:"test-worker",result:{ok:true}});
  assert.equal((await q.get(job.id)).status,"SUCCEEDED");
  await fs.rm(dir,{recursive:true,force:true});
});

test("v2 worker pool runs tasks concurrently within configured capacity",async()=>{
  const pool=new WorkerPool({concurrency:2});
  const result=await pool.run([async()=>1,async()=>2,async()=>3]);
  assert.deepEqual(result,[1,2,3]);
  assert.equal(pool.total,3);
});
