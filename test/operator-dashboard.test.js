import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
test("operator dashboard exists and references control-plane endpoints",()=>{
 const file=path.join(process.cwd(),"src/operator/dashboard.html");
 const html=fs.readFileSync(file,"utf8");
 for(const endpoint of ["/v1/status","/v1/metrics","/v1/executions","/v1/jobs","/v1/observability"]) assert.ok(html.includes(endpoint));
});
