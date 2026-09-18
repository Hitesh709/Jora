export class JoraRuntime {
  constructor({builder,controller,continuousWorker=null,executionStore=null,repository=null}={}) {
    if (!builder || !controller) throw new Error("builder and controller are required");
    this.builder=builder;
    this.controller=controller;
    this.continuousWorker=continuousWorker;
    this.executionStore=executionStore;
    this.repository=repository;
  }

  async execute({command,constraints={},context={}}={}) {
    if (!command) throw new Error("command is required");
    const execution=this.executionStore ? await this.executionStore.create({
      taskId:context.taskId??"command",
      agentId:context.agentId??"jora-master",
      input:{command,constraints}
    }) : null;
    try {
      if(execution) await this.executionStore.append(execution.id,{type:"COMMAND_ACCEPTED",command});

      let candidateContext={...context,executionId:execution?.id};
      if(this.repository?.prepareCandidate) {
        const candidate=await this.repository.prepareCandidate(
          execution?.id??`command-${Date.now()}`,
          "main"
        );
        candidateContext={...candidateContext,candidate};
        if(execution) await this.executionStore.append(execution.id,{
          type:"CANDIDATE_CREATED",
          branch:candidate.branch,
          base:candidate.base
        });
      }

      const built=await this.builder.build({command,constraints,context:candidateContext});
      if(execution) await this.executionStore.append(execution.id,{type:"BUILD_COMPLETE",status:built?.status});

      const result=await this.controller.run({
        command,
        context:{...candidateContext,built}
      });
      if(execution) await this.executionStore.finish(
        execution.id,
        result.status==="PROMOTED"?"PROMOTED":"COMPLETED",
        result
      );
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
