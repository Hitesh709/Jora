#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {ModelGateway} from "./core/model-gateway.js";
import {OpenAICompatibleProvider} from "./core/openai-compatible-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const command=process.argv.slice(2).join(" ").trim() || "Improve Jora continuously";

try {
  const config=runtimeConfig();
  if(!config.model.apiKey) throw new Error("OPENAI_API_KEY is required for worker execution");
  const provider=new OpenAICompatibleProvider(config.model);
  const modelGateway=new ModelGateway({
    providers:new Map([["default",provider]]),
    defaultModel:"default"
  });
  const composed=await createProductionJoraRuntime({config,modelGateway});

  const stop=()=>{
    composed.runtime.stop();
  };
  process.once("SIGINT",stop);
  process.once("SIGTERM",stop);

  const result=await composed.runtime.improve({
    command,
    context:{
      workspace:config.workspace,
      champion:composed.championStore.get(),
      championStore:composed.championStore
    }
  });

  console.log(JSON.stringify({
    accepted:true,
    command,
    status:result.status,
    cycles:result.cycles,
    jobId:result.jobId,
    workerStateFile:config.worker.stateFile
  },null,2));

  if(result.status==="COMPLETED" && config.worker.maxCycles!==Infinity) process.exitCode=0;
} catch(error) {
  console.error(JSON.stringify({
    accepted:false,
    status:"FAILED",
    error:error.message
  },null,2));
  process.exitCode=1;
}
