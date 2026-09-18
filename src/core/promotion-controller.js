export class PromotionController {
  constructor({evaluator, repository, targetBranch="main"}={}) {
    if (!evaluator || !repository) throw new Error("evaluator and repository are required");
    this.evaluator=evaluator;
    this.repository=repository;
    this.targetBranch=targetBranch;
  }

  async promote({candidate, champion, metrics={}}={}) {
    const decision=await this.evaluator.evaluate({
      candidate,
      champion,
      ...metrics
    });
    if (!decision.passed) return {status:"REJECTED", decision, candidate, champion};

    const commit=await this.repository.commit?.(
      `Candidate validation ${candidate.version ?? "unknown"}`
    );

    let promotion=null;
    if (typeof this.repository.promoteCandidate==="function") {
      promotion=await this.repository.promoteCandidate({
        branch:commit?.branch,
        targetBranch:this.targetBranch
      });
    }

    const promotedCandidate={
      ...candidate,
      version:promotion?.commit??commit?.commit??candidate.version,
      git:{
        branch:commit?.branch,
        commit:promotion?.commit??commit?.commit,
        previous:promotion?.previous,
        targetBranch:this.targetBranch
      }
    };

    return {
      status:"PROMOTED",
      decision,
      version:promotedCandidate.version,
      commit,
      promotion,
      candidate:promotedCandidate,
      previousChampion:champion??null
    };
  }

  async rollback(ref,options={}) {
    if (!ref) throw new Error("rollback ref is required");
    if (typeof this.repository.rollbackTo==="function") {
      return this.repository.rollbackTo(ref,{branch:options.branch??this.targetBranch});
    }
    return this.repository.rollback(ref);
  }
}
