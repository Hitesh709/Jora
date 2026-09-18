export class PromotionController {
  constructor({evaluator, repository}={}) {
    if (!evaluator || !repository) throw new Error("evaluator and repository are required");
    this.evaluator=evaluator; this.repository=repository;
  }

  async promote({candidate, champion, metrics={}}={}) {
    const decision=await this.evaluator.evaluate({
      candidate,
      champion,
      ...metrics
    });
    if (!decision.passed) return {status:"REJECTED", decision, candidate, champion};
    const version=await this.repository.commit?.(
      `Promote candidate ${candidate.version ?? "unknown"}`,
      candidate.changes ?? []
    );
    return {
      status:"PROMOTED",
      decision,
      version,
      candidate,
      previousChampion:champion??null
    };
  }

  async rollback(ref) {
    if (!ref) throw new Error("rollback ref is required");
    return this.repository.rollback(ref);
  }
}
