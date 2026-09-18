export class DeploymentAdapter {
  constructor({deployFn,rollbackFn}={}){if(typeof deployFn!=="function") throw new Error("deployFn is required"); this.deployFn=deployFn; this.rollbackFn=rollbackFn;}
  async deploy(candidate,context={}){return this.deployFn(candidate,context);}
  async rollback(ref,context={}){if(!this.rollbackFn) throw new Error("rollbackFn is not configured"); return this.rollbackFn(ref,context);}
}
