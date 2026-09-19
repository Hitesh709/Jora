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
    let architecturePlan=null;
    if(this.architectCore?.plan) architecturePlan=await this.architectCore.plan({objective,context});
    else if(this.autonomousArchitect?.plan) architecturePlan=await this.autonomousArchitect.plan({objective,context});
    const missionContext={...context,architecturePlan};
    await this.observability?.append?.({type:"MISSION_STARTED",objective,architectureId:architecturePlan?.contract?.id??null,at:new Date().toISOString()});
    const result=this.programDirector?.run
      ? await this.programDirector.run({objective,context:missionContext,maxCycles})
      : await this.missionRunner.run({objective,context:missionContext,maxCycles});
    await this.observability?.append?.({type:"MISSION_FINISHED",status:result.status,progress:result.roadmap.progress,at:new Date().toISOString()});
    return result;
  }

  stop(){this.missionRunner.stop();}
}
