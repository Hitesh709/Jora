import {randomUUID} from "node:crypto";

export class CustomerMissionOrchestrator {
  constructor({missionManager,executionPlatform,productUnderstanding=null,architecturePlanner=null,taskDAGGenerator=null}={}) {
    Object.assign(this,{missionManager,executionPlatform,productUnderstanding,architecturePlanner,taskDAGGenerator});
  }
  async execute(mission,{context={}}={}) {
    this.missionManager.transition(mission.id,"RUNNING");
    try {
      const baseContext={...context,tenantId:mission.tenantId,projectId:mission.projectId,missionId:mission.id};
      const gate=await this.executionPlatform?.control?.({
        operation:"customer.mission",risk:context.risk||"medium",evidence:context.evidence||[],
        context:baseContext,phase:"customer"
      });
      if(gate && gate.ready===false) return this.missionManager.transition(mission.id,"BLOCKED",gate);

      const specification=this.productUnderstanding
        ? await this.productUnderstanding.understand({input:mission.objective,context:baseContext})
        : null;
      const architecture=this.architecturePlanner
        ? await this.architecturePlanner.plan({specification,input:mission.objective,context:baseContext})
        : null;
      const dag=this.taskDAGGenerator
        ? await this.taskDAGGenerator.generate({specification,architecture:architecture?.plan??architecture})
        : null;

      const planning={specification,architecture:architecture?.plan??architecture,dag:dag?.dag??dag};
      this.missionManager.transition(mission.id,"PLANNED",planning);

      if(context.delivery && typeof this.executionPlatform?.externalEndToEnd==="function") {
        const deliveryInput={
          ...context.delivery,
          payload:{
            ...(context.delivery.payload||{}),
            tenantId:mission.tenantId,projectId:mission.projectId,missionId:mission.id,
            specification,architecture:planning.architecture,dag:planning.dag
          }
        };
        const delivery=await this.executionPlatform.externalEndToEnd(deliveryInput);
        const finalStatus=delivery?.status==="DELIVERED"?"DELIVERED":
          delivery?.status==="ROLLED_BACK"?"ROLLED_BACK":"FAILED";
        return this.missionManager.transition(mission.id,finalStatus,{gate,planning,delivery});
      }
      return this.missionManager.transition(mission.id,"READY_FOR_EXECUTION",{gate,planning});
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
    if(result.mission) this.lineage.record({tenantId:input.tenantId,projectId:input.projectId,missionId:input.missionId,artifact:"customer-production-pipeline",result});
    return {...result,policy:gate};
  }
}

export class AutonomousCustomerProductionPlatform {
  constructor({customerControl,executionPlatform,productUnderstanding=null,architecturePlanner=null,taskDAGGenerator=null}={}) {
    this.version="3.10.0";
    this.customer=customerControl;
    this.execution=executionPlatform;
    this.productUnderstanding=productUnderstanding;
    this.architecturePlanner=architecturePlanner;
    this.taskDAGGenerator=taskDAGGenerator;
    this.policy=new CustomerPolicyGate();
    this.orchestrator=new CustomerMissionOrchestrator({
      missionManager:customerControl.missions,executionPlatform,
      productUnderstanding,architecturePlanner,taskDAGGenerator
    });
    this.lifecycle=new CustomerLifecycleEngine({missions:customerControl.missions,orchestrator:this.orchestrator});
    this.lineage=new CustomerArtifactLineage();
    this.pipeline=new CustomerProductionPipeline({policy:this.policy,lifecycle:this.lifecycle,lineage:this.lineage});
  }
  status() {
    return {version:this.version,capabilities:{
      customerToMission:true,missionExecution:true,policyGates:true,artifactLineage:true,
      productUnderstanding:Boolean(this.productUnderstanding),architecturePlanning:Boolean(this.architecturePlanner),
      taskDAGGeneration:Boolean(this.taskDAGGenerator),githubDelivery:Boolean(this.execution?.externalExecution),
      realTests:Boolean(this.execution?.testRunner),deployment:Boolean(Object.keys(this.execution?.deploymentClients||{}).length),
      healthVerification:Boolean(this.execution?.healthVerifier),rollback:Boolean(this.execution?.recovery),
      productionPipeline:true
    }};
  }
  async submit(input={}) {
    const accepted=await this.customer.router.submit(input);
    if(!accepted.accepted) return accepted;
    return this.pipeline.submit({...input,missionId:accepted.mission.id});
  }
}
