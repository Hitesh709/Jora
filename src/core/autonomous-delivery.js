export class AutonomousDelivery {
  constructor({agentFactory,evolution,maxRepairCycles=3}={}) {
    if(!agentFactory||!evolution) throw new Error("agentFactory and evolution are required");
    this.agentFactory=agentFactory; this.evolution=evolution; this.maxRepairCycles=maxRepairCycles;
  }

  async deliver({command,constraints={},context={}}={}) {
    let last;
    let repairFeedback=null;
    const history=[];
    for(let cycle=1;cycle<=this.maxRepairCycles;cycle+=1) {
      const cycleContext={...context,repairFeedback,repairHistory:history,cycle};
      last=await this.agentFactory.build({command,constraints,context:cycleContext,cycle});
      history.push({cycle,status:last.productionReady?"PASS":"FAIL",evaluation:last.evaluation});
      if(last.productionReady) return {status:"DELIVERED",cycles:cycle,project:last,history};

      const improvement=await this.evolution.propose({
        champion:last,
        weakness:last.evaluation,
        hypothesis:"Diagnose the failed gates and repair the candidate before the next cycle.",
        candidate:last
      });
      repairFeedback={
        diagnosis:last.evaluation,
        hypothesis:improvement.hypothesis,
        lifecycle:improvement.lifecycle,
        previousCandidate:last
      };
    }
    return {
      status:"BLOCKED",
      cycles:this.maxRepairCycles,
      project:last,
      history,
      reason:"Production-readiness gates did not pass within the configured repair budget."
    };
  }
}
