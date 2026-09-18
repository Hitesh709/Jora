export class EvolutionEngine {
  constructor({ evaluator } = {}) {
    if (!evaluator) throw new Error("Evaluator is required");
    this.evaluator = evaluator;
  }

  propose({ champion, weakness, hypothesis, candidate }) {
    if (!champion || !weakness || !hypothesis || !candidate) {
      throw new Error("champion, weakness, hypothesis and candidate are required");
    }
    return {
      champion, weakness, hypothesis, candidate,
      lifecycle: ["GENERATE", "ISOLATE", "TEST", "SECURITY_CHECK", "BENCHMARK", "COMPARE", "APPROVE", "VERSION", "DEPLOY", "MONITOR", "ROLLBACK"]
    };
  }

  decide(metrics) {
    return this.evaluator.evaluate(metrics);
  }
}