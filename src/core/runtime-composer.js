import {ModelGateway} from "./model-gateway.js";
import {ProviderRegistry} from "./provider-registry.js";
import {OpenAICompatibleProvider} from "./openai-compatible-provider.js";
import {JsonStore} from "./json-store.js";
import {PersistentExecutionStore} from "./persistent-execution-store.js";
import {BenchmarkStore} from "./benchmark-store.js";
import {ProductionAgentBuilder} from "./production-agent-builder.js";
import {JoraRuntime} from "./jora-runtime.js";
import {DurableWorker} from "./durable-worker.js";
import {runtimeConfig} from "./runtime-config.js";

export function createJoraRuntime({planner,factory,delivery,controller,modelProvider=null,config=runtimeConfig()}={}) {
  if(!planner||!factory||!delivery||!controller) throw new Error("planner, factory, delivery and controller are required");
  const providers=new ProviderRegistry();
  if(modelProvider) providers.register("default",modelProvider);
  else if(config.model.apiKey) providers.register("default",new OpenAICompatibleProvider(config.model));
  const modelGateway=new ModelGateway({providers:new Map([...providers.providers]),defaultModel:"default"});
  const benchmarkStore=new BenchmarkStore();
  const executionStore=new PersistentExecutionStore({store:new JsonStore({file:config.persistence})});
  const workerStore=new JsonStore({file:config.worker?.stateFile||"./.jora/worker.json"});
  const builder=new ProductionAgentBuilder({planner,factory,delivery});
  const worker=new DurableWorker({
    store:workerStore,
    intervalMs:config.worker?.intervalMs??60000,
    heartbeatMs:config.worker?.heartbeatMs??10000,
    staleAfterMs:config.worker?.staleAfterMs??120000,
    maxCycles:config.worker?.maxCycles??Infinity,
    cycle:async ({cycle,command,context})=>controller.run({
      command:command??"Improve Jora",
      context:{...context,cycle,modelGateway,benchmarkStore}
    })
  });
  return {
    runtime:new JoraRuntime({builder,controller,continuousWorker:worker,executionStore}),
    modelGateway,benchmarkStore,executionStore,providers,worker,config
  };
}
