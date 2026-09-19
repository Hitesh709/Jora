import {randomUUID} from "node:crypto";

export class AgentCapabilityRegistryV4 {
  constructor(){this.agents=new Map();}
  register({id,name=id,models=[],capabilities=[],cost=1,quality=1,latencyMs=1000}={}) {
    if(!id) throw new Error("agent id is required");
    const agent={id,name,models,capabilities,cost:Number(cost)||1,quality:Number(quality)||0,latencyMs:Number(latencyMs)||1000,available:true};
    this.agents.set(id,agent); return agent;
  }
  setAvailability(id,available){const a=this.agents.get(id);if(!a)return null;a.available=Boolean(available);return a;}
  list(){return [...this.agents.values()];}
}

export class AgentTaskRouterV4 {
  constructor({registry}={}){this.registry=registry;}
  score(agent,task) {
    const capability=task.capability?agent.capabilities.includes(task.capability)?1:0:.5;
    const model=task.model?agent.models.includes(task.model)?1:.5:.5;
    const quality=agent.quality;
    const cost=1/(1+agent.cost);
    const latency=1/(1+agent.latencyMs/1000);
    return .35*capability+.2*model+.25*quality+.1*cost+.1*latency;
  }
  route(task={}) {
    const candidates=this.registry.list().filter(a=>a.available).map(agent=>({agent,score:this.score(agent,task)})).sort((a,b)=>b.score-a.score);
    if(!candidates.length)return {status:"NO_AGENT_AVAILABLE",candidates:[]};
    return {status:"ROUTED",selected:candidates[0].agent,score:candidates[0].score,candidates};
  }
}

export class AgentSwarmExecutorV4 {
  constructor({gateway,router,concurrency=3}={}){this.gateway=gateway;this.router=router;this.concurrency=Math.max(1,Number(concurrency)||3);}
  async execute(task={}) {
    const route=this.router.route(task); if(route.status!=="ROUTED")return route;
    const agent=route.selected;
    const result=await this.gateway.complete({...task,model:task.model||agent.models[0]});
    return {status:"COMPLETED",taskId:task.id||"task_"+randomUUID(),agentId:agent.id,route,result};
  }
  async executeMany(tasks=[]) {
    const results=[]; let index=0;
    const worker=async()=>{while(true){const i=index++;if(i>=tasks.length)return;try{results[i]=await this.execute(tasks[i]);}catch(error){results[i]={status:"FAILED",error:error.message,task:tasks[i]};}}};
    await Promise.all(Array.from({length:Math.min(this.concurrency,tasks.length||1)},()=>worker()));
    return results;
  }
}

export class AgentConsensusEngineV4 {
  async review({outputs=[],required=2}={}) {
    const valid=outputs.filter(x=>x?.status==="COMPLETED");
    if(valid.length<required)return {status:"INSUFFICIENT_EVIDENCE",approved:false,outputs:valid};
    const models=[...new Set(valid.map(x=>x.result?.model||x.agentId))];
    return {status:"CONSENSUS_READY",approved:true,reviewers:models.length,outputs:valid};
  }
}

export class AgentBudgetControllerV4 {
  constructor({budget=100}={}){this.budget=Number(budget)||100;this.spent=0;}
  reserve(cost=0){const n=Math.max(0,Number(cost)||0);if(this.spent+n>this.budget)return {allowed:false,status:"BUDGET_EXCEEDED",remaining:this.budget-this.spent};this.spent+=n;return {allowed:true,status:"RESERVED",spent:this.spent,remaining:this.budget-this.spent};}
  status(){return {budget:this.budget,spent:this.spent,remaining:this.budget-this.spent};}
}

export class AgentSwarmControlPlaneV4 {
  constructor({gateway,agents=null,router=null,swarm=null,consensus=null,budget=null}={}) {
    this.version="4.20.0";
    this.agents=agents??new AgentCapabilityRegistryV4();
    this.router=router??new AgentTaskRouterV4({registry:this.agents});
    this.swarm=swarm??new AgentSwarmExecutorV4({gateway,router:this.router});
    this.consensus=consensus??new AgentConsensusEngineV4();
    this.budget=budget??new AgentBudgetControllerV4();
  }
  route(task){return this.router.route(task);}
  execute(task){return this.swarm.execute(task);}
  executeMany(tasks){return this.swarm.executeMany(tasks);}
  review(input){return this.consensus.review(input);}
  status(){return {version:this.version,capabilities:{agentRegistry:true,capabilityRouting:true,modelSelection:true,parallelExecution:true,agentConsensus:true,costBudgeting:true,agentSwarm:true}};}
}
