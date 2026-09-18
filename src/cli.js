#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {ModelGateway} from "./core/model-gateway.js";
import {OpenAICompatibleProvider} from "./core/openai-compatible-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const command=process.argv.slice(2).join(" ").trim();

if(!command) {
  console.error('Usage: npm run jora:command -- "Build a production-ready AI coding agent."');
  process.exitCode=2;
} else {
  try {
    const config=runtimeConfig();
    if(!config.model.apiKey) throw new Error("OPENAI_API_KEY is required for production execution");
    const provider=new OpenAICompatibleProvider(config.model);
    const modelGateway=new ModelGateway({
      providers:new Map([["default",provider]]),
      defaultModel:"default"
    });
    const composed=await createProductionJoraRuntime({config,modelGateway});
    const result=await composed.runtime.execute({
      command,
      constraints:{},
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
      results:result.results,
      workspace:config.workspace
    },null,2));
    if(result.status!=="PROMOTED") process.exitCode=1;
  } catch(error) {
    console.error(JSON.stringify({
      accepted:false,
      status:"FAILED",
      error:error.message
    },null,2));
    process.exitCode=1;
  }
}
