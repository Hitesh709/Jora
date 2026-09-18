export class PolicyRegistry {
  constructor({policies={default:{enabled:true}},defaultPolicy="default"}={}) {
    this.policies=new Map(Object.entries(policies));
    this.defaultPolicy=defaultPolicy;
  }
  get(name=this.defaultPolicy){ return this.policies.get(name)??this.policies.get(this.defaultPolicy)??null; }
  set(name,policy){ if(!name) throw new Error("policy name is required"); this.policies.set(name,{...policy}); return this.policies.get(name); }
  list(){ return [...this.policies.entries()].map(([name,policy])=>({name,policy:{...policy}})); }
}
