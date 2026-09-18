export class ProductionPipeline {
  constructor({orchestrator, runtime, store}={}) {
    if(!orchestrator||!runtime||!store) throw new Error("orchestrator, runtime and store are required");
    this.orchestrator=orchestrator; this.runtime=runtime; this.store=store;
  }
  async execute({taskId,agent,input,maxSteps=10}) {
    const execution=this.store.create({taskId,agentId:agent.id,input});
    try {
      const plan=this.orchestrator.plan(input);
      this.store.append(execution.id,{type:"PLAN_CREATED",plan});
      const result=await this.runtime.run(agent,input,{maxSteps});
      this.store.append(execution.id,{type:"RUNTIME_COMPLETED",status:result.status});
      return this.store.finish(execution.id,result.status==="COMPLETED"?"SUCCEEDED":"FAILED",result);
    } catch(error) {
      this.store.append(execution.id,{type:"ERROR",message:error.message});
      return this.store.finish(execution.id,"FAILED",{error:error.message});
    }
  }
}