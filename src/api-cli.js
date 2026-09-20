#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway} from "./core/multi-model-gateway.js";
import {JoraNativeProvider} from "./core/jora-native-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

try {
  const config=runtimeConfig();
  const providers=new Map();

  // Jora is the only user-facing AI interface. The native engine is always
  // registered so the production runtime does not depend on external model keys.
  providers.set("jora",new JoraNativeProvider());

  const defaultModel="jora";
  const modelGateway=new MultiModelGateway({
    providers,
    defaultModel,
    fallbackModels:[]
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
    health:"http://"+address.host+":"+address.port+"/health",
    aiEngine:"jora-native",
    provider:"jora",
    externalAiKeysRequired:false
  },null,2));
} catch(error) {
  console.error(JSON.stringify({
    accepted:false,
    status:"FAILED",
    error:error.message
  },null,2));
  process.exitCode=1;
}
