export class AutonomousController {
  constructor({delivery,securityCouncil,promotion,championStore=null,maxCycles=Infinity}={}) {
    if(!delivery||!securityCouncil||!promotion) throw new Error("delivery, securityCouncil and promotion are required");
    this.delivery=delivery;
    this.securityCouncil=securityCouncil;
    this.promotion=promotion;
    this.championStore=championStore;
    this.maxCycles=maxCycles;
    this.stopRequested=false;
  }

  stop(){this.stopRequested=true;}

  async run({command,context={}}={}) {
    if(!command) throw new Error("command is required");
    const results=[];
    const championStore=this.championStore??context.championStore;
    if(championStore?.load) await championStore.load();
    const champion=championStore?.get?.()??context.champion??null;

    for(let cycle=1;cycle<=this.maxCycles&&!this.stopRequested;cycle+=1) {
      const project=context.built ?? await this.delivery.deliver({
        command,
        context:{...context,champion}
      });

      if(project?.status==="BLOCKED") {
        results.push({cycle,status:"BUILD_BLOCKED",project,champion});
        continue;
      }

      const candidate=project?.project ?? project;
      const security=await this.securityCouncil.review({
        command,
        context:{...context,champion},
        project:candidate
      });

      if(!security.passed) {
        results.push({cycle,status:"SECURITY_BLOCKED",project,security,champion});
        continue;
      }

      const promotion=await this.promotion.promote({
        candidate,
        champion,
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
            cycle
          });
        }
        return {status:"PROMOTED",results,champion:promotion.candidate};
      }
    }

    return {
      status:this.stopRequested?"STOPPED":"NOT_PROMOTED",
      results,
      champion:championStore?.get?.()??champion??null
    };
  }
}
