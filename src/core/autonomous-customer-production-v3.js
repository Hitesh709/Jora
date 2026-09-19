import {randomUUID} from "node:crypto";

export class CustomerMissionOrchestrator {
  constructor({missionManager,executionPlatform,workerPool=null}={}) { Object.assign(this,{missionManager,executionPlatform,workerPool}); }
  async execute(mission,{context={}}={}) {
    this.missionManager.transition(mission.id,"RUNNING");
    try {
      const result=await this.executionPlatform?.control?.({objective:mission.objective,context:{...context,tenantId:mission.tenantId,projectId:mission.projectId,missionId:mission.id}});
      const finalStatus=result?.status==="BLOCKED"?"BLOCKED":"COMPLETED";
      return this.missionManager.transition(mission.id,finalStatus,result);
    } catch(error) {
      return this.missionManager.transition(mission.id,"FAILED",{error:error.message});
    }
  }
}

export class CustomerLifecycleEngine {
  constructor({missions,orchestrator}={}) { Object.assign(this,{missions,orchestrator}); }
  async run({missionId,context={}}={}) {
    const mission=this.missions.get(missionId);
    if(!mission) return {accepted:false,status:"MISSION_NOT_FOUND"};
    if(!["QUEUED","RETRY"].includes(mission.status)) return {accepted:false,status:"MISSION_NOT_EXECUTABLE",mission};
    return {accepted:true,status:"MISSION_EXECUTED",mission:await this.orchestrator.execute(mission,{context})};
  }
}

export class CustomerPolicyGate {
  evaluate({tenantId,projectId,objective,risk="medium",approved=false}={}) {
    const normalized=String(risk).toLowerCase();
    if(!tenantId||!projectId||!objective) return {allowed:false,status:"INVALID_MISSION"};
    if(normalized==="high"&&!approved) return {allowed:false,status:"CUSTOMER_APPROVAL_REQUIRED"};
    return {allowed:true,status:"CUSTOMER_POLICY_APPROVED"};
  }
}

export class CustomerArtifactLineage {
  constructor(){this.records=[];}
  record({tenantId,projectId,missionId,artifact,result=null}={}) {
    const record={id:"customer_artifact_"+randomUUID(),tenantId,projectId,missionId,artifact,result,at:new Date().toISOString()};
    this.records.push(record); return record;
  }
  list({tenantId,projectId}={}) { return this.records.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!projectId||x.projectId===projectId)); }
}

export class CustomerProductionPipeline {
  constructor({policy,lifecycle,lineage}={}) { Object.assign(this,{policy,lifecycle,lineage}); }
  async submit(input={}) {
    const gate=this.policy.evaluate(input);
    if(!gate.allowed) return gate;
    const result=await this.lifecycle.run({missionId:input.missionId,context:input.context});
    if(result.mission) this.lineage.record({tenantId:input.tenantId,projectId:input.projectId,missionId:input.missionId,artifact:"mission-result",result});
    return {...result,policy:gate};
  }
}

export class AutonomousCustomerProductionPlatform {
  constructor({customerControl,executionPlatform}={}) {
    this.version="3.00.0";
    this.customer=customerControl;
    this.execution=executionPlatform;
    this.policy=new CustomerPolicyGate();
    this.orchestrator=new CustomerMissionOrchestrator({missionManager:customerControl.missions,executionPlatform});
    this.lifecycle=new CustomerLifecycleEngine({missions:customerControl.missions,orchestrator:this.orchestrator});
    this.lineage=new CustomerArtifactLineage();
    this.pipeline=new CustomerProductionPipeline({policy:this.policy,lifecycle:this.lifecycle,lineage:this.lineage});
  }
  status() {
    return {version:this.version,capabilities:{customerToMission:true,missionExecution:true,policyGates:true,artifactLineage:true,productionPipeline:true,executionPlatform:Boolean(this.execution)}};
  }
  async submit(input={}) {
    const accepted=await this.customer.router.submit(input);
    if(!accepted.accepted) return accepted;
    return this.pipeline.submit({...input,missionId:accepted.mission.id});
  }
}
