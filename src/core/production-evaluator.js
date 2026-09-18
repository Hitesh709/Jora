export class ProductionEvaluator {
  constructor({testRunner,securityCouncil,benchmarkStore}={}) {
    if (!testRunner || !securityCouncil || !benchmarkStore) throw new Error("testRunner, securityCouncil and benchmarkStore are required");
    this.testRunner=testRunner; this.securityCouncil=securityCouncil; this.benchmarkStore=benchmarkStore;
  }
  async evaluate({project,cwd,command,context={}}={}) {
    const tests=await this.testRunner({project,cwd,command,context});
    const security=await this.securityCouncil.review({project,command,context});
    const result={score:tests.ok&&security.passed?1:0,tests,security,productionReady:Boolean(tests.ok&&security.passed),timestamp:new Date().toISOString()};
    this.benchmarkStore.record(result);
    return result;
  }
}
