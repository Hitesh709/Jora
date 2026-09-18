export class AutonomousController {
  constructor({delivery,securityCouncil,promotion,maxCycles=Infinity}={}) {
    if(!delivery||!securityCouncil||!promotion) throw new Error("delivery, securityCouncil and promotion are required");
    this.delivery=delivery; this.securityCouncil=securityCouncil; this.promotion=promotion;
    this.maxCycles=maxCycles; this.stopRequested=false;
  }
  stop(){this.stopRequested=true;}
  async run({command,context={}}={}) {
    if(!command) throw new Error("command is required");
    const results=[];
    for(let cycle=1;cycle<=this.maxCycles&&!this.stopRequested;cycle+=1) {
      const project=context.built ?? await this.delivery.deliver({command,context});
      if(project?.status==="BLOCKED") {
        results.push({cycle,status:"BUILD_BLOCKED",project});
        continue;
      }
      const security=await this.securityCouncil.review({command,context,project});
      if(!security.passed) {
        results.push({cycle,status:"SECURITY_BLOCKED",project,security});
        continue;
      }
      const promotion=await this.promotion.promote({
        candidate:project.project ?? project,
        champion:context.champion,
        metrics:{security}
      });
      results.push({cycle,status:promotion.status,project,security,promotion});
      if(promotion.status==="PROMOTED") {
        context.championStore?.promote(promotion.candidate,{...promotion.decision,security});
        return {status:"PROMOTED",results};
      }
    }
    return {status:this.stopRequested?"STOPPED":"NOT_PROMOTED",results};
  }
}
