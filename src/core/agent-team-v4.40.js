import {randomUUID} from "node:crypto";

export class AgentTeamRegistryV4 {
  constructor(){this.teams=new Map();}
  create({id="team_"+randomUUID(),name=id,specialists=[],missionTypes=[],maxConcurrency=3}={}) {
    const team={id,name,specialists,missionTypes,maxConcurrency:Number(maxConcurrency)||3,status:"ACTIVE",createdAt:new Date().toISOString()};
    this.teams.set(id,team); return team;
  }
  get(id){return this.teams.get(id)||null;}
  list(){return [...this.teams.values()];}
}

export class AgentTaskDecomposerV4 {
  decompose({mission,steps=[]}={}) {
    if(Array.isArray(steps)&&steps.length)return steps.map((x,i)=>({...x,id:x.id||"subtask_"+i,dependencies:x.dependencies||[]}));
    const text=String(mission||"").trim();
    if(!text)return [];
    return [{id:"subtask_0",title:"Understand mission",description:text,capability:"analysis",dependencies:[]},
      {id:"subtask_1",title:"Implement solution",description:text,capability:"coding",dependencies:["subtask_0"]},
      {id:"subtask_2",title:"Verify solution",description:text,capability:"testing",dependencies:["subtask_1"]}];
  }
}

export class AgentNegotiationEngineV4 {
  negotiate({teams=[],task={}}={}) {
    const candidates=teams.filter(t=>t.status==="ACTIVE").map(team=>({team,fit:team.missionTypes.length===0||!task.type||team.missionTypes.includes(task.type)?1:0.5}));
    candidates.sort((a,b)=>b.fit-a.fit);
    return candidates[0]?{status:"TEAM_SELECTED",team:candidates[0].team,fit:candidates[0].fit,candidates}:{status:"NO_TEAM_AVAILABLE",candidates:[]};
  }
}

export class SharedAgentMemoryV4 {
  constructor({maxRecords=5000}={}){this.maxRecords=maxRecords;this.records=[];}
  add(record={}){this.records.push({id:"memory_"+randomUUID(),at:new Date().toISOString(),...record});if(this.records.length>this.maxRecords)this.records=this.records.slice(-this.maxRecords);return this.records.at(-1);}
  search({query="",limit=20}={}){const q=String(query).toLowerCase();return this.records.filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q)).slice(-limit).reverse();}
}

export class CollaborativeReviewEngineV4 {
  review({artifacts=[],reviewers=[]}={}) {
    const findings=reviewers.flatMap(r=>Array.isArray(r.findings)?r.findings:[]);
    const conflicts=findings.filter((x,i,a)=>a.findIndex(y=>y.path===x.path&&y.type===x.type)!==i);
    return {status:conflicts.length?"REVIEW_CONFLICT":"REVIEW_COMPLETE",approved:findings.every(x=>x.severity!=="critical"),findings,conflicts,artifacts};
  }
}

export class ConflictResolutionEngineV4 {
  resolve({conflicts=[],strategy="majority"}={}) {
    return {status:"RESOLVED",strategy,resolutions:conflicts.map((c,i)=>({id:c.id||String(i),decision:strategy==="majority"?"ACCEPT_MAJORITY":"ESCALATE"}))};
  }
}

export class AgentTeamOrchestratorV4 {
  constructor({registry,decomposer,negotiation,swarm,memory,review,resolution}={}) {
    this.registry=registry;this.decomposer=decomposer;this.negotiation=negotiation;this.swarm=swarm;this.memory=memory;this.review=review;this.resolution=resolution;
  }
  async execute({mission,steps=[],type,reviewers=[]}={}) {
    const selected=this.negotiation.negotiate({teams:this.registry.list(),task:{type}});
    if(selected.status!=="TEAM_SELECTED")return selected;
    const tasks=this.decomposer.decompose({mission,steps});
    const results=await this.swarm.executeMany(tasks);
    results.forEach(result=>this.memory.add({mission,teamId:selected.team.id,result}));
    const review=this.review.review({artifacts:results,reviewers});
    const resolution=review.conflicts.length?this.resolution.resolve({conflicts:review.conflicts}):null;
    return {status:review.approved?"TEAM_COMPLETED":"TEAM_REVIEW_REQUIRED",team:selected.team,tasks,results,review,resolution};
  }
}

export class AgentTeamControlPlaneV4 {
  constructor({swarm}={}) {
    this.version="4.40.0";
    this.registry=new AgentTeamRegistryV4();
    this.decomposer=new AgentTaskDecomposerV4();
    this.negotiation=new AgentNegotiationEngineV4();
    this.memory=new SharedAgentMemoryV4();
    this.review=new CollaborativeReviewEngineV4();
    this.resolution=new ConflictResolutionEngineV4();
    this.orchestrator=new AgentTeamOrchestratorV4({registry:this.registry,decomposer:this.decomposer,negotiation:this.negotiation,swarm,memory:this.memory,review:this.review,resolution:this.resolution});
  }
  createTeam(input){return this.registry.create(input);}
  async execute(input){return this.orchestrator.execute(input);}
  status(){return {version:this.version,capabilities:{persistentTeams:true,taskDecomposition:true,teamNegotiation:true,sharedMemory:true,collaborativeReview:true,conflictResolution:true,teamOrchestration:true}};}
}
