export class AgentSpecPlanner {
  async specify({command, constraints = {}, context = {}} = {}) {
    if (!command) throw new Error("command is required");
    return {
      kind: "production-ai-agent",
      command,
      objective: command,
      requirements: {
        interface: "chat-or-api",
        modelGateway: true,
        tools: true,
        memory: true,
        sandbox: true,
        evaluation: true,
        observability: true,
        deployment: true
      },
      constraints,
      context,
      acceptanceCriteria: [
        "Agent starts successfully",
        "Core task behavior is tested",
        "Tool permissions are enforced",
        "Failures are observable",
        "Security gates pass",
        "Regression benchmarks pass",
        "Deployment is reproducible",
        "Rollback is available"
      ]
    };
  }
}
