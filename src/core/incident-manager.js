import crypto from "node:crypto";

export class IncidentManager {
  constructor({observability=null,maxIncidents=500}={}) {
    this.observability=observability; this.maxIncidents=maxIncidents; this.incidents=new Map();
  }
  async open(alert) {
    const existing=[...this.incidents.values()].find(i=>i.alertType===alert.alertType && i.status!=="RESOLVED");
    if(existing) { existing.occurrences++; existing.lastSeenAt=new Date().toISOString(); await this.observability?.record({type:"INCIDENT_UPDATED",incidentId:existing.id,occurrences:existing.occurrences}); return existing; }
    const incident={id:"inc_"+crypto.randomUUID(),alertType:alert.alertType,severity:alert.severity||"WARNING",status:"OPEN",message:alert.message,occurrences:1,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),recovery:null};
    this.incidents.set(incident.id,incident); this._trim();
    await this.observability?.record({type:"INCIDENT_OPENED",incidentId:incident.id,...incident});
    return incident;
  }
  async startRecovery(id,recovery) { const i=this.incidents.get(id); if(!i) return null; i.status="RECOVERING"; i.recovery=recovery; await this.observability?.record({type:"INCIDENT_RECOVERY",incidentId:id,recovery}); return i; }
  async resolve(id,result=null) { const i=this.incidents.get(id); if(!i) return null; i.status="RESOLVED"; i.resolvedAt=new Date().toISOString(); i.resolution=result; await this.observability?.record({type:"INCIDENT_RESOLVED",incidentId:id,result}); return i; }
  async failRecovery(id,error) { const i=this.incidents.get(id); if(!i) return null; i.status="ESCALATED"; i.escalation=error; await this.observability?.record({type:"INCIDENT_ESCALATED",incidentId:id,error}); return i; }
  list({status,limit=100}={}) { let a=[...this.incidents.values()]; if(status)a=a.filter(i=>i.status===status); return a.slice(-Math.min(500,Math.max(1,Number(limit)||100))); }
  get(id) { return this.incidents.get(id)||null; }
  _trim(){ while(this.incidents.size>this.maxIncidents)this.incidents.delete(this.incidents.keys().next().value); }
}
