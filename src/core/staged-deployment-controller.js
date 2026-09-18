export class StagedDeploymentController {
  constructor({staging,production,store=null}={}) {
    if(!staging || typeof staging.deploy!=="function") throw new Error("staging deployment controller is required");
    if(!production || typeof production.deploy!=="function") throw new Error("production deployment controller is required");
    this.staging=staging;
    this.production=production;
    this.store=store;
  }

  async _record(event){
    if(this.store?.record) await this.store.record(event);
  }

  async deploy({candidate,version,context={}}={}) {
    const startedAt=new Date().toISOString();
    await this._record({type:"STAGED_DEPLOYMENT_STARTED",version,startedAt});

    const staging=await this.staging.deploy({
      candidate,
      version,
      context:{...context,environment:"staging"}
    });
    await this._record({type:"STAGING_DEPLOYMENT_RESULT",version,status:staging.status,result:staging});

    if(staging.status!=="DEPLOYED") {
      const result={status:"STAGING_FAILED",version,staging,production:null};
      await this._record({
        type:"STAGED_DEPLOYMENT_BLOCKED",
        version,
        reason:"staging deployment or health gate failed",
        result
      });
      return result;
    }

    const production=await this.production.deploy({
      candidate,
      version,
      context:{...context,environment:"production",staging}
    });
    await this._record({type:"PRODUCTION_DEPLOYMENT_RESULT",version,status:production.status,result:production});

    const status=production.status==="DEPLOYED" ? "DEPLOYED" : "PRODUCTION_FAILED";
    const result={status,version,staging,production};
    await this._record({
      type:status==="DEPLOYED" ? "STAGED_DEPLOYMENT_SUCCEEDED" : "STAGED_DEPLOYMENT_FAILED",
      version,
      result
    });
    return result;
  }

  async rollbackProduction(ref,context={}) {
    if(typeof this.production.rollback!=="function") throw new Error("production rollback is not configured");
    return this.production.rollback(ref,{...context,environment:"production"});
  }
}
