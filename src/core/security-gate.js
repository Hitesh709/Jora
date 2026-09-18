export class SecurityGate {
  constructor({checks = []} = {}) {
    this.checks = checks;
  }

  async inspect(context = {}) {
    const results = [];
    for (const check of this.checks) {
      try {
        const result = await check(context);
        results.push({name: check.name || "anonymous-check", passed: result?.passed === true, details: result});
      } catch (error) {
        results.push({name: check.name || "anonymous-check", passed: false, details: {error: error.message}});
      }
    }
    return {
      passed: results.length > 0 && results.every(r => r.passed),
      results
    };
  }
}
