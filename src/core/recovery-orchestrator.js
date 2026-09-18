export class RecoveryOrchestrator {
  constructor({worker=null,queue=null,deploymentController=null,observability=null,controller=null,policy={}}={}) {
    this.worker=worker; this.queue=queue; this.deploymentController=deploymentController; this.observability=observability; this.controller=controller;
    this.policy={HIGH_FAILURE_RATE:"REPAIR",HIGH_LATENCY:"REPAIR",STALE_WORKER:"WORKER_RECOVERY",QUEUE_BACKLOG:"QUEUE_RECOVERY",...policy};
    this.cooldowns=new Map();
    this.cooldownMs=30000;
  }
  async handle(alert,{now=Date.now()}={}) {
    const action=this.policy[alert.alertType];
    if(!action) return {status:"IGNORED",reason:"no recovery policy"};
    const previous=this.cooldowns.get(alert.alertType)||0;
    if(now-previous<this.cooldownMs) return {status:"COOLDOWN",action,alertType:alert.alertType};
    this.cooldowns.set(alert.alertType,now);
    const event={type:"RECOVERY_STARTED",alertType:alert.alertType,action,at:new Date().toISOString()};
    await this.observability?.record(event);
    try {
      let result={status:"NO_ACTION",action};
      if(action==="WORKER_RECOVERY") {
        if(this.queue?.recoverExpired) result={status:"RECOVERED_QUEUE",recovered:await this.queue.recoverExpired()};
        if(this.worker && !this.worker.running && this.queue) {
          const promise=this.worker.run({context:{recovery:"stale-worker"}});
          promise.catch(()=>{});
          result={...result,status:"WORKER_RESTART_REQUESTED"};
        }
      } else if(action==="QUEUE_RECOVERY") {
        const recovered=this.queue?.recoverExpired?await this.queue.recoverExpired():0;
        result={status:"QUEUE_RECOVERED",recovered};
      } else if(action==="REPAIR") {
        if(this.queue?.enqueue) {
          const job=await this.queue.enqueue({command:"Diagnose and repair the latest operational issue",context:{recovery:"operational-alert",alert}});
          if(this.worker && !this.worker.running) { const promise=this.worker.run({context:{recovery:"operational-alert"}}); promise.catch(()=>{}); }
          result={status:"REPAIR_QUEUED",jobId:job.id};
        } else if(this.controller?.run) {
          const promise=this.controller.run({command:"Diagnose and repair the latest operational issue",context:{recovery:"operational-alert",alert}});
          promise.catch(()=>{});
          result={status:"REPAIR_STARTED"};
        }
      } else if(action==="ROLLBACK") {
        if(this.deploymentController?.rollback) result={status:"ROLLBACK_REQUESTED",rollback:await this.deploymentController.rollback({reason:alert.message})};
      }
      await this.observability?.record({...event,type:"RECOVERY_COMPLETED",result,at:new Date().toISOString()});
      return result;
    } catch(error) {
      const result={status:"RECOVERY_FAILED",action,error:error.message};
      await this.observability?.record({...event,type:"RECOVERY_FAILED",result,at:new Date().toISOString()}).catch?.(()=>{});
      return result;
    }
  }
}
