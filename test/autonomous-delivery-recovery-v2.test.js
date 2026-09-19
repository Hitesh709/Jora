import test from "node:test";
import assert from "node:assert/strict";
import {AutonomousDeliveryControlPlane,ProductionSLORecoveryLoop,MissionToProductionOrchestrator} from "../src/core/autonomous-delivery-control-plane-v2.js";

test("v2.47 SLO recovery loop records healthy evaluation",async()=>{const loop=new ProductionSLORecoveryLoop({healthVerifier:{verify:async()=>({status:"HEALTHY",healthy:true})}});const r=await loop.evaluate({target:"production"});assert.equal(r.healthy,true);assert.equal(loop.list().length,1);});
test("v2.49 orchestrator blocks without consensus",async()=>{const p=new AutonomousDeliveryControlPlane();const o=new MissionToProductionOrchestrator({review:p.review});const r=await o.execute({mission:"m",change:"x",reviewers:[{decision:"REJECT"}]});assert.equal(r.status,"BLOCKED_REVIEW");});
test("v2.50 delivery control plane exposes all engines",()=>{const p=new AutonomousDeliveryControlPlane();assert.equal(p.status().capabilities.missionToProduction,true);});
