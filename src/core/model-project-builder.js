export class ModelProjectBuilder {
  constructor({modelGateway,repository}){if(!modelGateway||!repository) throw new Error("modelGateway and repository are required"); this.modelGateway=modelGateway; this.repository=repository;}
  async build({command,specification,context={}}={}) {
    const prompt="Design and implement a production-ready AI agent project for this command. Return ONLY JSON with a files array. Each item must contain path and content. Command: "+command+" Specification: "+JSON.stringify(specification);
    const response=await this.modelGateway.complete({messages:[{role:"system",content:"You are Jora's software factory. Generate complete, runnable project files. Do not include markdown fences."},{role:"user",content:prompt}],model:context.model});
    let parsed; try{parsed=JSON.parse(response.text);}catch(e){throw new Error("Model did not return valid project JSON: "+e.message);}
    if(!Array.isArray(parsed.files)||parsed.files.length===0) throw new Error("Model returned no project files");
    const written=[];
    for(const file of parsed.files){
      if(!file?.path||typeof file.content!=="string") throw new Error("Invalid generated file");
      written.push(await this.repository.write(file.path,file.content,null));
    }
    return {status:"SUCCEEDED",files:written,model:response.model};
  }
}
