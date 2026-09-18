export class AgentFactory {
  constructor({planner, projectFactory} = {}) {
    if (!planner || !projectFactory) throw new Error("planner and projectFactory are required");
    this.planner = planner;
    this.projectFactory = projectFactory;
  }

  async build(request = {}) {
    if (!request.command) throw new Error("command is required");
    const specification = await this.planner.specify(request);
    return this.projectFactory.create({
      type: "ai-agent",
      request,
      specification
    });
  }
}
