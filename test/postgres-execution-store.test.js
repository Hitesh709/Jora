import test from "node:test";
import assert from "node:assert/strict";
import {PostgresExecutionStore} from "../src/core/postgres-execution-store.js";
function fakePool(){const rows=[];return {rows,async query(sql,p=[]){
  if(sql.includes("CREATE TABLE")||sql.includes("CREATE INDEX"))return {rows:[],rowCount:0};
  if(sql.startsWith("INSERT INTO jora_executions")){const row={id:p[0],namespace:p[1],task_id:p[2],agent_id:p[3],input:JSON.parse(p[4]),status:"RUNNING",trace:[],result:null,created_at:new Date(),updated_at:new Date()};rows.push(row);return {rows:[row],rowCount:1};}
  if(sql.startsWith("UPDATE jora_executions")&&sql.includes("trace=")){const row=rows.find(x=>x.id===p[0]&&x.namespace===p[1]);if(!row)return {rows:[],rowCount:0};row.trace.push(...JSON.parse(p[2]));return {rows:[row],rowCount:1};}
  if(sql.startsWith("UPDATE jora_executions")&&sql.includes("status=$3")){const row=rows.find(x=>x.id===p[0]&&x.namespace===p[1]);if(!row)return {rows:[],rowCount:0};row.status=p[2];row.result=JSON.parse(p[3]);return {rows:[row],rowCount:1};}
  if(sql.startsWith("SELECT * FROM jora_executions WHERE namespace=$1 AND id=$2")){const row=rows.find(x=>x.namespace===p[0]&&x.id===p[1]);return {rows:row?[row]:[],rowCount:row?1:0};}
  throw new Error("unexpected SQL");
}}}
test("postgres execution store persists execution lifecycle",async()=>{const store=new PostgresExecutionStore({pool:fakePool()});const e=await store.create({taskId:"build",agentId:"master",input:{command:"x"}});await store.append(e.id,{type:"BUILD_COMPLETE"});const done=await store.finish(e.id,"PROMOTED",{version:"1"});assert.equal(done.status,"PROMOTED");assert.equal((await store.get(e.id)).trace.length,1);assert.deepEqual((await store.get(e.id)).result,{version:"1"});});
