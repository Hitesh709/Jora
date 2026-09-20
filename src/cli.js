#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway} from "./core/multi-model-gateway.js";
import {JoraNativeProvider} from "./core/jora-native-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const command=process.argv.slice(2).join(" ").trim();

if(!command) {
  console.error('Usage: npm run jora:command -- "Build a production-ready AI coding agent."');
  process.exitCode=2;
} else {
  try {
    const config=runtimeConfig();
    const modelGateway=new MultiModelGateway({
      providers:new Map([["jora",new JoraNativeProvider()]]),
      defaultModel:"jora",
      fallbackModels:[]
    });
    const composed=await createProductionJoraRuntime({config,modelGateway});
    const result=await composed.runtime.execute({
      command,
      constraints:{},
      context:{
        workspace:config.workspace,
        champion:composed.championStore.get(),
        championStore:composed.championStore,
        provider:"jora"
      }
    });
    console.log(JSON.stringify({accepted:true,command,status:result.status,results:result.results,workspace:config.workspace},null,2));
    if(result.status!=="PROMOTED") process.exitCode=1;
  } catch(error) {
    console.error(JSON.stringify({accepted:false,status:"FAILED",error:error.message},null,2));
    process.exitCode=1;
  }
}
