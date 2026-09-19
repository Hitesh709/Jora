#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway,AnthropicProvider} from "./core/multi-model-gateway.js";
import {OpenAICompatibleProvider} from "./core/openai-compatible-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

try {
  const config=runtimeConfig();
  const providers=new Map();
  if(config.model.apiKey) providers.set("openai",new OpenAICompatibleProvider(config.model));
  if(config.models.anthropicApiKey) providers.set("claude",new AnthropicProvider(config.models));
  if(!providers.size) providers.set("default",{complete:async()=>{throw new Error("No model provider configured");}});
  const modelGateway=new MultiModelGateway({providers,defaultModel:config.model.defaultModel||"openai",fallbackModels:config.model.fallbackModels});
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
