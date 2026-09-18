import test from "node:test";
import assert from "node:assert/strict";
import { AgentRuntime, ModelGateway, ToolRegistry, Sandbox, AgentRegistry } from "../src/index.js";

test("tool registry enforces permissions", async () => {
  const tools = new ToolRegistry();
  tools.register({name:"echo", inputSchema:{type:"object"}, permissions:["basic"], handler:({value})=>value});
  assert.deepEqual(await tools.execute("echo",{value:"ok"},["basic"]),"ok");
  await assert.rejects(() => tools.execute("echo",{value:"no"},[]), /Permission denied/);
});

test("model gateway routes to registered provider", async () => {
  const gateway = new ModelGateway({defaultModel:"mock"});
  gateway.register("mock",{complete:async()=>({content:"hello"})});
  const result = await gateway.complete({messages:[]});
  assert.equal(result.content,"hello");
  assert.equal(result.model,"mock");
});

test("agent runtime can execute a tool then finish", async () => {
  const tools = new ToolRegistry();
  tools.register({name:"echo", permissions:["basic"], handler:({value})=>({value})});
  let call = 0;
  const gateway = new ModelGateway({defaultModel:"mock"});
  gateway.register("mock",{complete:async ({messages}) => {
    call++;
    if (call === 1) return {toolCall:{name:"echo",arguments:{value:"done"}}};
    return {content:messages[0].content};
  }});
  const runtime = new AgentRuntime({toolRegistry:tools,modelGateway:gateway});
  const result = await runtime.run({id:"coder",permissions:["basic"]},"build");
  assert.equal(result.status,"COMPLETED");
  assert.equal(call,2);
});

test("sandbox enforces execution timeout", async () => {
  const sandbox = new Sandbox({executor:async()=>new Promise(r=>setTimeout(()=>r("late"),100)),limits:{timeoutMs:10}});
  await assert.rejects(() => sandbox.run("slow"), /Sandbox timeout/);
});

test("agent registry versions agents", () => {
  const registry = new AgentRegistry();
  registry.register({id:"coder",version:1,capabilities:["coding"]});
  assert.equal(registry.get("coder").version,1);
});
