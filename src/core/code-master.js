export class CodeMaster {
  constructor({repository,index=null,architecture=null,planner=null,impact=null}={}) {
    if(!repository) throw new Error("Repository adapter is required");
    this.repository=repository; this.index=index; this.architecture=architecture; this.planner=planner; this.impact=impact;
  }
  async inspect(path=""){return this.repository.list(path);}
  async read(path){return this.repository.read(path);}
  async write(path,content,expectedSha=null){return this.repository.write(path,content,expectedSha);}
  async search(query){return this.repository.search(query);}
  async snapshot(){if(this.repository.snapshot)return this.repository.snapshot();const files=[];for(const p of await this.repository.list(""))files.push({path:p,content:await this.repository.read(p)});return files;}
  async analyzeArchitecture(){if(!this.index||!this.architecture)throw new Error("architecture analyzers are required");const index=await this.index.build();return {index,architecture:this.architecture.analyze(index)};}
  async planRefactor({goal="improve architecture",issues=[]}={}){const {index,architecture}=await this.analyzeArchitecture();return {index,architecture,plan:this.planner?.plan({index,issues,goal})??null};}
  async assessImpact({before,after,index}={}){if(!this.impact)throw new Error("impact analyzer is required");return this.impact.analyze({before,after,index});}
}