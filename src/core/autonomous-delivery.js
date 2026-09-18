export class AutonomousDelivery {
  constructor({agentFactory, evolution, maxRepairCycles = 3} = {}) {
    if (!agentFactory || !evolution) throw new Error("agentFactory and evolution are required");
    this.agentFactory = agentFactory;
    this.evolution = evolution;
    this.maxRepairCycles = maxRepairCycles;
  }

  async deliver({command, constraints = {}, context = {}} = {}) {
    let last;
    for (let cycle = 1; cycle <= this.maxRepairCycles; cycle += 1) {
      last = await this.agentFactory.build({command, constraints, context, cycle});
      if (last.productionReady) {
        return {
          status: "DELIVERED",
          cycles: cycle,
          project: last
        };
      }

      const improvement = await this.evolution.propose({
        champion: last,
        weakness: last.evaluation,
        hypothesis: "Repair the failing production-readiness gates.",
        candidate: last
      });

      last = {...last, improvement};
    }

    return {
      status: "BLOCKED",
      cycles: this.maxRepairCycles,
      project: last,
      reason: "Production-readiness gates did not pass within the configured repair budget."
    };
  }
}
