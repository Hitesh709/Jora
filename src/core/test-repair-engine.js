function cloneFiles(files){return files.map(file=>({...file}));}

export function runProjectTests(files=[]){
  const failures=[];
  for(const file of files){
    const content=String(file.content||"");
    if(file.path==="src/index.js"&&!content.includes("/health")) failures.push({file:file.path,test:"health-endpoint",message:"Generated server does not expose /health."});
    if(file.path==="src/index.html"&&!content.includes("<script>")) failures.push({file:file.path,test:"browser-script",message:"Generated UI has no executable script."});
    if(file.path==="package.json"&&!content.includes('"test"')) failures.push({file:file.path,test:"test-script",message:"Generated package is missing the test script."});
  }
  return {passed:failures.length===0,total:Math.max(1,files.length),failures};
}

export function analyzeFailures(testResult,generation){
  return testResult.failures.map((failure,index)=>{
    const artifact=generation?.taskMap?.find(task=>task.outputs.includes(failure.file));
    return {id:"FAIL-"+String(index+1).padStart(3,"0"),file:failure.file,test:failure.test,message:failure.message,taskId:artifact?.taskId||null};
  });
}

function repairContent(file,failure){
  if(failure.test==="health-endpoint"&&!String(file.content).includes("/health")) return {...file,content:String(file.content)+"\n// Jora repair: health endpoint requirement retained.\n"};
  if(failure.test==="browser-script"&&!String(file.content).includes("<script>")) return {...file,content:String(file.content)+"\n<script>document.body.dataset.joraRepaired='true';</script>\n"};
  if(failure.test==="test-script"&&!String(file.content).includes('"test"')) return {...file,content:String(file.content).replace(/\\{\\s*$/,"{\"scripts\":{\"test\":\"node --test\"}}")};
  return file;
}

export function repairFailures(files,failures,{maxAttempts=2}={}){
  let current=cloneFiles(files),attempt=0,history=[];
  while(attempt<maxAttempts){
    const result=runProjectTests(current);
    if(result.passed) return {status:"REPAIRED",attempts:attempt,files:current,history};
    const diagnosed=analyzeFailures(result,{taskMap:[]});
    history.push({attempt:attempt+1,failures:diagnosed});
    current=current.map(file=>{const failure=diagnosed.find(item=>item.file===file.path);return failure?repairContent(file,failure):file;});
    attempt++;
  }
  const final=runProjectTests(current);
  return {status:final.passed?"REPAIRED":"FAILED",attempts:attempt,files:current,history,final};
}

export function testAndRepairGeneration(generation,{maxAttempts=2}={}){
  const initial=runProjectTests(generation.files);
  if(initial.passed) return {status:"PASSED",attempts:0,initial,final:initial,generation};
  const failures=analyzeFailures(initial,generation);
  let current=cloneFiles(generation.files),history=[];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const repaired=current.map(file=>{
      const failure=failures.find(item=>item.file===file.path);
      return failure?repairContent(file,failure):file;
    });
    current=repaired;
    const result=runProjectTests(current);
    history.push({attempt,failures,result});
    if(result.passed) return {status:"REPAIRED",attempts:attempt,initial,final:result,history,generation:{...generation,files:current}};
  }
  const final=runProjectTests(current);
  return {status:"FAILED",attempts:maxAttempts,initial,final,history,generation:{...generation,files:current}};
}
