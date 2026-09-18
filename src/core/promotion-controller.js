export class PromotionController {
  constructor({evaluator, repository, targetBranch="main", ciGate=null}={}) {
    if (!evaluator || !repository) throw new Error("evaluator and repository are required");
    this.evaluator=evaluator;
    this.repository=repository;
    this.targetBranch=targetBranch;
    this.ciGate=ciGate;
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

    let ci=null;
    const ciCommit=commit?.remote?.commit;
    if(this.ciGate) {
      ci=await this.ciGate.review({
        branch:commit?.remote?.branch??commit?.branch,
        commit:ciCommit
      });
      if(!ci.passed) {
        return {
          status:"CI_BLOCKED",
          decision,
          ci,
          commit,
          candidate,
          champion
        };
      }
    }

    let promotion=null;
    if (typeof this.repository.promoteCandidate==="function") {
      promotion=await this.repository.promoteCandidate({
        branch:commit?.branch,
        targetBranch:this.targetBranch
      });
    }

    const promotedCandidate={
      ...candidate,
      version:promotion?.remote?.commit??promotion?.commit??commit?.remote?.commit??commit?.commit??candidate.version,
      git:{
        branch:commit?.branch,
        commit:promotion?.remote?.commit??promotion?.commit??commit?.remote?.commit??commit?.commit,
        localCommit:promotion?.commit??commit?.commit,
        previous:promotion?.remote?.previous??promotion?.previous,
        targetBranch:this.targetBranch
      },
      ci
    };

    return {
      status:"PROMOTED",
      decision,
      ci,
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
