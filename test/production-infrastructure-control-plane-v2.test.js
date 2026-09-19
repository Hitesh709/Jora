import test from "node:test";
import assert from "node:assert/strict";
import {StartupConfigValidator,ReadinessProbe,LivenessProbe,GracefulShutdownCoordinator,RequestContextManager,DependencyHealthRegistry,DurableStateRecoveryScanner,RuntimeResourceGuard,RuntimeConfigSnapshot,ProductionInfrastructureControlPlane} from "../src/core/production-infrastructure-control-plane-v2.js";

test("v2.61 startup validator detects missing required config",()=>assert.equal(new StartupConfigValidator().validate({config:{},required:["api.host"]}).valid,false));
test("v2.62 readiness requires critical checks",async()=>assert.equal((await new ReadinessProbe({checks:{db:()=>true,queue:()=>false}}).check()).ready,false));
test("v2.63 liveness heartbeat is healthy",()=>assert.equal(new LivenessProbe().beat().alive,true));
test("v2.64 graceful shutdown executes hooks",async()=>{let stopped=false;const s=new GracefulShutdownCoordinator();s.register("worker",()=>{stopped=true;});await s.shutdown();assert.equal(stopped,true);});
test("v2.65 request context creates correlation id",()=>assert.ok(new RequestContextManager().create({tenantId:"t1"}).requestId));
test("v2.66 dependency registry reports critical failure",async()=>assert.equal((await new DependencyHealthRegistry().register("db",()=>false,{critical:true}).check()).healthy,false));
test("v2.67 recovery scanner loads durable stores",async()=>assert.equal((await new DurableStateRecoveryScanner({stores:[{name:"x",load:async()=>({})}]}).scan()).status,"RECOVERED"));
test("v2.68 resource guard enforces concurrency",()=>{const g=new RuntimeResourceGuard({maxConcurrent:1});assert.equal(g.acquire().allowed,true);assert.equal(g.acquire().allowed,false);});
test("v2.69 config snapshot exposes runtime summary",()=>assert.equal(new RuntimeConfigSnapshot({version:"2.70.0",config:{api:{enabled:true}}}).summary().apiEnabled,true));
test("v2.70 infrastructure control plane exposes production controls",()=>assert.equal(new ProductionInfrastructureControlPlane().status().capabilities.gracefulShutdown,true));
