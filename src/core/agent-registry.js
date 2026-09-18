export class AgentRegistry {
  constructor(){this.agents=new Map();this.capabilityIndex=new Map();}
  register(agent){if(!agent?.id)throw new Error("Agent id is required");if(this.agents.has(agent.id))throw new Error(`Agent already exists: ${agent.id}`);const record={id:agent.id,name:agent.name??agent.id,version:agent.version??1,capabilities:[...(agent.capabilities??[])],permissions:[...(agent.permissions??[])],specialization:agent.specialization??{role:"generalist"},status:"ACTIVE",metrics:agent.metrics??{},createdAt:new Date().toISOString()};this.agents.set(agent.id,record);for(const cap of record.capabilities){if(!this.capabilityIndex.has(cap))this.capabilityIndex.set(cap,new Set());this.capabilityIndex.get(cap).add(agent.id);}return this.get(agent.id);}
  get(id){const a=this.agents.get(id);return a?structuredClone(a):null;}
  list({status=null}={}){return [...this.agents.values()].filter(a=>!status||a.status===status).map(a=>structuredClone(a));}
  discover(capability,{status="ACTIVE"}={}){return this.list({status}).filter(a=>a.capabilities.includes(capability)).sort((a,b)=>(b.metrics?.score??0)-(a.metrics?.score??0));}
  updateMetrics(id,metrics={}){const a=this.agents.get(id);if(!a)throw new Error(`Unknown agent: ${id}`);a.metrics={...a.metrics,...metrics};return this.get(id);}
  retire(id,reason="retired"){const a=this.agents.get(id);if(!a)throw new Error(`Unknown agent: ${id}`);a.status="RETIRED";a.retiredAt=new Date().toISOString();a.retirementReason=reason;return this.get(id);}
  activate(id){const a=this.agents.get(id);if(!a)throw new Error(`Unknown agent: ${id}`);a.status="ACTIVE";delete a.retiredAt;delete a.retirementReason;return this.get(id);}
}