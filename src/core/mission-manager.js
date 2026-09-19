export class MissionManager {
  constructor({roadmap,taskGenerator=null,store=null,maxTasksPerCycle=1,maxAttempts=3}={}) {
    if(!roadmap) throw new Error("roadmap is required");
    this.roadmap=roadmap;
    this.taskGenerator=taskGenerator;
    this.store=store;
    this.maxTasksPerCycle=maxTasksPerCycle;
    this.maxAttempts=maxAttempts;
    this.running=false;
  }

  async initialize(){await this.roadmap.load();return this.status();}

  async status(){
    await this.roadmap.load();
    return {running:this.running,progress:this.roadmap.progress(),next:this.roadmap.next({limit:this.maxTasksPerCycle})};
  }

  async nextWork({objective,context={},limit=this.maxTasksPerCycle}={}) {
    const planned=this.roadmap.next({limit});
    if(planned.length) return planned;
    if(!this.taskGenerator||!objective) return [];
    const generated=await this.taskGenerator.generate({objective,snapshot:{roadmap:this.roadmap.progress(),context},limit});
    const added=[];
    for(const [i,task] of generated.entries()) {
      const normalized={id:task.id??`DYNAMIC-${Date.now()}-${i}`,title:task.title,description:task.description,priority:task.priority??0,dependencies:task.dependencies??[]};
      added.push(this.roadmap.addTask(normalized));
    }
    await this.roadmap.save();
    return added;
  }

  async claim(taskOrId) {
    const id=typeof taskOrId==="string"?taskOrId:taskOrId?.id;
    return this.roadmap.claim(id);
  }

  async complete(task,evidence={}) {
    return this.roadmap.record(task.id,"DONE",evidence);
  }

  async fail(task,evidence={}) {
    const current=this.roadmap.get(task.id);
    const attempts=Number(current?.attempts??0);
    const terminal=attempts>=this.maxAttempts;
    return this.roadmap.record(task.id,terminal?"BLOCKED":"FAILED",{
      ...evidence,
      attempts,
      retryable:!terminal
    });
  }

  start(){this.running=true;}
  stop(){this.running=false;}
}
