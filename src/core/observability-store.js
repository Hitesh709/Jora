export class ObservabilityStore {
  constructor({store=null,maxEvents=1000}={}) {
    this.store=store;
    this.maxEvents=maxEvents;
    this.events=[];
  }

  _compact(event={}) {
    if(!event || typeof event!=="object") return {message:String(event??"")};
    const keep=["id","timestamp","type","status","phase","message","tenantId","executionId","taskId","agentId","durationMs","error","provider","resultCount"];
    const entry={};
    for(const key of keep) if(event[key]!==undefined) entry[key]=event[key];
    return entry;
  }

  async record(event) {
    const entry={
      id:"event_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),
      timestamp:new Date().toISOString(),
      ...this._compact(event)
    };
    if(this.store?.read && this.store?.write) {
      const db=await this.store.read({events:[]});
      db.events=[...(db.events??[]),entry].slice(-this.maxEvents);
      await this.store.write(db);
    } else {
      this.events=[...this.events,entry].slice(-this.maxEvents);
    }
    return entry;
  }

  async list({tenantId=null,limit=null}={}) {
    const events=this.store?.read ? ((await this.store.read({events:[]})).events??[]) : [...this.events];
    const filtered=tenantId ? events.filter(e=>e.tenantId===tenantId) : events;
    return limit ? filtered.slice(-Math.min(this.maxEvents,Math.max(1,Number(limit)||100))) : filtered;
  }
}
