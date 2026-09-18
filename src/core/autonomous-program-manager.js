export class AutonomousProgramManager {
  constructor({missionManager,missionRunner,roadmap,observability=null,maxAttempts=3}={}) {
    if(!missionManager||!missionRunner||!roadmap) throw new Error("missionManager, missionRunner and roadmap are required");
    this.missionManager=missionManager;
    this.missionRunner=missionRunner;
    this.roadmap=roadmap;
    this.observability=observability;
    this.maxAttempts=maxAttempts;
  }

  async initialize(){return this.missionManager.initialize();}

  async status(){
    return {
      service:"autonomous-program-manager",
      mode:this.missionManager.running?"RUNNING":"IDLE",
      roadmap:await this.missionManager.status(),
      tasks:this.roadmap.all()
    };
  }

  async run({objective="Complete Jora roadmap autonomously",context={},maxCycles=Infinity}={}) {
    await this.initialize();
    await this.observability?.append?.({type:"MISSION_STARTED",objective,at:new Date().toISOString()});
    const result=await this.missionRunner.run({objective,context,maxCycles});
    await this.observability?.append?.({type:"MISSION_FINISHED",status:result.status,progress:result.roadmap.progress,at:new Date().toISOString()});
    return result;
  }

  stop(){this.missionRunner.stop();}
}
