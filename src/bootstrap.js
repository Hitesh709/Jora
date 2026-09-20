#!/usr/bin/env node

import {runtimeConfig} from "./core/runtime-config.js";
import {MultiModelGateway} from "./core/multi-model-gateway.js";
import {JoraNativeProvider} from "./core/jora-native-provider.js";
import {createProductionJoraRuntime} from "./core/production-runtime.js";

const objective=process.argv.slice(2).join(" ").trim()||"Evolve Jora into a production-grade autonomous AI software engineering platform.";

try {
  const config=runtimeConfig();
  const modelGateway=new MultiModelGateway({
    providers:new Map([["jora",new JoraNativeProvider()]]),
    defaultModel:"jora",
    fallbackModels:[]
  });
  const composed=await createProductionJoraRuntime({config,modelGateway});
  const result=await composed.runtime.improve({
    command:objective,
    context:{
      workspace:config.workspace,
      champion:composed.championStore.get(),
      championStore:composed.championStore,
      provider:"jora"
    }
  });
  console.log(JSON.stringify({objective,status:result.status,cycles:result.cycles,jobId:result.jobId},null,2));
} catch(error) {
  console.error(JSON.stringify({status:"FAILED",error:error.message},null,2));
  process.exitCode=1;
}
