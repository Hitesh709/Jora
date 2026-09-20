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
    let parsed;
    const raw=String(response.text??"").trim();
    try {
      parsed=JSON.parse(raw);
    } catch(firstError) {
      const start=raw.indexOf("{");
      const end=raw.lastIndexOf("}");
      if(start>=0 && end>start) {
        try { parsed=JSON.parse(raw.slice(start,end+1)); }
        catch { throw new Error("Model did not return valid project JSON: "+firstError.message); }
      } else {
        throw new Error("Model did not return valid project JSON: "+firstError.message);
      }
    }
    if(!Array.isArray(parsed.files)||parsed.files.length===0) throw new Error("Model returned no project files");
    const written=[];
    for(const file of parsed.files){
      if(!file?.path||typeof file.content!=="string") throw new Error("Invalid generated file");
      written.push(await repository.write(file.path,file.content));
    }
    return {status:"SUCCEEDED",files:written,model:response.model,cycle:context.cycle??1,repairCycle:Boolean(context.repairFeedback),repository};
  }
}
