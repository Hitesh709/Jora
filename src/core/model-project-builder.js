function extractJsonObject(raw) {
  const source=String(raw??"").trim();
  if(!source) throw new Error("empty model response");

  // Models sometimes wrap JSON in markdown fences or add a second JSON
  // document after the requested object. Parse the first complete object
  // instead of using lastIndexOf("}"), which can accidentally include the
  // trailing document and produce "Unexpected non-whitespace character".
  for(let start=0; start<source.length; start++){
    if(source[start]!=="{") continue;

    let depth=0;
    let inString=false;
    let escaped=false;

    for(let i=start; i<source.length; i++){
      const ch=source[i];

      if(inString){
        if(escaped) {
          escaped=false;
        } else if(ch==="\\") {
          escaped=true;
        } else if(ch==='"') {
          inString=false;
        }
        continue;
      }

      if(ch==='"'){
        inString=true;
        continue;
      }

      if(ch==="{") depth++;
      else if(ch==="}") {
        depth--;
        if(depth===0){
          const candidate=source.slice(start,i+1);
          try {
            const value=JSON.parse(candidate);
            if(value && typeof value==="object" && !Array.isArray(value)) return value;
          } catch {
            // Try the next possible opening brace.
          }
          break;
        }
      }
    }
  }

  throw new Error("no complete JSON object found");
}

function parseProjectResponse(raw) {
  const source=String(raw??"").trim();

  try {
    return JSON.parse(source);
  } catch(firstError) {
    try {
      return extractJsonObject(source);
    } catch {
      throw new Error("Model did not return valid project JSON: "+firstError.message);
    }
  }
}

export class ModelProjectBuilder {
  constructor({modelGateway,repository}={}) {
    if(!modelGateway||!repository) throw new Error("modelGateway and repository are required");
    this.modelGateway=modelGateway; this.repository=repository;
  }

  async build({command,specification,context={},repository=this.repository}={}) {
    const repair=context.repairFeedback
      ? " This is a repair cycle. Diagnose the supplied failure evidence, preserve working behavior, and return corrected complete files. Failure evidence: "+JSON.stringify({
          diagnosis:context.repairFeedback.diagnosis,
          hypothesis:context.repairFeedback.hypothesis,
          history:context.repairHistory
        })
      : "";
    const prompt="Design and implement a production-ready AI agent project for this command. Return ONLY JSON with a files array. Each item must contain path and content. Command: "+command+" Specification: "+JSON.stringify(specification)+repair;
    const response=await this.modelGateway.complete({
      messages:[
        {role:"system",content:"You are Jora's software factory. Generate complete, runnable project files. Do not include markdown fences. When repairing, fix the diagnosed failures rather than merely describing them."},
        {role:"user",content:prompt}
      ],
      model:context.model
    });

    const parsed=parseProjectResponse(response.text);

    if(!Array.isArray(parsed.files)||parsed.files.length===0) throw new Error("Model returned no project files");
    const written=[];
    const progress=typeof context.progress==="function" ? context.progress : ()=>{};
    progress({phase:"CODING",status:"RUNNING",message:`Generating ${parsed.files.length} project files`});
    for(const file of parsed.files){
      if(!file?.path||typeof file.content!=="string") throw new Error("Invalid generated file");
      written.push(await repository.write(file.path,file.content));
      progress({phase:"CODING",status:"FILE_WRITTEN",message:`Wrote ${file.path}`,file:{path:file.path,bytes:Buffer.byteLength(file.content,"utf8")}});
    }
    return {status:"SUCCEEDED",files:written,model:response.model,cycle:context.cycle??1,repairCycle:Boolean(context.repairFeedback),repository};
  }
}
