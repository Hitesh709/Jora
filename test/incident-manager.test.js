import test from "node:test";
import assert from "node:assert/strict";
import {IncidentManager} from "../src/core/incident-manager.js";
test("incident manager deduplicates active incidents",async()=>{
 const m=new IncidentManager(); const a={alertType:"HIGH_FAILURE_RATE",severity:"WARNING",message:"fail"};
 const x=await m.open(a); const y=await m.open(a); assert.equal(x.id,y.id); assert.equal(y.occurrences,2);
});
test("incident manager resolves incidents",async()=>{const m=new IncidentManager();const i=await m.open({alertType:"QUEUE_BACKLOG",message:"backlog"});const r=await m.resolve(i.id,{status:"fixed"});assert.equal(r.status,"RESOLVED");});
