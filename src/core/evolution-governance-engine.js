/**
 * Jora Phase 5 — Controlled Self-Evolution Governance
 *
 * Keeps candidate evolution behind explicit, machine-checkable gates.
 * Candidate generation never implies production readiness.
 */
export class EvolutionGovernanceEngine {
  constructor({
    minimumBenchmarkScore=0.8,
    minimumDelta=0,
    requireSecurity=true,
    requireTests=true,
    requireApproval=true
  }={}) {
    this.version="5.0.0";
    this.minimumBenchmarkScore=Number(minimumBenchmarkScore);
    this.minimumDelta=Number(minimumDelta);
    this.requireSecurity=requireSecurity!==false;
    this.requireTests=requireTests!==false;
    this.requireApproval=requireApproval!==false;
  }

  assess({baseline=null,candidate=null,evaluation={},security={},tests={},approval=false}={}) {
    const benchmark=Number(evaluation.benchmarkScore??evaluation.score??candidate?.evaluation?.benchmarkScore??candidate?.score??0);
    const baselineScore=Number(baseline?.evaluation?.benchmarkScore??baseline?.evaluation?.score??baseline?.score??0);
    const delta=benchmark-baselineScore;
    const checks={
      benchmark:benchmark>=this.minimumBenchmarkScore,
      improvement:!baseline || delta>=this.minimumDelta,
      security:!this.requireSecurity || security.passed===true,
      tests:!this.requireTests || tests.passed===true,
      approval:!this.requireApproval || approval===true
    };
    const failed=Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name);
    const blockingFailures=failed.filter(name=>name!=="approval");
    const awaitingApproval=this.requireApproval && approval!==true && blockingFailures.length===0;
    return {
      accepted:true,
      status:blockingFailures.length
        ?"EVOLUTION_BLOCKED"
        :awaitingApproval
          ?"EVOLUTION_READY_FOR_APPROVAL"
          :"EVOLUTION_APPROVED",
      version:this.version,
      benchmarkScore:benchmark,
      baselineScore,
      delta,
      checks,
      failedGates:failed,
      productionReady:blockingFailures.length===0 && (!this.requireApproval || approval===true)
    };
  }

  approve({assessment,approved=false}={}) {
    if(!assessment || assessment.status!=="EVOLUTION_READY_FOR_APPROVAL") {
      return {accepted:false,status:"APPROVAL_NOT_AVAILABLE",error:"candidate is not awaiting approval"};
    }
    if(approved!==true) return {accepted:false,status:"EVOLUTION_REJECTED",error:"explicit approval is required"};
    return {accepted:true,status:"EVOLUTION_APPROVED",assessment:{...assessment,checks:{...assessment.checks,approval:true},failedGates:[],productionReady:true}};
  }
}
