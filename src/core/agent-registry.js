export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(agent) {
    if (!agent?.id) throw new Error("Agent id is required");
    if (this.agents.has(agent.id)) throw new Error(`Agent already exists: ${agent.id}`);
    this.agents.set(agent.id, {
      id: agent.id,
      name: agent.name ?? agent.id,
      version: agent.version ?? 1,
      capabilities: [...(agent.capabilities ?? [])],
      permissions: [...(agent.permissions ?? [])],
      status: "ACTIVE"
    });
    return this.get(agent.id);
  }

  get(id) { return this.agents.get(id); }
  list() { return [...this.agents.values()].map(a => structuredClone(a)); }
}