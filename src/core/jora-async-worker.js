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
  // The builder writes files to the isolated workspace. Do not depend on the
  // shape of the controller/evaluation object to discover them; the workspace
  // itself is the source of truth for the files the user should receive.
  let paths=[];
  try {
    paths=await repository.list(".");
  } catch {
    paths=[...collectFilePaths(result)];
  }
  paths=paths
    .filter(filePath=>typeof filePath==="string"&&!filePath.startsWith(".git/")&&!filePath.endsWith(".jora-tmp"))
    .slice(0,30);

  const files=[];
  for(const filePath of paths) {
    try {
      const content=await repository.read(filePath);
      const text=typeof content==="string" ? content : String(content?.content??"");
      const limited=text.slice(0,6000);
      files.push({
        path:filePath,
        lines:limited.split("\n").length,
        truncated:text.length>6000,
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
  const progress=event=>{
    if(!process.send) return;
    // IPC messages must be structured-clone safe. Never forward functions,
    // repositories, runners, or other runtime objects from progress payloads.
    const source = event && typeof event==="object" ? event : {message:String(event??"Jora progress")};
    const safeEvent = {
      timestamp:new Date().toISOString(),
      phase:typeof source.phase==="string" ? source.phase : "RUNNING",
      status:typeof source.status==="string" ? source.status : "RUNNING",
      message:typeof source.message==="string" ? source.message : "",
    };
    if(source.file && typeof source.file==="object"){
      safeEvent.file={
        path:typeof source.file.path==="string" ? source.file.path : "",
        bytes:Number.isFinite(source.file.bytes) ? source.file.bytes : 0,
        truncated:Boolean(source.file.truncated),
              };
    }
    try {
      process.send({type:"progress",event:safeEvent});
    } catch(error) {
      // Progress is observability only; an IPC serialization problem must
      // never abort the actual engineering build.
    }
  };
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
      context:{...(request.context??{}),progress}
    });
    const compact=await compactResult(result,composed.repository);
    if(process.send) {
      await new Promise(resolve=>process.send({ok:true,result:compact},()=>resolve()));
    }
  } finally {
    try { composed.runtime.stop(); } catch {}
    // The production runtime owns timers/workers outside JoraRuntime as well.
    // This process is a single isolated execution, so never leave it alive after
    // the result has been delivered to the parent API.
    setImmediate(()=>process.exit(0));
  }
}

process.once("message",request=>{
  main(request).catch(async error=>{
    const message=error?.message||String(error);
    if(process.send) {
      try { await new Promise(resolve=>process.send({ok:false,error:message},()=>resolve())); } catch {}
    }
    process.exitCode=1;
    setImmediate(()=>process.exit(1));
  });
});
