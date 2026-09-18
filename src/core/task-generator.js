export class SelfTaskGenerator {
  constructor({model} = {}) {
    if (!model || typeof model.generate !== "function") {
      throw new Error("model.generate is required");
    }
    this.model = model;
  }

  async generate({objective, snapshot, limit = 1} = {}) {
    const response = await this.model.generate({objective, snapshot, limit});
    const tasks = Array.isArray(response) ? response : response?.tasks;
    if (!Array.isArray(tasks)) throw new Error("task generator model must return an array or {tasks}");
    return tasks.slice(0, limit).map((task, index) => ({
      id: task.id ?? `SELF-${Date.now()}-${index + 1}`,
      title: task.title ?? "Unnamed self-development task",
      description: task.description ?? "",
      priority: task.priority ?? 0,
      agentId: task.agentId ?? "jora-code-master",
      ...task
    }));
  }
}
