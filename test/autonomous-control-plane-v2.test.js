import test from "node:test";
import assert from "node:assert/strict";
import {ExecutionLedger,IdempotencyGuard,PolicyEngine,PreflightGate,ArtifactManifest,DeploymentHealthVerifier,FactoryCheckpointStore,AutonomousControlLoop} from "../src/core/autonomous-control-plane-v2.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("v2.11 execution ledger records and retrieves idempotency keys",async()=>{
  const ledger=new ExecutionLedger();
  const row=await ledger.append({operation:"build",idempotencyKey:"k1",result:{ok:true}});
  assert.equal(row.operation,"build");
  assert.equal((await ledger.findByIdempotencyKey("k1")).id,row.id);
});

test("v2.12 idempotency guard replays stored result",async()=>{
  const ledger=new ExecutionLedger();
  const guard=new IdempotencyGuard({ledger});
  await ledger.append({operation:"deploy",idempotencyKey:"k2",result:{version:1}});
  const result=await guard.check("k2");
  assert.equal(result.replay,true);
  assert.deepEqual(result.result,{version:1});
});

test("v2.14 policy and v2.15 preflight gate protect production",()=>{
  const policy=new PolicyEngine();
  assert.equal(policy.evaluate({operation:"deploy",provider:"production",risk:"high"}).allowed,false);
  const gate=new PreflightGate({policyEngine:policy});
  assert.equal(gate.evaluate({operation:"deploy",provider:"production",risk:"high",evidence:["ci"]}).ready,false);
  assert.equal(gate.evaluate({operation:"docs",risk:"low"}).ready,true);
});

test("v2.13 artifact manifest produces sha256 entries",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"jora-artifact-"));
  await fs.writeFile(path.join(dir,"a.txt"),"hello");
  const manifest=await new ArtifactManifest().build({root:dir,files:["a.txt"]});
  assert.equal(manifest.files.length,1);
  assert.equal(manifest.files[0].sha256.length,64);
  await fs.rm(dir,{recursive:true,force:true});
});

test("v2.16 deployment health verifier accepts healthy endpoint",async()=>{
  const verifier=new DeploymentHealthVerifier({fetchImpl:async()=>({ok:true,status:200})});
  const result=await verifier.verify({url:"http://test",attempts:1});
  assert.equal(result.status,"HEALTHY");
});

test("v2.19 checkpoints persist and v2.20 control loop records readiness",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"jora-checkpoint-"));
  const store=new FactoryCheckpointStore({file:path.join(dir,"cp.json")});
  const ledger=new ExecutionLedger();
  const loop=new AutonomousControlLoop({ledger,checkpoints:store});
  const result=await loop.evaluate({operation:"test",risk:"low",phase:"verification"});
  assert.equal(result.version,"2.20.0");
  assert.equal(result.ready,true);
  assert.ok(await store.latest("test"));
  await fs.rm(dir,{recursive:true,force:true});
});
