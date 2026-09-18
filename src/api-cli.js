#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {ModelGateway} from "./core/model-gateway.js";
import {OpenAICompatibleProvider} from "./core/openai-compatible-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

try {
  const config=runtimeConfig();
  if(!config.model.apiKey) throw new Error("OPENAI_API_KEY is required for API runtime");
  const provider=new OpenAICompatibleProvider(config.model);
  const modelGateway=new ModelGateway({
    providers:new Map([["default",provider]]),
    defaultModel:"default"
  });
  const composed=await createProductionJoraRuntime({config,modelGateway});
  if(!composed.api) throw new Error("JORA_API_ENABLED=true is required");
  const address=await composed.api.start();

  const stop=async()=>{
    try { composed.runtime.stop(); } catch {}
    try { await composed.api.stop(); } catch {}
  };
  process.once("SIGINT",()=>void stop());
  process.once("SIGTERM",()=>void stop());

  console.log(JSON.stringify({
    accepted:true,
    status:"LISTENING",
    address,
    health:"http://"+address.host+":"+address.port+"/health"
  },null,2));
} catch(error) {
  console.error(JSON.stringify({
    accepted:false,
    status:"FAILED",
    error:error.message
  },null,2));
  process.exitCode=1;
}
