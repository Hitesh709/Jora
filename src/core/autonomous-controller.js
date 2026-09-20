export class AutonomousController {
  constructor({delivery,securityCouncil,promotion,championStore=null,maxCycles=Infinity,policyEngine=null,auditLog=null,population=null,researchLoop=null}={}) {
    if(!delivery||!securityCouncil||!promotion) throw new Error("delivery, securityCouncil and promotion are required");
    this.delivery=delivery;
    this.securityCouncil=securityCouncil;
    this.promotion=promotion;
    this.championStore=championStore;
    this.maxCycles=maxCycles;
    this.stopRequested=false;
    this.policyEngine=policyEngine;
    this.auditLog=auditLog;
    this.population=population;
    this.researchLoop=researchLoop;
  }

  stop(){this.stopRequested=true;}

  async run({command,context={}}={}) {
    if(!command) throw new Error("command is required");
    this.stopRequested=false;
    const results=[];
    const championStore=this.championStore??context.championStore;
    if(championStore?.load) await championStore.load();
    const champion=championStore?.get?.()??context.champion??null;
    let project=context.built??null;
    let repairFeedback=context.repairFeedback??null;
    let repairHistory=[...(context.repairHistory??[])];

    for(let cycle=1;cycle<=this.maxCycles&&!this.stopRequested;cycle+=1) {
      const tenantId=context.tenantId??"default";
      const actorId=context.actorId??"system";
      const policy=await this.policyEngine?.evaluate({action:"EXECUTE",tenantId,actorId,context,metrics:{}});
      if(policy && !policy.allowed) { results.push({cycle,status:"POLICY_BLOCKED",policy}); break; }

      if(!project) {
        project=await this.delivery.deliver({
          command,
          context:{...context,champion,repairFeedback,repairHistory}
        });
      }

      if(project?.status==="BLOCKED") {
        const blocked={cycle,status:"BUILD_BLOCKED",project,champion};
        results.push(blocked);
        repairFeedback={
          source:"BUILD",
          diagnosis:project.evaluation??project.reason,
          history:Array.isArray(project.history)?project.history.slice():[]
        };
        repairHistory.push({cycle,status:"BUILD_BLOCKED",feedback:repairFeedback});
        project=null;
        continue;
      }

      const candidate=project?.project ?? project;
      this.population?.add?.(candidate,{cycle,command});
      const security=await this.securityCouncil.review({
        command,
        context:{...context,champion,repairFeedback,sandbox:context.sandbox,network:context.network??"none",securityConfig:context.securityConfig},
        project:candidate
      });

      if(!security.passed) {
        const blocked={cycle,status:"SECURITY_BLOCKED",project,security,champion};
        results.push(blocked);
        repairFeedback={
          source:"SECURITY",
          diagnosis:security,
          history:repairHistory.slice()
        };
        repairHistory.push({cycle,status:"SECURITY_BLOCKED",feedback:repairFeedback});
        project=null;
        continue;
      }

      const promotion=await this.promotion.promote({
        candidate,
        champion,
        context,
        metrics:{
          security,
          benchmarkScore:candidate?.evaluation?.benchmarkScore,
          qualityScore:candidate?.evaluation?.qualityScore
        }
      });

      results.push({cycle,status:promotion.status,project,security,promotion,champion});

      if(promotion.status==="PROMOTED") {
        if(championStore?.promote) {
          await championStore.promote(promotion.candidate,{
            ...promotion.decision,
            security,
            ci:promotion.ci,
            cycle
          });
        }
        return {status:"PROMOTED",results,champion:promotion.candidate};
      }

      repairFeedback={
        source:promotion.status==="CI_BLOCKED"?"CI":"PROMOTION",
        diagnosis:promotion.ci??promotion.decision,
        history:Array.isArray(promotion.ci?.evidence)?promotion.ci.evidence.slice():repairHistory.slice()
      };
      repairHistory.push({cycle,status:promotion.status,feedback:repairFeedback});
      project=null;
    }

    return {
      status:this.stopRequested?"STOPPED":"NOT_PROMOTED",
      results,
      champion:championStore?.get?.()??champion??null
    };
  }
}
