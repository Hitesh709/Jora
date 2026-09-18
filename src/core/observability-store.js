export class ObservabilityStore {
  constructor({store=null,maxEvents=1000}={}) {
    this.store=store;
    this.maxEvents=maxEvents;
    this.events=[];
  }

  async record(event) {
    const entry={id:"event_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),timestamp:new Date().toISOString(),...event};
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
