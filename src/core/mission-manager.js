export class MissionManager {
  constructor({roadmap,taskGenerator=null,store=null,maxTasksPerCycle=1}={}){if(!roadmap)throw new Error("roadmap is required");this.roadmap=roadmap;this.taskGenerator=taskGenerator;this.store=store;this.maxTasksPerCycle=maxTasksPerCycle;this.running=false;}
  async initialize(){await this.roadmap.load();return this.status();}
  async status(){await this.roadmap.load();return {running:this.running,progress:this.roadmap.progress(),next:this.roadmap.next({limit:this.maxTasksPerCycle})};}
  async nextWork({objective,context={},limit=this.maxTasksPerCycle}={}){const planned=this.roadmap.next({limit});if(planned.length)return planned;if(!this.taskGenerator||!objective)return [];const generated=await this.taskGenerator.generate({objective,snapshot:{roadmap:this.roadmap.progress(),context},limit});return generated.map((task,i)=>({id:task.id??`DYNAMIC-${Date.now()}-${i}`,title:task.title,description:task.description,priority:task.priority??0,dependencies:task.dependencies??[]}));}
  async complete(task,evidence={}){await this.roadmap.record(task.id,"DONE",evidence);return this.status();}
  async fail(task,evidence={}){await this.roadmap.record(task.id,"FAILED",evidence);return this.status();}
  stop(){this.running=false;}
  start(){this.running=true;}
}
