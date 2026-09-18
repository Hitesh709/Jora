export class DeploymentController {
  constructor({adapter,healthCheck=null,store=null}={}) {
    if(!adapter || typeof adapter.deploy!=="function") throw new Error("adapter.deploy is required");
    this.adapter=adapter;
    this.healthCheck=healthCheck;
    this.store=store;
  }

  async _record(event){
    if(this.store?.record) await this.store.record(event);
  }

  async deploy({candidate,version,context={}}={}) {
    const startedAt=new Date().toISOString();
    await this._record({type:"DEPLOYMENT_STARTED",version,startedAt});
    let deployment;
    try {
      deployment=await this.adapter.deploy(candidate,{...context,version});
      await this._record({type:"DEPLOYMENT_CREATED",version,deployment});
      if(this.healthCheck) {
        const health=await this.healthCheck.check({deployment,candidate,version,context});
        await this._record({type:"HEALTH_CHECK",version,health});
        if(!health?.passed) {
          const rollback=await this.rollback(deployment?.ref??version,{reason:"health check failed",context});
          return {status:"ROLLED_BACK",version,deployment,health,rollback};
        }
      }
      const result={status:"DEPLOYED",version,deployment,healthChecked:Boolean(this.healthCheck),deployedAt:new Date().toISOString()};
      await this._record({type:"DEPLOYMENT_SUCCEEDED",...result});
      return result;
    } catch(error) {
      await this._record({type:"DEPLOYMENT_FAILED",version,error:error.message});
      let rollback=null;
      if(deployment && typeof this.adapter.rollback==="function") {
        rollback=await this.rollback(deployment.ref??version,{reason:error.message,context});
      }
      return {status:rollback?"ROLLED_BACK":"DEPLOY_FAILED",version,error:error.message,deployment,rollback};
    }
  }

  async rollback(ref,context={}) {
    if(typeof this.adapter.rollback!=="function") throw new Error("adapter.rollback is not configured");
    const result=await this.adapter.rollback(ref,context);
    await this._record({type:"DEPLOYMENT_ROLLBACK",ref,result,at:new Date().toISOString()});
    return result;
  }
}
