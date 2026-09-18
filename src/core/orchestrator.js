export class Orchestrator {
  constructor({ registry, agents = new Map() } = {}) {
    if (!registry) throw new Error("Task registry is required");
    this.registry = registry;
    this.agents = agents;
  }

  plan(objective) {
    if (!objective?.trim()) throw new Error("Objective is required");
    return {
      objective: objective.trim(),
      stages: ["requirements", "architecture", "implementation", "validation", "evaluation"],
      governance: "controlled"
    };
  }

  readyTasks(limit = 10) {
    return this.registry.all()
      .filter(task => (task.status === "READY" || task.status === "BACKLOG") && this.registry.canStart(task.id))
      .sort((a,b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}