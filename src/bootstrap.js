#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway,AnthropicProvider} from "./core/multi-model-gateway.js";
import {OpenAICompatibleProvider} from "./core/openai-compatible-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const objective=process.argv.slice(2).join(" ").trim()||"Evolve Jora into a production-grade autonomous AI software engineering platform.";

try {
  const config=runtimeConfig();
  if(!config.model.apiKey) throw new Error("OPENAI_API_KEY is required for autonomous self-build");
  const providers=new Map();
  if(config.model.apiKey) providers.set("openai",new OpenAICompatibleProvider(config.model));
  if(config.models.anthropicApiKey) providers.set("claude",new AnthropicProvider(config.models));
  const modelGateway=new MultiModelGateway({providers,defaultModel:config.model.defaultModel||"openai",fallbackModels:config.model.fallbackModels});
  const composed=await createProductionJoraRuntime({config,modelGateway});
  const result=await composed.runtime.improve({
    command:objective,
    context:{
      workspace:config.workspace,
      champion:composed.championStore.get(),
      championStore:composed.championStore
    }
  });
  console.log(JSON.stringify({objective,status:result.status,cycles:result.cycles,jobId:result.jobId},null,2));
} catch(error) {
  console.error(JSON.stringify({status:"FAILED",error:error.message},null,2));
  process.exitCode=1;
}
