import test from "node:test";
import assert from "node:assert/strict";
import {CustomerProductionMonitor,CustomerIncidentDetector,CustomerLearningEngine,CustomerOptimizationEngine,CustomerAutonomousOperationsControlPlane} from "../src/core/customer-autonomous-operations-v3.90.js";

test("v3.81 production monitor records health events",async()=>{
 let rows=[]; const monitor=new CustomerProductionMonitor({store:{async read(){return rows;},async write(v){rows=v;}}});
 const event=await monitor.observe({tenantId:"t",projectId:"p",url:"https://app",health:{status:"HEALTHY",latencyMs:42}});
 assert.equal(event.status,"HEALTHY"); assert.equal(monitor.list({tenantId:"t"}).length,1);
});

test("v3.82 incident detector opens on failed health",()=>{
 const detector=new CustomerIncidentDetector();
 const result=detector.evaluate({tenantId:"t",projectId:"p",health:{status:"DOWN"}});
 assert.equal(result.incident,true); assert.equal(result.status,"INCIDENT_OPEN"); assert.equal(result.incident.reason,"PRODUCTION_HEALTH_FAILED"); assert.equal(detector.list({tenantId:"t"}).length,1);
});

test("v3.85 learning persists outcomes",async()=>{
 let rows=[]; const engine=new CustomerLearningEngine({store:{async read(){return rows;},async write(v){rows=v;}}});
 await engine.learn({tenantId:"t",projectId:"p",outcome:"FAIL_TEST"});
 assert.equal(engine.list({tenantId:"t"}).length,1); assert.equal(rows.length,1);
});

test("v3.86 optimization derives recommendations",async()=>{
 const learning=new CustomerLearningEngine(); await learning.learn({tenantId:"t",projectId:"p",outcome:"FAIL_TEST"});
 const result=new CustomerOptimizationEngine({learning}).recommend({tenantId:"t",projectId:"p"});
 assert.ok(result.recommendations.length>0);
});

test("v3.90 operations control plane exposes capabilities",()=>{
 const plane=new CustomerAutonomousOperationsControlPlane();
 assert.equal(plane.status().version,"3.90.0");
 assert.equal(plane.status().capabilities.autonomousOperations,true);
});
