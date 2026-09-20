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
  providers.set("kilo-free",new OpenAICompatibleProvider({
    baseUrl:process.env.JORA_KILO_FREE_BASE_URL||"https://api.kilo.ai/api/gateway",
    model:"kilo-auto/free",
    apiKey:process.env.KILO_API_KEY,
    allowAnonymous:true
  }));
  const openCodeFreeBaseUrl=process.env.JORA_OPENCODE_FREE_BASE_URL||"https://opencode.ai/zen/v1";
  const openCodeFreeModels=[
    ["mimo-v2.5-free","MiMo-V2.5 Free"],
    ["laguna-s-2.1-free","Laguna S 2.1 Free"],
    ["ling-3.0-tiny-free","Ling 3.0-tiny Free"],
    ["longcat-2.0-free","LongCat-2.0 Free"],
    ["north-mini-code-free","North Mini Code Free"],
    ["nemotron-3-ultra-free","Nemotron 3 Ultra Free"],
    ["deepseek-v4-flash-free","DeepSeek V4 Flash Free"]
  ];
  for(const [model] of openCodeFreeModels){
    providers.set("opencode-"+model,new OpenAICompatibleProvider({
      baseUrl:openCodeFreeBaseUrl,
      model,
      apiKey:process.env.OPENCODE_API_KEY,
      allowAnonymous:true
    }));
  }
  if(!config.model.apiKey && !config.models.anthropicApiKey) providers.set("default",{complete:async()=>{throw new Error("No model provider configured");}});
  // Jora must have a usable default even when no paid OpenAI/Anthropic key is configured.
  // Prefer the configured model when it is actually registered; otherwise use Kilo Auto Free.
  const configuredDefault=config.model.defaultModel||"";
  const defaultModel=providers.has(configuredDefault)
    ? configuredDefault
    : (providers.has("kilo-free") ? "kilo-free" : ([...providers.keys()].find(x=>x!=="default")||"default"));
  const fallbackModels=[
    ...config.model.fallbackModels,
    "kilo-free",
    ...openCodeFreeModels.map(([model])=>"opencode-"+model)
  ].filter((x,i,a)=>x && a.indexOf(x)===i && providers.has(x));
  const modelGateway=new MultiModelGateway({providers,defaultModel,fallbackModels});
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
