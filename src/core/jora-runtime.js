export class JoraRuntime {
  constructor({builder,controller,continuousWorker=null,executionStore=null}={}) {
    if (!builder || !controller) throw new Error("builder and controller are required");
    this.builder=builder; this.controller=controller; this.continuousWorker=continuousWorker; this.executionStore=executionStore;
  }

  async execute({command,constraints={},context={}}={}) {
    if (!command) throw new Error("command is required");
    const execution=this.executionStore ? await this.executionStore.create({taskId:context.taskId??"command",agentId:context.agentId??"jora-master",input:{command,constraints}}) : null;
    try {
      if(execution) await this.executionStore.append(execution.id,{type:"COMMAND_ACCEPTED",command});
      const built=await this.builder.build({command,constraints,context:{...context,executionId:execution?.id}});
      if(execution) await this.executionStore.append(execution.id,{type:"BUILD_COMPLETE",status:built?.status});
      const result=await this.controller.run({command,context:{...context,built,executionId:execution?.id}});
      if(execution) await this.executionStore.finish(execution.id,result.status==="PROMOTED"?"PROMOTED":"COMPLETED",result);
      return result;
    } catch(error) {
      if(execution) await this.executionStore.finish(execution.id,"FAILED",{message:error.message});
      throw error;
    }
  }

  async improve({command,context={}}={}) {
    if (!this.continuousWorker) throw new Error("continuousWorker is not configured");
    return this.continuousWorker.run({command,context});
  }

  stop(){this.controller.stop(); this.continuousWorker?.stop();}
}
