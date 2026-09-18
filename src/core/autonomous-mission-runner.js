export class AutonomousMissionRunner {
  constructor({missionManager,executeTask,verifyTask=null,intervalMs=0,maxCycles=Infinity}={}) {
    if(!missionManager||typeof executeTask!=="function") throw new Error("missionManager and executeTask are required");
    this.missionManager=missionManager;
    this.executeTask=executeTask;
    this.verifyTask=verifyTask??(async({result})=>Boolean(result && ["PROMOTED","DEPLOYED"].includes(result.status)));
    this.intervalMs=intervalMs;
    this.maxCycles=maxCycles;
    this.stopRequested=false;
  }

  stop(){this.stopRequested=true;this.missionManager.stop();}

  async run({objective,context={},maxCycles=this.maxCycles}={}) {
    this.stopRequested=false;
    this.missionManager.start();
    const results=[];
    for(let cycle=1;cycle<=maxCycles&&!this.stopRequested;cycle++) {
      const tasks=await this.missionManager.nextWork({objective,context,limit:this.missionManager.maxTasksPerCycle});
      if(!tasks.length) break;
      for(const planned of tasks) {
        if(this.stopRequested) break;
        let task;
        try {
          task=await this.missionManager.claim(planned);
          const result=await this.executeTask(task,{objective,context,cycle});
          const accepted=await this.verifyTask({task,result,context,cycle});
          if(accepted) {
            const state=await this.missionManager.complete(task,{status:result?.status,evidence:result?.promotion??result?.deployment??null,verified:true});
            results.push({cycle,task,status:"DONE",result,verified:true,state});
          } else {
            const state=await this.missionManager.fail(task,{status:result?.status??"UNKNOWN",result,verified:false,reason:"task acceptance gate failed"});
            results.push({cycle,task,status:"VERIFICATION_FAILED",result,verified:false,state});
          }
        } catch(error) {
          if(task) {
            const state=await this.missionManager.fail(task,{error:error.message});
            results.push({cycle,task,status:"FAILED",error:error.message,state});
          } else {
            results.push({cycle,task:planned,status:"CLAIM_FAILED",error:error.message});
          }
        }
      }
      if(this.intervalMs>0&&cycle<maxCycles) await new Promise(resolve=>setTimeout(resolve,this.intervalMs));
    }
    return {status:this.stopRequested?"STOPPED":"COMPLETED",results,roadmap:await this.missionManager.status()};
  }
}
