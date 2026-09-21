export class JoraRuntime {
  constructor({builder,controller,continuousWorker=null,executionStore=null,repository=null,deploymentController=null,metrics=null,governance=null,policyEngine=null,productUnderstanding=null,architecturePlanner=null,taskDAGGenerator=null,searchProvider=null}={}) {
    if (!builder || !controller) throw new Error("builder and controller are required");
    this.builder=builder;
    this.controller=controller;
    this.continuousWorker=continuousWorker;
    this.executionStore=executionStore;
    this.repository=repository;
    this.deploymentController=deploymentController;
    this.metrics=metrics;
    this.governance=governance;
    this.policyEngine=policyEngine;
    this.productUnderstanding=productUnderstanding;
    this.architecturePlanner=architecturePlanner;
    this.taskDAGGenerator=taskDAGGenerator;
    this.searchProvider=searchProvider;
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
    const progress=typeof context.progress==="function" ? context.progress : ()=>{};
    progress({phase:"REQUIREMENTS",status:"RUNNING",message:"Understanding requirements and acceptance criteria"});
    const governance={transition:async(to,metadata={})=>this.governance?.transition({executionId,to,actorId:context.actorId??"system",tenantId:context.tenantId??"default",metadata})};
    await governance.transition("AUTHORIZED",{command});
    await governance.transition("PLANNED");
    await governance.transition("GENERATING");
    try {
      if(execution) await this.executionStore.append(execution.id,{type:"COMMAND_ACCEPTED",command});

      let candidateContext={...context,executionId:execution?.id};
      // Native Jora planning runs before generation, so the agent remains
      // useful without an external model API key.
      let planning=null;
      if(this.productUnderstanding&&this.architecturePlanner&&this.taskDAGGenerator){
        progress({phase:"ARCHITECTURE",status:"RUNNING",message:"Planning architecture and task DAG"});
        const specification=await this.productUnderstanding.understand({input:command,context:{...context,executionId:execution?.id}});
        const architecture=await this.architecturePlanner.plan({specification,input:command,context:{...context,executionId:execution?.id}});
        const dag=this.taskDAGGenerator.generate({specification,architecture:architecture.plan});
        planning={specification,architecture:architecture.plan,dag:dag.dag};
        candidateContext={...candidateContext,planning};
        if(execution) await this.executionStore.append(execution.id,{
          type:"JORA_PLAN_READY",
          specificationVersion:specification.version,
          architectureId:architecture.plan.id,
          taskCount:dag.dag.nodes.length,
          criticalPath:dag.dag.criticalPath
        });
      }
      progress({phase:"TASKS",status:"COMPLETED",message:planning ? `Planned ${planning.dag.nodes.length} engineering tasks` : "Using direct engineering plan"});
      const researchRequested=Boolean(context.research)||/\b(research|search|latest|news|look up|compare sources)\b/i.test(command);
      if(researchRequested&&this.searchProvider?.search){
        try{
          const research=await this.searchProvider.search({query:command,maxResults:Math.min(8,Number(context.maxSearchResults||8)),topic:context.searchTopic||"general"});
          candidateContext={...candidateContext,research};
          if(execution) await this.executionStore.append(execution.id,{type:"RESEARCH_COMPLETE",provider:research.provider,resultCount:research.results?.length||0});
        }catch(error){
          candidateContext={...candidateContext,researchError:error.message};
          if(execution) await this.executionStore.append(execution.id,{type:"RESEARCH_FAILED",error:error.message});
        }
      }
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
      progress({phase:"CODING",status:"RUNNING",message:"Writing project files and implementing the requested product"});
      const built=await this.builder.build({command,constraints,context:{...candidateContext,progress}});
      progress({phase:"CODING",status:"COMPLETED",message:`Generated ${Array.isArray(built?.files) ? built.files.length : 0} project files`});
      await governance.transition("TESTING");
      progress({phase:"TESTING",status:"RUNNING",message:"Running generated project tests"});
      if(execution) await this.executionStore.append(execution.id,{type:"BUILD_COMPLETE",status:built?.status});

      await governance.transition("SECURITY_CHECK");
      progress({phase:"SECURITY",status:"RUNNING",message:"Scanning generated files and runtime policy"});
      await governance.transition("BENCHMARKING");
      progress({phase:"BENCHMARK",status:"RUNNING",message:"Evaluating tests, quality and production readiness"});
      await governance.transition("CANDIDATE");
      let result=await this.controller.run({
        command,
        context:{...candidateContext,built}
      });
      if(planning||candidateContext.research){
        result={...result,planning:planning??null,research:candidateContext.research??null,researchError:candidateContext.researchError??null};
      }

      progress({phase:"REPAIR_OR_PROMOTION",status:"COMPLETED",message:`Evaluation result: ${result.status}`});
      await governance.transition("PROMOTION_CHECK",{status:result.status});
      if(result.status==="PROMOTED") {
        await this.policyEngine?.enforce?.({
          action:"PROMOTE",
          tenantId:context.tenantId??"default",
          actorId:context.actorId??"system",
          context:{executionId:execution?.id,result},
          metrics:{
            benchmarkScore:result.benchmarkScore??result.evaluation?.benchmarkScore??0,
            qualityScore:result.qualityScore??result.evaluation?.qualityScore??0,
            securityPassed:result.security?.passed??result.securityPassed
          }
        });
        await governance.transition("PROMOTED");
      }
      else await governance.transition("REJECTED",{status:result.status});
      if(result.status==="PROMOTED" && this.deploymentController) {
        await this.policyEngine?.enforce?.({
          action:"DEPLOY",
          tenantId:context.tenantId??"default",
          actorId:context.actorId??"system",
          context:{executionId:execution?.id,result},
          metrics:{
            benchmarkScore:result.benchmarkScore??result.evaluation?.benchmarkScore??0,
            qualityScore:result.qualityScore??result.evaluation?.qualityScore??0,
            securityPassed:result.security?.passed??result.securityPassed
          }
        });
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
