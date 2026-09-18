export class Evaluator {
  constructor({ minimumScore = 0.8 } = {}) {
    this.minimumScore = minimumScore;
  }

  evaluate({ testsPassed, securityPassed, benchmarkScore = 0, qualityScore = 0 }) {
    const passed = Boolean(testsPassed && securityPassed &&
      benchmarkScore >= this.minimumScore && qualityScore >= this.minimumScore);
    return {
      passed,
      benchmarkScore,
      qualityScore,
      reasons: passed ? ["All promotion gates passed"] : ["One or more promotion gates failed"]
    };
  }
}