const STATUS = Object.freeze({
  BACKLOG: "BACKLOG", READY: "READY", IN_PROGRESS: "IN_PROGRESS",
  BLOCKED: "BLOCKED", IMPLEMENTED: "IMPLEMENTED", TESTING: "TESTING",
  FAILED: "FAILED", REVIEW: "REVIEW", APPROVED: "APPROVED",
  DEPLOYED: "DEPLOYED", REJECTED: "REJECTED", ROLLED_BACK: "ROLLED_BACK", DONE: "DONE"
});

const VALID_TRANSITIONS = Object.freeze({
  BACKLOG: ["READY", "BLOCKED"],
  READY: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["IMPLEMENTED", "FAILED", "BLOCKED"],
  IMPLEMENTED: ["TESTING", "FAILED"],
  TESTING: ["REVIEW", "FAILED"],
  REVIEW: ["APPROVED", "REJECTED", "BLOCKED"],
  APPROVED: ["DEPLOYED", "ROLLED_BACK"],
  DEPLOYED: ["DONE", "ROLLED_BACK"],
  FAILED: ["READY", "BLOCKED"],
  BLOCKED: ["READY"],
  REJECTED: ["READY", "BLOCKED"],
  ROLLED_BACK: ["READY", "BLOCKED"],
  DONE: []
});

export class TaskRegistry {
  constructor(tasks = []) {
    this.tasks = new Map();
    for (const task of tasks) this.add(task);
  }

  add(task) {
    if (!task?.id) throw new Error("Task id is required");
    if (this.tasks.has(task.id)) throw new Error(`Task already exists: ${task.id}`);
    this.tasks.set(task.id, {
      id: task.id, phase: task.phase ?? "01", title: task.title ?? "",
      priority: task.priority ?? "P2", dependencies: [...(task.dependencies ?? [])],
      status: task.status ?? STATUS.BACKLOG, evidence: [...(task.evidence ?? [])]
    });
    return this.get(task.id);
  }

  get(id) { return this.tasks.get(id); }
  all() { return [...this.tasks.values()].map(t => structuredClone(t)); }

  canStart(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (task.status !== STATUS.READY && task.status !== STATUS.BACKLOG) return false;
    return task.dependencies.every(dep => this.tasks.get(dep)?.status === STATUS.DONE);
  }

  transition(id, nextStatus) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!VALID_TRANSITIONS[task.status]?.includes(nextStatus)) {
      throw new Error(`Invalid transition ${task.status} -> ${nextStatus}`);
    }
    if (nextStatus === STATUS.IN_PROGRESS && !this.canStart(id)) {
      throw new Error(`Dependencies are not complete for ${id}`);
    }
    task.status = nextStatus;
    return this.get(id);
  }

  recordEvidence(id, evidence) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!evidence) throw new Error("Evidence is required");
    task.evidence.push(evidence);
  }

  summary() {
    return [...this.tasks.values()].reduce((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {});
  }
}

export { STATUS, VALID_TRANSITIONS };