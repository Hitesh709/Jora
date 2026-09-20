import {runtimeConfig} from "./runtime-config.js";
import {MultiModelGateway} from "./multi-model-gateway.js";
import {JoraNativeProvider} from "./jora-native-provider.js";
import {createProductionJoraRuntime} from "./production-runtime.js";

async function main(){
  const input=process.env.JORA_ASYNC_WORKER_INPUT;
  if(!input) throw new Error("JORA_ASYNC_WORKER_INPUT is required");
  const request=JSON.parse(input);
  const config=runtimeConfig();
  const providers=new Map();
  providers.set("jora",new JoraNativeProvider());
  const modelGateway=new MultiModelGateway({
    providers,
    defaultModel:"jora",
    fallbackModels:[]
  });
  const composed=await createProductionJoraRuntime({config,modelGateway});
  try {
    const result=await composed.runtime.execute({
      command:request.command,
      constraints:request.constraints??{},
      context:request.context??{}
    });
    if(process.send) process.send({ok:true,result});
  } finally {
    try { composed.runtime.stop(); } catch {}
  }
}

main().catch(error=>{
  if(process.send) process.send({ok:false,error:error?.message||String(error)});
  process.exitCode=1;
});
