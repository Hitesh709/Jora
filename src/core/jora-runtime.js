export class JoraRuntime {
  constructor({builder,controller,continuousWorker=null,executionStore=null,repository=null,deploymentController=null,metrics=null,governance=null}={}) {
    if (!builder || !controller) throw new Error("builder and controller are required");
    this.builder=builder;
    this.controller=controller;
    this.continuousWorker=continuousWorker;
    this.executionStore=executionStore;
    this.repository=repository;
    this.deploymentController=deploymentController;
    this.metrics=metrics;
    this.governance=governance;
  }

  async execute({command,constraints={},context={}}={}) {
    if (!command) throw new Error("command is required");
    const execution=this.executionStore ? await this.executionStore.create({
      taskId:context.taskId??"command",
      agentId:context.agentId??"jora-master",
      input:{command,constraints,tenantId:context.tenantId??"default"}
    }) : null;
    const startedAt=Date.now();
    const executionId=execution?.id??`command-${Date.now()}`;
    const governance={transition:async(to,metadata={})=>this.governance?.transition({executionId,to,actorId:context.actorId??"system",tenantId:context.tenantId??"default",metadata})};
    await governance.transition("AUTHORIZED",{command});
    await governance.transition("PLANNED");
    await governance.transition("GENERATING");
    try {
      if(execution) await this.executionStore.append(execution.id,{type:"COMMAND_ACCEPTED",command});

      let candidateContext={...context,executionId:execution?.id};
      await governance.transition("ISOLATED");
      if(this.repository?.prepareCandidate) {
        const candidate=await this.repository.prepareCandidate(
          execution?.id??`command-${Date.now()}`,
          this.repository.baseBranch??"main"
        );
        candidateContext={...candidateContext,candidate};
        if(execution) await this.executionStore.append(execution.id,{
          type:"CANDIDATE_CREATED",
          branch:candidate.branch,
          base:candidate.base
        });
      }

      await governance.transition("BUILDING");
      const built=await this.builder.build({command,constraints,context:candidateContext});
      await governance.transition("TESTING");
      if(execution) await this.executionStore.append(execution.id,{type:"BUILD_COMPLETE",status:built?.status});

      await governance.transition("SECURITY_CHECK");
      await governance.transition("BENCHMARKING");
      await governance.transition("CANDIDATE");
      let result=await this.controller.run({
        command,
        context:{...candidateContext,built}
      });

      await governance.transition("PROMOTION_CHECK",{status:result.status});
      if(result.status==="PROMOTED") await governance.transition("PROMOTED");
      else await governance.transition("REJECTED",{status:result.status});
      if(result.status==="PROMOTED" && this.deploymentController) {
        const deployment=await this.deploymentController.deploy({
          candidate:result.champion??result.candidate,
          version:result.champion?.version??result.version,
          context:{...candidateContext,executionId:execution?.id,result}
        });
        result={...result,deployment};
        if(execution) await this.executionStore.append(execution.id,{
          type:"DEPLOYMENT",
          status:deployment.status,
          deployment
        });
      }

      if(result.status==="PROMOTED" && this.deploymentController) await governance.transition("PRODUCTION");
      if(result.status==="PROMOTED") await governance.transition("MONITORING");
      if(execution) await this.executionStore.finish(
        execution.id,
        result.status==="PROMOTED" && (!result.deployment || result.deployment.status==="DEPLOYED")
          ?"PROMOTED"
          :"COMPLETED",
        result
      );
      await this.metrics?.recordExecution({status:result.status,durationMs:Date.now()-startedAt});
      return result;
    } catch(error) {
      await this.metrics?.recordExecution({status:"FAILED",durationMs:Date.now()-startedAt});
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
