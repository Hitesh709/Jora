function parseFailureOutput(result){
  const text=[result?.stdout,result?.stderr].filter(Boolean).join("\n");
  const files=[...text.matchAll(/(?:at |Error: |FAIL[^\n]*\s)([^\s:]+\.(?:js|mjs|json|html))/g)].map(m=>m[1]);
  return {summary:text.split("\n").filter(Boolean).slice(-12).join("\n"),files:[...new Set(files)]};
}

export function analyzeWorkspaceFailure(result,generation){
  const parsed=parseFailureOutput(result);
  const taskMatches=[];
  for(const file of parsed.files){
    const task=generation?.taskMap?.find(t=>t.outputs.some(output=>output===file||output.endsWith(file)));
    if(task) taskMatches.push({file,taskId:task.taskId,title:task.title});
  }
  return {type:"workspace-test-failure",summary:parsed.summary,files:parsed.files,tasks:taskMatches};
}

export function createRepairPatch(failure,{workspaceFiles=[]}={}){
  const patches=[];
  for(const file of failure.files||[]){
    const source=workspaceFiles.find(item=>item.path===file);
    if(source&&/\/broken-health\b/.test(String(source.content))) patches.push({path:file,operation:"replace",search:"/broken-health",replace:"/health",reason:"Restore health endpoint route."});
  }
  return {strategy:"targeted-patch",patches,diagnosis:failure};
}

export async function applyRepairPatch(root,patch){
  const fs=await import("node:fs/promises");
  const path=await import("node:path");
  const safe=String(patch.path).replace(/^[/\\]+/,"");
  if(!safe||safe.split(/[\\/]/).includes("..")) throw new Error("unsafe repair path");
  const target=path.join(root,safe);
  const content=await fs.readFile(target,"utf8");
  if(patch.operation==="replace"){
    if(!content.includes(patch.search)) return {applied:false,path:safe};
    await fs.writeFile(target,content.split(patch.search).join(patch.replace),"utf8");
    return {applied:true,path:safe};
  }
  throw new Error("unsupported repair operation");
}

export async function runFailureDrivenRepair(root,generation,{runTests,maxAttempts=2,readFiles}={}){
  if(typeof runTests!=="function") throw new Error("runTests is required");
  let last=await runTests(root),attempts=0,history=[];
  while(!last.passed&&attempts<maxAttempts){
    attempts++;
    const failure=analyzeWorkspaceFailure(last,generation);
    const workspaceFiles=[];
    for(const file of failure.files){try{workspaceFiles.push({path:file,content:await readFiles(root,file)});}catch{}}
    const plan=createRepairPatch(failure,{workspaceFiles});
    const applied=[];
    for(const patch of plan.patches) applied.push(await applyRepairPatch(root,patch));
    history.push({attempt:attempts,failure,plan,applied});
    if(!applied.some(x=>x.applied)) break;
    last=await runTests(root);
  }
  return {status:last.passed?"REPAIRED":"FAILED",attempts,result:last,history};
}
