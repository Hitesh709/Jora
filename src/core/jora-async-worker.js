import {runtimeConfig} from "./runtime-config.js";
import {MultiModelGateway} from "./multi-model-gateway.js";
import {JoraNativeProvider} from "./jora-native-provider.js";
import {createProductionJoraRuntime} from "./production-runtime.js";

function collectFilePaths(value,{paths=new Set(),depth=0,maxDepth=7}={}) {
  if(value==null || depth>maxDepth || paths.size>=8) return paths;
  if(Array.isArray(value)) {
    for(const item of value) collectFilePaths(item,{paths,depth:depth+1,maxDepth});
    return paths;
  }
  if(typeof value!=="object") return paths;
  if(typeof value.path==="string" && typeof value.hash==="string" && !value.path.startsWith(".git/")) {
    paths.add(value.path);
  }
  for(const [key,item] of Object.entries(value)) {
    if(key==="repository" || key==="git" || key==="runner") continue;
    collectFilePaths(item,{paths,depth:depth+1,maxDepth});
    if(paths.size>=8) break;
  }
  return paths;
}

function compactPlanning(planning) {
  if(!planning || typeof planning!=="object") return null;
  return {
    specification:planning.specification
      ? {
          version:planning.specification.version,
          objective:planning.specification.objective,
          requirements:planning.specification.requirements,
          acceptanceCriteria:planning.specification.acceptanceCriteria
        }
      : null,
    architecture:planning.architecture
      ? {
          id:planning.architecture.id,
          components:planning.architecture.components,
          dataFlow:planning.architecture.dataFlow,
          risks:planning.architecture.risks
        }
      : null,
    taskCount:Array.isArray(planning.dag?.nodes) ? planning.dag.nodes.length : 0,
    criticalPath:planning.dag?.criticalPath??[]
  };
}

async function compactResult(result,repository) {
  const paths=[...collectFilePaths(result)];
  const files=[];
  for(const filePath of paths) {
    try {
      const content=await repository.read(filePath);
      const limited=String(content).slice(0,6000);
      files.push({
        path:filePath,
        lines:limited.split("\n").length,
        truncated:content.length>6000,
        content:limited
      });
    } catch {}
  }
  const latest=Array.isArray(result?.results) ? result.results[result.results.length-1] : null;
  const candidate=result?.champion ?? latest?.promotion?.candidate ?? latest?.project?.project ?? latest?.project ?? null;
  const evaluation=candidate?.evaluation ?? latest?.project?.evaluation ?? {};
  return {
    status:result?.status??"COMPLETED",
    benchmarkScore:result?.benchmarkScore??evaluation.benchmarkScore??null,
    qualityScore:result?.qualityScore??evaluation.qualityScore??null,
    productionReady:candidate?.productionReady??evaluation.passed??null,
    cycles:Array.isArray(result?.results) ? result.results.length : (latest?.cycle??1),
    planning:compactPlanning(result?.planning),
    files
  };
}

async function main(request){
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
    const compact=await compactResult(result,composed.repository);
    if(process.send) process.send({ok:true,result:compact});
  } finally {
    try { composed.runtime.stop(); } catch {}
  }
}

process.once("message",request=>{
  main(request).catch(error=>{
    if(process.send) process.send({ok:false,error:error?.message||String(error)});
    process.exitCode=1;
  });
});
