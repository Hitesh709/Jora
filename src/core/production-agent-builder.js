export class ProductionAgentBuilder {
  constructor({planner, factory, delivery} = {}) {
    if (!planner || !factory || !delivery) throw new Error("planner, factory and delivery are required");
    this.planner=planner;
    this.factory=factory;
    this.delivery=delivery;
  }

  async build({command, constraints={}, context={}} = {}) {
    if (!command) throw new Error("command is required");
    const spec=await this.planner.specify({command,constraints,context});

    // ProjectFactory already executes the build pipeline and evaluation.
    // Do not call AutonomousDelivery here: AutonomousDelivery calls AgentFactory,
    // which calls ProjectFactory again and creates a recursive build cycle that
    // can exhaust the Railway instance memory. Runtime-level repair/promotion
    // is handled by AutonomousController after this build returns.
    return this.factory.create({
      type:"ai-agent",
      request:{command,constraints,context},
      specification:spec
    });
  }
}