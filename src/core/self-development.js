export const DEV_STATUS = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  BLOCKED: "BLOCKED",
  STOPPED: "STOPPED",
  FAILED: "FAILED"
});

export class SelfDevelopmentEngine {
  constructor({
    inspector,
    taskGenerator,
    executor,
    evaluator,
    store,
    maxRepairAttempts = 3,
    maxTasksPerCycle = 1
  } = {}) {
    for (const [name, value] of Object.entries({inspector, taskGenerator, executor, evaluator, store})) {
      if (!value) throw new Error(`${name} is required`);
    }
    this.inspector = inspector;
    this.taskGenerator = taskGenerator;
    this.executor = executor;
    this.evaluator = evaluator;
    this.store = store;
    this.maxRepairAttempts = maxRepairAttempts;
    this.maxTasksPerCycle = maxTasksPerCycle;
    this.status = DEV_STATUS.IDLE;
    this.stopRequested = false;
  }

  stop() {
    this.stopRequested = true;
    if (this.status === DEV_STATUS.RUNNING) this.status = DEV_STATUS.STOPPED;
  }

  async cycle({objective, context = {}} = {}) {
    if (!objective) throw new Error("objective is required");
    if (this.stopRequested) return {status: DEV_STATUS.STOPPED, tasks: []};

    this.status = DEV_STATUS.RUNNING;
    const snapshot = await this.inspector.inspect(context);
    const tasks = await this.taskGenerator.generate({
      objective,
      snapshot,
      limit: this.maxTasksPerCycle
    });

    const results = [];
    for (const task of tasks) {
      if (this.stopRequested) break;
      results.push(await this.executeWithRepair(task, {snapshot, context}));
    }

    if (!this.stopRequested) this.status = DEV_STATUS.IDLE;
    return {status: this.status, snapshot, tasks: results};
  }

  async executeWithRepair(task, {snapshot, context} = {}) {
    const execution = this.store.create({
      taskId: task.id,
      agentId: task.agentId ?? "jora-self-development",
      input: {task, snapshot, context}
    });

    let attempt = 0;
    let result = null;

    while (attempt <= this.maxRepairAttempts) {
      if (this.stopRequested) {
        return {...this.store.finish(execution.id, DEV_STATUS.STOPPED, {taskId: task.id, attempt}), attempts: attempt};
      }

      attempt += 1;
      this.store.append(execution.id, {type: "IMPLEMENTATION_ATTEMPT", attempt});
      try {
        result = await this.executor.execute(task, {attempt, snapshot, context});
      } catch (error) {
        result = {passed: false, error: error.message};
      }

      const metrics = await this.evaluator.evaluate({
        task,
        result,
        attempt,
        snapshot
      });

      this.store.append(execution.id, {type: "EVALUATION", attempt, metrics});

      if (metrics.passed) {
        this.store.append(execution.id, {
          type: "PROMOTION_READY",
          attempt,
          evidence: metrics
        });
        return {...this.store.finish(execution.id, "SUCCEEDED", {
          taskId: task.id,
          attempts: attempt,
          metrics,
          result
        }), attempts: attempt};
      }

      if (attempt <= this.maxRepairAttempts) {
        const diagnosis = await this.executor.diagnose?.({
          task,
          result,
          metrics,
          attempt,
          snapshot,
          context
        });
        this.store.append(execution.id, {
          type: "REPAIR_REQUESTED",
          attempt,
          diagnosis: diagnosis ?? "No diagnosis supplied"
        });
      }
    }

    return {...this.store.finish(execution.id, "FAILED", {
      taskId: task.id,
      attempts: attempt,
      result
    }), attempts: attempt};
  }

  async run({objective, context = {}, cycles = 1} = {}) {
    if (!Number.isInteger(cycles) || cycles < 1) throw new Error("cycles must be a positive integer");
    const results = [];
    for (let i = 0; i < cycles && !this.stopRequested; i += 1) {
      results.push(await this.cycle({objective, context}));
    }
    return results;
  }
}
