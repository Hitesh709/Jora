import test from "node:test";
import assert from "node:assert/strict";
import {DeliveryPolicyEngine,PromotionGate,CanaryController,RolloutController,PostDeploymentVerifier,ReleaseRecoveryManager,AutonomousReleaseControlPlane} from "../src/core/autonomous-release-control-plane-v2.js";

test("v2.53 delivery policy blocks unverified release",()=>{const p=new DeliveryPolicyEngine();assert.equal(p.evaluate({risk:"high",testsPassed:true,reviewApproved:false,healthPassed:false}).allowed,false);});
test("v2.54 promotion gate allows fully verified release",()=>{const r=new PromotionGate().evaluate({risk:"medium",testsPassed:true,reviewApproved:true,healthPassed:true});assert.equal(r.allowed,true);});
test("v2.55 canary controller stops over budget",()=>{assert.equal(new CanaryController().evaluate({baseline:.01,canary:.03,errorBudget:.02}).healthy,false);});
test("v2.56 rollout controller advances stages",()=>{const r=new RolloutController().next({currentIndex:0,stages:["10%","50%","100%"]});assert.equal(r.stage,"50%");});
test("v2.57 post deployment verifier validates all gates",()=>{assert.equal(new PostDeploymentVerifier().verify({testsPassed:true,healthPassed:true,canaryHealthy:true}).passed,true);});
test("v2.58 recovery manager records rollback",()=>{const r=new ReleaseRecoveryManager().recover({releaseId:"r1",reason:"health",rollbackTarget:"stable"});assert.equal(r.status,"ROLLBACK_REQUESTED");});
test("v2.60 release control plane exposes autonomous release",()=>{assert.equal(new AutonomousReleaseControlPlane().status().capabilities.autonomousRelease,true);});
