import test from "node:test";
import assert from "node:assert/strict";
import {PostgresTaskQueue} from "../src/core/postgres-task-queue.js";

function fakePool(){
  const jobs=[];
  return {
    jobs,
    async query(sql,p=[]){
      if(sql.includes("CREATE TABLE")||sql.includes("CREATE INDEX")) return {rows:[],rowCount:0};
      if(sql.startsWith("INSERT INTO jora_jobs")){
        const row={id:p[0],namespace:p[1],command:p[2],constraints:JSON.parse(p[3]),context:JSON.parse(p[4]),status:"QUEUED",attempts:0};
        jobs.push(row);return {rows:[row],rowCount:1};
      }
      if(sql.includes("UPDATE jora_jobs j")){
        const row=jobs.find(x=>x.namespace===p[0]&&x.status==="QUEUED");
        if(!row)return {rows:[],rowCount:0};
        row.status="RUNNING";row.attempts++;row.locked_by=p[1];return {rows:[row],rowCount:1};
      }
      if(sql.startsWith("UPDATE jora_jobs SET status='SUCCEEDED'")){
        const row=jobs.find(x=>x.id===p[0]&&x.locked_by===p[1]);
        if(!row)return {rows:[],rowCount:0};
        row.status="SUCCEEDED";row.result=JSON.parse(p[2]);row.locked_by=null;return {rows:[row],rowCount:1};
      }
      if(sql.startsWith("UPDATE jora_jobs SET status=$3")){
        const row=jobs.find(x=>x.id===p[0]&&x.locked_by===p[1]);
        if(!row)return {rows:[],rowCount:0};
        row.status=p[2];row.error=p[3];row.locked_by=null;return {rows:[row],rowCount:1};
      }
      if(sql.startsWith("SELECT * FROM jora_jobs WHERE namespace=$1 AND id=$2")){
        const row=jobs.find(x=>x.namespace===p[0]&&x.id===p[1]);return {rows:row?[row]:[],rowCount:row?1:0};
      }
      throw new Error("unexpected SQL");
    }
  };
}
test("queue enqueues, claims and completes jobs",async()=>{
  const q=new PostgresTaskQueue({pool:fakePool()});
  const job=await q.enqueue({command:"Build agent"});
  assert.equal(job.status,"QUEUED");
  const claimed=await q.claim({workerId:"node-a"});
  assert.equal(claimed.id,job.id);
  assert.equal(claimed.status,"RUNNING");
  const done=await q.complete({id:job.id,workerId:"node-a",result:{ok:true}});
  assert.equal(done.status,"SUCCEEDED");
  assert.deepEqual((await q.get(job.id)).result,{ok:true});
});
