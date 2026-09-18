export class SecurityCouncil {
  constructor({gates = [], quorum = null} = {}) {
    if (!Array.isArray(gates) || gates.length === 0) throw new Error("at least one security gate is required");
    this.gates = gates;
    this.quorum = quorum ?? gates.length;
  }

  async review(context = {}) {
    const reports = [];
    for (const gate of this.gates) {
      reports.push(await gate.inspect(context));
    }
    const passed = reports.filter(r => r.passed).length;
    const required = Math.min(this.quorum, this.gates.length);
    return {
      passed: passed >= required,
      passedGates: passed,
      totalGates: this.gates.length,
      requiredGates: required,
      reports
    };
  }
}
