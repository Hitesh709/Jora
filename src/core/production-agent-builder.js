export class ProductionAgentBuilder {
  constructor({planner, factory, delivery} = {}) {
    if (!planner || !factory || !delivery) throw new Error("planner, factory and delivery are required");
    this.planner=planner; this.factory=factory; this.delivery=delivery;
  }

  async build({command, constraints={}, context={}} = {}) {
    if (!command) throw new Error("command is required");
    const spec=await this.planner.specify({command,constraints,context});
    const project=await this.factory.create({type:"ai-agent",request:{command,constraints,context},specification:spec});
    return this.delivery.deliver({
      command,
      constraints,
      context:{...context,specification:spec,project}
    });
  }
}
