function clone(v){return structuredClone(v);}

export class AgentCapabilityRegistry {
  constructor({registry}={}){this.registry=registry;}
  discover(requirements=[]){return requirements.map(cap=>({capability:cap,agents:this.registry.discover(cap)}));}
  score(agent,{requirements=[],weights={capability:.4,reliability:.25,quality:.2,cost:.1,latency:.05}}={}){const caps=new Set(agent.capabilities??[]);const coverage=requirements.length?requirements.filter(x=>caps.has(x)).length/requirements.length:1;const m=agent.metrics??{};return Number((coverage*weights.capability+Number(m.reliability??0)*weights.reliability+Number(m.score??0)*weights.quality+(1-Math.min(1,Number(m.cost??0)))*weights.cost+(1-Math.min(1,Number(m.latency??0)))*weights.latency).toFixed(6));}
}

export class AgentRoutingEngine {
  constructor({registry,capabilityRegistry=null}={}){this.registry=registry;this.capabilityRegistry=capabilityRegistry??new AgentCapabilityRegistry({registry});}
  route({requiredCapabilities=[],exclude=[]}={}){const blocked=new Set(exclude);return this.registry.list({status:"ACTIVE"}).filter(a=>!blocked.has(a.id)).map(agent=>({...agent,routingScore:this.capabilityRegistry.score(agent,{requirements:requiredCapabilities})})).filter(a=>a.routingScore>0).sort((a,b)=>b.routingScore-a.routingScore);}
}

export class AgentNegotiationProtocol {
  negotiate({task,agents=[]}={}){const requirements=task?.requirements??[];return {id:`handoff-${Date.now()}`,task:clone(task),participants:agents.map(a=>a.id),requirements,assumptions:[],artifacts:[],handoffs:agents.slice(1).map((a,i)=>({from:agents[i]?.id??null,to:a.id,status:"PROPOSED"}))};}
  accept(protocol,agentId,artifacts=[]){const next=clone(protocol);const h=next.handoffs.find(x=>x.to===agentId&&x.status==="PROPOSED");if(h)h.status="ACCEPTED";next.artifacts.push(...artifacts);return next;}
}

export class ParallelSpecialistOrchestrator {
  constructor({runtime,concurrency=4}={}){this.runtime=runtime;this.concurrency=Math.max(1,concurrency);}
  async run({agents=[],input,sessionId=null}={}){const results=[];for(let i=0;i<agents.length;i+=this.concurrency){const batch=agents.slice(i,i+this.concurrency);const out=await Promise.all(batch.map(agent=>this.runtime.run(agent,input,{sessionId})));results.push(...out);}return {results,status:results.every(r=>r.status==="COMPLETED")?"COMPLETED":"PARTIAL"};}
}

export class SharedArtifactWorkspace {
  constructor(){this.artifacts=new Map();this.versions=new Map();}
  write({name,content,owner,expectedVersion=null}={}){const current=this.artifacts.get(name);if(current&&expectedVersion!==null&&current.version!==expectedVersion)throw new Error(`Artifact conflict: ${name}`);const version=(current?.version??0)+1;const artifact={name,content,owner,version,updatedAt:new Date().toISOString()};this.artifacts.set(name,artifact);return clone(artifact);}
  read(name){return this.artifacts.has(name)?clone(this.artifacts.get(name)):null;}
  list(){return [...this.artifacts.values()].map(clone);}
}

export class CollaborativeReviewGraph {
  constructor({registry}={}){this.registry=registry;}
  create({artifact,reviewerCapabilities=["quality","security"],challenger=true}={}){const reviewers=new AgentRoutingEngine({registry:this.registry}).route({requiredCapabilities:reviewerCapabilities});return {artifact,reviewers:reviewers.slice(0,3).map(x=>x.id),challenger:challenger?reviewers[0]?.id??null:null,decisions:[]};}
  decide(graph,{agentId,decision,reason=""}={}){const next=clone(graph);next.decisions.push({agentId,decision,reason,at:new Date().toISOString()});return next;}
  approved(graph){return graph.decisions.length>0&&graph.decisions.every(x=>x.decision==="APPROVE");}
}

export class AgentQualityGate {
  evaluate(output,{requiredEvidence=[],minScore=.8}={}){const evidence=output?.evidence??{};const missing=requiredEvidence.filter(x=>!evidence[x]);const score=Number(output?.score??(missing.length?0:1));return {passed:missing.length===0&&score>=minScore,score,missing};}
}

export class AgentLifecycleManager {
  constructor({registry,factory}={}){this.registry=registry;this.factory=factory;}
  async provision(request){return this.factory.buildSpecialist(request);}
  benchmark(id,metrics){return this.registry.updateMetrics(id,metrics);}
  retireUnderperformers({minimumScore=.8,minimumReliability=.8}={}){const retired=[];for(const a of this.registry.list({status:"ACTIVE"})){const e=this.registry.evaluate(a.id,{minimumScore,minimumReliability});if(!e.passed){retired.push(this.registry.retire(a.id,"failed quality/reliability threshold"));}}return retired;}
}

export class AgentTeamOptimizer {
  constructor({registry}={}){this.registry=registry;}
  optimize(team,{outcomes=[]}={}){const success=outcomes.filter(x=>x.status==="COMPLETED").length;const rate=outcomes.length?success/outcomes.length:0;return {...clone(team),optimization:{sampleSize:outcomes.length,successRate:rate,action:rate<.8?"review-team":"retain-team"},members:team.members};}
}
