import {randomUUID} from "node:crypto";

export class MissionLedgerV4 {
  constructor({maxRecords=5000}={}) { this.maxRecords=maxRecords; this.records=[]; }
  append(event={}) {
    const record={id:"mission_event_"+randomUUID(),at:new Date().toISOString(),...event};
    this.records.push(record);
    if(this.records.length>this.maxRecords)this.records=this.records.slice(-this.maxRecords);
    return record;
  }
  list({missionId,limit=100}={}) {
    const rows=missionId?this.records.filter(x=>x.missionId===missionId):this.records;
    return rows.slice(-Math.min(500,Math.max(1,Number(limit)||100))).reverse();
  }
}

export class MissionStateStoreV4 {
  constructor({maxMissions=2000}={}) { this.maxMissions=maxMissions; this.missions=new Map(); }
  upsert(mission) { this.missions.set(mission.id,mission); if(this.missions.size>this.maxMissions){const first=this.missions.keys().next().value;this.missions.delete(first);} return mission; }
  get(id){return this.missions.get(id)||null;}
  list({status,limit=100}={}) { let rows=[...this.missions.values()]; if(status)rows=rows.filter(x=>x.status===status); return rows.slice(-Math.min(500,Math.max(1,Number(limit)||100))).reverse(); }
}

export class MissionPlannerV4 {
  plan({mission,steps=[],team=null,agents=[],models=[]}={}) {
    const text=String(mission||"").trim();
    if(!text) throw new Error("mission is required");
    const normalized=Array.isArray(steps)&&steps.length
      ? steps.map((x,i)=>({...x,id:x.id||"mission_step_"+i,dependencies:x.dependencies||[]}))
      : [
        {id:"mission_step_0",title:"Analyze mission",capability:"analysis",dependencies:[]},
        {id:"mission_step_1",title:"Execute solution",capability:"coding",dependencies:["mission_step_0"]},
        {id:"mission_step_2",title:"Validate outcome",capability:"testing",dependencies:["mission_step_1"]}
      ];
    return {mission:text,steps:normalized,teamId:team?.id||null,agentCount:agents.length,models:[...new Set(models)],createdAt:new Date().toISOString()};
  }
}

export class TeamComposerV4 {
  compose({teams=[],missionType,preferredTeamId=null}={}) {
    if(preferredTeamId){const preferred=teams.find(t=>t.id===preferredTeamId&&t.status==="ACTIVE");if(preferred)return {status:"TEAM_SELECTED",team:preferred,reason:"PREFERRED_TEAM"};}
    const active=teams.filter(t=>t.status==="ACTIVE");
    const compatible=active.filter(t=>!missionType||!t.missionTypes?.length||t.missionTypes.includes(missionType));
    const pool=compatible.length?compatible:active;
    if(!pool.length)return {status:"NO_TEAM_AVAILABLE",team:null};
    const team=[...pool].sort((a,b)=>(b.maxConcurrency||0)-(a.maxConcurrency||0))[0];
    return {status:"TEAM_SELECTED",team,reason:"CAPABILITY_MATCH"};
  }
}

export class DynamicAllocationEngineV4 {
  allocate({steps=[],team={},availableAgents=[],availableModels=[],budget=Infinity}={}) {
    let remaining=Math.max(0,Number(budget)||0);
    return steps.map((step,index)=>{
      const candidates=availableAgents.filter(a=>a.status!=="DISABLED" && (!step.capability || (a.capabilities||[]).includes(step.capability)));
      const agent=(candidates[index%candidates.length]||availableAgents[index%Math.max(1,availableAgents.length)]||team.specialists?.[index%Math.max(1,team.specialists?.length||1)]||null);
      const model=availableModels[index%Math.max(1,availableModels.length)]||agent?.model||null;
      const estimatedCost=Number(step.estimatedCost||0);
      const admitted=estimatedCost<=remaining || remaining===0;
      if(remaining!==Infinity)remaining=Math.max(0,remaining-estimatedCost);
      return {...step,agentId:typeof agent==="object"?agent.id:agent,model,allocationStatus:admitted?"ALLOCATED":"BUDGET_BLOCKED"};
    });
  }
}

export class DependencySchedulerV4 {
  schedule({steps=[]}={}) {
    const pending=new Map(steps.map(x=>[x.id,x]));
    const ordered=[];
    while(pending.size){
      const ready=[...pending.values()].filter(x=>(x.dependencies||[]).every(d=>ordered.some(y=>y.id===d)));
      if(!ready.length) return {status:"DEPENDENCY_BLOCKED",ordered,remaining:[...pending.values()]};
      ready.forEach(x=>{ordered.push(x);pending.delete(x.id);});
    }
    return {status:"SCHEDULE_READY",ordered};
  }
}

export class MissionRetryPolicyV4 {
  constructor({maxRetries=2}={}){this.maxRetries=maxRetries;}
  decide({attempts=0,status,error}={}) {
    const retryable=status==="FAILED"||status==="TIMEOUT"||status==="BUDGET_BLOCKED";
    return {retry:retryable&&Number(attempts)<this.maxRetries,escalate:Number(attempts)>=this.maxRetries,reason:error||status||"unknown"};
  }
}

export class MissionReadinessGateV4 {
  evaluate({mission,plan,team,scheduled=true,security=true,approval=true}={}) {
    const checks={mission:Boolean(mission),plan:Boolean(plan?.steps?.length),team:Boolean(team),scheduled,security,approval};
    const ready=Object.values(checks).every(Boolean);
    return {ready,status:ready?"READY":"NOT_READY",checks};
  }
}

export class MissionDirectorV4 {
  constructor({teams,swarm,ledger,state,planner,composer,allocator,scheduler,retry,readiness}={}) {
    this.teams=teams;this.swarm=swarm;this.ledger=ledger;this.state=state;this.planner=planner;this.composer=composer;this.allocator=allocator;this.scheduler=scheduler;this.retry=retry;this.readiness=readiness;
  }
  async run(input={}) {
    const id=input.id||"mission_"+randomUUID();
    const started={id,status:"PLANNING",mission:input.mission,createdAt:new Date().toISOString(),attempts:0};
    this.state.upsert(started);this.ledger.append({missionId:id,event:"MISSION_STARTED",mission:input.mission});
    const teamResult=this.composer.compose({teams:this.teams.list(),missionType:input.type,preferredTeamId:input.teamId});
    if(teamResult.status!=="TEAM_SELECTED") { started.status="NO_TEAM_AVAILABLE";this.state.upsert(started);this.ledger.append({missionId:id,event:started.status});return started; }
    const plan=this.planner.plan({mission:input.mission,steps:input.steps,team:teamResult.team,agents:input.agents||[],models:input.models||[]});
    const allocated=this.allocator.allocate({steps:plan.steps,team:teamResult.team,availableAgents:input.agents||[],availableModels:input.models||[],budget:input.budget??Infinity});
    const schedule=this.scheduler.schedule({steps:allocated});
    const gate=this.readiness.evaluate({mission:input.mission,plan:{...plan,steps:allocated},team:teamResult.team,scheduled:schedule.status==="SCHEDULE_READY",security:input.security!==false,approval:input.approval!==false});
    started.plan=plan;started.team=teamResult.team;started.schedule=schedule;started.readiness=gate;
    if(!gate.ready){started.status="NOT_READY";this.state.upsert(started);this.ledger.append({missionId:id,event:"MISSION_NOT_READY",checks:gate.checks});return started;}
    started.status="EXECUTING";this.state.upsert(started);this.ledger.append({missionId:id,event:"MISSION_EXECUTING"});
    const results=[]; const maxAttempts=Math.max(1,this.retry.maxRetries+1);
    for(const step of schedule.ordered){
      let result=null;
      for(let attempt=0;attempt<maxAttempts;attempt++){
        started.attempts++; this.state.upsert(started);
        result=await this.swarm.execute({task:step,model:step.model});
        this.ledger.append({missionId:id,event:"STEP_RESULT",stepId:step.id,attempt:attempt+1,status:result?.status});
        const decision=this.retry.decide({attempts:attempt+1,status:result?.status,error:result?.error});
        if(result?.status==="COMPLETED"||!decision.retry) break;
      }
      results.push({stepId:step.id,result});
      if(result?.status!=="COMPLETED"){started.status="FAILED";started.results=results;this.state.upsert(started);this.ledger.append({missionId:id,event:"MISSION_FAILED",stepId:step.id});return started;}
    }
    started.status="COMPLETED";started.results=results;started.completedAt=new Date().toISOString();this.state.upsert(started);this.ledger.append({missionId:id,event:"MISSION_COMPLETED"});
    return started;
  }
}

export class AutonomousMissionDirectorV4 {
  constructor({teamControlPlane,swarm,missionState=null,ledger=null,maxRetries=2}={}) {
    this.version="4.60.0";
    this.teamControlPlane=teamControlPlane;
    this.ledger=ledger||new MissionLedgerV4();
    this.state=missionState||new MissionStateStoreV4();
    this.planner=new MissionPlannerV4();
    this.composer=new TeamComposerV4();
    this.allocator=new DynamicAllocationEngineV4();
    this.scheduler=new DependencySchedulerV4();
    this.retry=new MissionRetryPolicyV4({maxRetries});
    this.readiness=new MissionReadinessGateV4();
    this.director=new MissionDirectorV4({teams:teamControlPlane.registry,swarm,ledger:this.ledger,state:this.state,planner:this.planner,composer:this.composer,allocator:this.allocator,scheduler:this.scheduler,retry:this.retry,readiness:this.readiness});
  }
  async run(input){return this.director.run(input);}
  status(){return {version:this.version,capabilities:{missionPlanning:true,teamComposition:true,dynamicAgentAllocation:true,modelAllocation:true,dependencyScheduling:true,retryEscalation:true,readinessGate:true,missionLedger:true,missionState:true,autonomousMissionExecution:true}};}
}
