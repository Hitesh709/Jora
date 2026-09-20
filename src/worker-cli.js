#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway} from "./core/multi-model-gateway.js";
import {JoraNativeProvider} from "./core/jora-native-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const command=process.argv.slice(2).join(" ").trim() || "Improve Jora continuously";

try {
  const config=runtimeConfig();
  const modelGateway=new MultiModelGateway({
    providers:new Map([["jora",new JoraNativeProvider()]]),
    defaultModel:"jora",
    fallbackModels:[]
  });
  const composed=await createProductionJoraRuntime({config,modelGateway});
  const stop=()=>{ composed.runtime.stop(); };
  process.once("SIGINT",stop);
  process.once("SIGTERM",stop);
  const result=await composed.runtime.improve({
    command,
    context:{workspace:config.workspace,champion:composed.championStore.get(),championStore:composed.championStore,provider:"jora"}
  });
  console.log(JSON.stringify({accepted:true,command,status:result.status,cycles:result.cycles,jobId:result.jobId,workerStateFile:config.worker.stateFile},null,2));
  if(result.status==="COMPLETED" && config.worker.maxCycles!==Infinity) process.exitCode=0;
} catch(error) {
  console.error(JSON.stringify({accepted:false,status:"FAILED",error:error.message},null,2));
  process.exitCode=1;
}
