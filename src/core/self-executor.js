export class SelfExecutor {
  constructor({codeMaster, sandbox, tests} = {}) {
    if (!codeMaster || !sandbox || !tests) {
      throw new Error("codeMaster, sandbox and tests are required");
    }
    this.codeMaster = codeMaster;
    this.sandbox = sandbox;
    this.tests = tests;
  }

  async execute(task, context = {}) {
    if (typeof task.implement !== "function") {
      return {
        passed: false,
        error: "No implementation strategy supplied for task"
      };
    }

    const implementation = await task.implement({
      codeMaster: this.codeMaster,
      sandbox: this.sandbox,
      context
    });

    const testResult = await this.tests.run({
      task,
      implementation,
      sandbox: this.sandbox,
      codeMaster: this.codeMaster
    });

    return {
      passed: Boolean(testResult?.passed),
      implementation,
      testResult
    };
  }

  async diagnose({result, metrics} = {}) {
    return {
      reason: result?.error ?? metrics?.reason ?? "Evaluation gate failed",
      nextAction: "Inspect evidence, generate a minimal repair, and rerun regression tests."
    };
  }
}
