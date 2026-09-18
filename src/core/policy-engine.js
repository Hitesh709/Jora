export class PolicyEngine {
  constructor({rules={},auditLog=null}={}) {
    this.rules={
      enabled:rules.enabled!==false,
      denyActions:Array.isArray(rules.denyActions)?rules.denyActions:[],
      allowedTenants:rules.allowedTenants??null,
      minBenchmarkScore:Number.isFinite(Number(rules.minBenchmarkScore))?Number(rules.minBenchmarkScore):0.8,
      minQualityScore:Number.isFinite(Number(rules.minQualityScore))?Number(rules.minQualityScore):0.8,
      requireSecurity:rules.requireSecurity!==false,
      ...rules
    };
    this.auditLog=auditLog;
  }

  async evaluate({action,tenantId="default",actorId="system",context={},metrics={}}={}) {
    const reasons=[];
    let allowed=true;
    if(!this.rules.enabled) reasons.push("policy engine disabled");
    if(this.rules.denyActions.includes(action)) { allowed=false; reasons.push(`action ${action} is denied by policy`); }
    if(Array.isArray(this.rules.allowedTenants) && !this.rules.allowedTenants.includes(tenantId)) {
      allowed=false; reasons.push(`tenant ${tenantId} is not allowed`);
    }
    if(action==="PROMOTE" || action==="DEPLOY") {
      const benchmark=Number(metrics.benchmarkScore??context.benchmarkScore??0);
      const quality=Number(metrics.qualityScore??context.qualityScore??0);
      if(benchmark<this.rules.minBenchmarkScore) { allowed=false; reasons.push("benchmark score below policy threshold"); }
      if(quality<this.rules.minQualityScore) { allowed=false; reasons.push("quality score below policy threshold"); }
      if(this.rules.requireSecurity && metrics.securityPassed===false) { allowed=false; reasons.push("security policy requirement failed"); }
    }
    if(!reasons.length) reasons.push("policy passed");
    const decision={allowed,action,tenantId,actorId,reasons,policyVersion:this.rules.version??"1",timestamp:new Date().toISOString()};
    await this.auditLog?.record({action:"POLICY_DECISION",actorId,tenantId,resource:action,metadata:decision});
    return decision;
  }

  async enforce(args={}) {
    const decision=await this.evaluate(args);
    if(!decision.allowed) {
      const error=new Error(`policy denied: ${decision.reasons.join("; ")}`);
      error.code="POLICY_DENIED";
      error.decision=decision;
      throw error;
    }
    return decision;
  }
}
