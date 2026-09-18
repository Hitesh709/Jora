import test from "node:test";
import assert from "node:assert/strict";
import {ProviderRegistry,JsonStore,PersistentExecutionStore,DeploymentAdapter} from "../src/index.js";

test("provider registry accepts a completion provider",()=>{const r=new ProviderRegistry(); r.register("mock",{complete:async()=>({text:"ok"})}); assert.deepEqual(r.list(),["mock"]);});
test("json store persists structured data",async()=>{const mem={}; const store=new JsonStore({file:"./.jora-test.json"}); const original=store.file; store.file="/tmp/jora-test-store.json"; await store.write({n:1}); assert.equal((await store.read()).n,1); store.file=original;});
test("persistent execution store records lifecycle",async()=>{const store=new PersistentExecutionStore({store:new JsonStore({file:"/tmp/jora-executions.json"})}); const e=await store.create({taskId:"t",agentId:"a",input:{x:1}}); await store.append(e.id,{type:"started"}); const f=await store.finish(e.id,"DONE",{ok:true}); assert.equal(f.status,"DONE"); assert.equal((await store.list()).length,1);});
test("deployment adapter delegates",async()=>{const d=new DeploymentAdapter({deployFn:async x=>({deployed:x})}); assert.deepEqual(await d.deploy("v1"),{deployed:"v1"});});
