import crypto from "node:crypto";

export class IncidentManager {
  constructor({observability=null,maxIncidents=500}={}) {
    this.observability=observability; this.maxIncidents=maxIncidents; this.incidents=new Map(); this.loaded=false;
  }
  async initialize() {
    if(this.loaded) return;
    const events=this.observability?.list ? await this.observability.list({limit:this.maxIncidents}) : [];
    for(const e of events){
      if(!e.incidentId) continue;
      const existing=this.incidents.get(e.incidentId);
      if(e.type==="INCIDENT_OPENED") this.incidents.set(e.incidentId,{...e,id:e.incidentId});
      else if(existing) {
        if(e.type==="INCIDENT_UPDATED"){existing.occurrences=e.occurrences??existing.occurrences;existing.lastSeenAt=e.lastSeenAt??existing.lastSeenAt;}
        if(e.type==="INCIDENT_RECOVERY"){existing.status="RECOVERING";existing.recovery=e.recovery;}
        if(e.type==="INCIDENT_RESOLVED"){existing.status="RESOLVED";existing.resolvedAt=e.at??existing.resolvedAt;existing.resolution=e.result??null;}
        if(e.type==="INCIDENT_ESCALATED"){existing.status="ESCALATED";existing.escalation=e.error??null;}
      }
    }
    this.loaded=true;
  }
  async open(alert) { await this.initialize();
    const existing=[...this.incidents.values()].find(i=>i.alertType===alert.alertType && i.status!=="RESOLVED");
    if(existing) { existing.occurrences++; existing.lastSeenAt=new Date().toISOString(); await this.observability?.record({type:"INCIDENT_UPDATED",incidentId:existing.id,occurrences:existing.occurrences}); return existing; }
    const incident={id:"inc_"+crypto.randomUUID(),alertType:alert.alertType,severity:alert.severity||"WARNING",status:"OPEN",message:alert.message,occurrences:1,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),recovery:null};
    this.incidents.set(incident.id,incident); this._trim();
    await this.observability?.record({type:"INCIDENT_OPENED",incidentId:incident.id,...incident});
    return incident;
  }
  async startRecovery(id,recovery) { await this.initialize(); const i=this.incidents.get(id); if(!i) return null; i.status="RECOVERING"; i.recovery=recovery; await this.observability?.record({type:"INCIDENT_RECOVERY",incidentId:id,recovery}); return i; }
  async resolve(id,result=null) { await this.initialize(); const i=this.incidents.get(id); if(!i) return null; i.status="RESOLVED"; i.resolvedAt=new Date().toISOString(); i.resolution=result; await this.observability?.record({type:"INCIDENT_RESOLVED",incidentId:id,result}); return i; }
  async failRecovery(id,error) { await this.initialize(); const i=this.incidents.get(id); if(!i) return null; i.status="ESCALATED"; i.escalation=error; await this.observability?.record({type:"INCIDENT_ESCALATED",incidentId:id,error}); return i; }
  list({status,limit=100}={}) { let a=[...this.incidents.values()]; if(status)a=a.filter(i=>i.status===status); return a.slice(-Math.min(500,Math.max(1,Number(limit)||100))); }
  get(id) { return this.incidents.get(id)||null; }
  _trim(){ while(this.incidents.size>this.maxIncidents)this.incidents.delete(this.incidents.keys().next().value); }
}
