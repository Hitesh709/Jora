const TRANSITIONS={
  REQUESTED:["AUTHORIZED","REJECTED"],
  AUTHORIZED:["PLANNED","REJECTED"],
  PLANNED:["GENERATING","REJECTED"],
  GENERATING:["ISOLATED","FAILED"],
  ISOLATED:["BUILDING","FAILED"],
  BUILDING:["TESTING","FAILED","BLOCKED"],
  TESTING:["SECURITY_CHECK","FAILED"],
  SECURITY_CHECK:["BENCHMARKING","BLOCKED"],
  BENCHMARKING:["CANDIDATE","BLOCKED"],
  CANDIDATE:["CI","PROMOTION_CHECK","REJECTED"],
  CI:["PROMOTION_CHECK","REJECTED"],
  PROMOTION_CHECK:["PROMOTED","REJECTED","BLOCKED"],
  PROMOTED:["STAGING","PRODUCTION","MONITORING"],
  STAGING:["STAGING_HEALTH","FAILED","ROLLED_BACK"],
  STAGING_HEALTH:["PRODUCTION","ROLLED_BACK"],
  PRODUCTION:["PRODUCTION_HEALTH","FAILED","ROLLED_BACK"],
  PRODUCTION_HEALTH:["MONITORING","ROLLED_BACK"],
  MONITORING:["RECOVERY","COMPLETED"],
  RECOVERY:["MONITORING","ROLLED_BACK","FAILED"],
  REJECTED:[],FAILED:[],BLOCKED:[],ROLLED_BACK:[],COMPLETED:[]
};

export class GovernanceStateMachine {
  constructor({store=null,auditLog=null}={}) { this.store=store; this.auditLog=auditLog; this.states=new Map(); }
  current(executionId){ return this.states.get(executionId)?.state??null; }
  canTransition(from,to){ return Boolean(TRANSITIONS[from]?.includes(to)); }
  async _restore(executionId) {
    if(this.states.has(executionId) || !this.store?.get) return this.current(executionId);
    const execution=await this.store.get(executionId);
    const transitions=(execution?.trace??[]).filter(e=>e.type==="GOVERNANCE_TRANSITION");
    const last=transitions.at(-1);
    if(last) this.states.set(executionId,{state:last.to,updatedAt:last.at});
    return this.current(executionId);
  }
  async transition({executionId,to,actorId="system",tenantId="default",metadata={}}={}) {
    if(!executionId) throw new Error("executionId is required");
    const from=(await this._restore(executionId))??"REQUESTED";
    if(!this.canTransition(from,to)) {
      const error=new Error(`invalid governance transition: ${from} -> ${to}`);
      error.code="INVALID_GOVERNANCE_TRANSITION";
      throw error;
    }
    const event={type:"GOVERNANCE_TRANSITION",executionId,from,to,actorId,tenantId,metadata,at:new Date().toISOString()};
    this.states.set(executionId,{state:to,updatedAt:event.at});
    if(this.store?.append) await this.store.append(executionId,event);
    await this.auditLog?.record({action:"GOVERNANCE_TRANSITION",actorId,tenantId,resource:executionId,metadata:event});
    return event;
  }
  snapshot(executionId){ const value=this.states.get(executionId); return value?{executionId,...value}:null; }
}
export {TRANSITIONS};
