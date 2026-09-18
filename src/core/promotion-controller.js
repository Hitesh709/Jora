export class PromotionController {
  constructor({evaluator, repository, targetBranch="main", ciGate=null,policyEngine=null,regressionAnalyzer=null,benchmarkStore=null,championSelector=null}={}) {
    if (!evaluator || !repository) throw new Error("evaluator and repository are required");
    this.evaluator=evaluator;
    this.repository=repository;
    this.targetBranch=targetBranch;
    this.ciGate=ciGate;
    this.policyEngine=policyEngine;
    this.regressionAnalyzer=regressionAnalyzer;
    this.benchmarkStore=benchmarkStore;
    this.championSelector=championSelector;
  }

  async promote({candidate, champion, metrics={},context={}}={}) {
    const policy=await this.policyEngine?.evaluate({action:"PROMOTE",tenantId:context.tenantId??"default",actorId:context.actorId??"system",context,metrics:{...metrics,benchmarkScore:metrics.benchmarkScore??candidate?.evaluation?.benchmarkScore,qualityScore:metrics.qualityScore??candidate?.evaluation?.qualityScore,securityPassed:metrics.security?.passed}});
    if(policy && !policy.allowed) return {status:"POLICY_BLOCKED",policy,candidate,champion};
    const decision=await this.evaluator.evaluate({
      candidate,
      champion,
      ...metrics
    });
    if (!decision.passed) return {status:"REJECTED", decision, candidate, champion};
    const regression=this.regressionAnalyzer?.compare(candidate,champion,this.benchmarkStore?.list?.()??[]);
    const championSelection=this.championSelector?.select({candidate,champion});
    if(championSelection && !championSelection.selected) return {status:"CHAMPION_BLOCKED",decision,regression,championSelection,candidate,champion};
    if(regression && !regression.passed) return {status:"REGRESSION_BLOCKED",decision,regression,candidate,champion};

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
