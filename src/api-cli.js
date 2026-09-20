#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway} from "./core/multi-model-gateway.js";
import {JoraNativeProvider} from "./core/jora-native-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

try {
  const config=runtimeConfig();
  const providers=new Map();
  if(config.model.apiKey) providers.set("openai",new OpenAICompatibleProvider(config.model));
  if(config.models.anthropicApiKey) providers.set("claude",new AnthropicProvider(config.models));
  // Jora is the only user-facing AI. It may use a server-side model credential as its internal reasoning engine.
  if(config.model.apiKey) {
    providers.set("jora",new OpenAICompatibleProvider(config.model));
  } else if(config.models.anthropicApiKey) {
    providers.set("jora",new AnthropicProvider(config.models));
  } else {
    providers.set("jora",{complete:async()=>{
      throw new Error("Jora AI engine is not configured. Set OPENAI_API_KEY (or ANTHROPIC_API_KEY) on the Railway backend.");
    }});
  }
  const defaultModel="jora";
  const modelGateway=new MultiModelGateway({providers,defaultModel,fallbackModels:[]});
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
