export class BenchmarkStore {
  constructor({store=null,maxRecords=10000}={}) { this.store=store; this.maxRecords=maxRecords; this.records=[]; this.loaded=false; }
  async load() {
    if(this.loaded) return this;
    const state=this.store?await this.store.read({records:[]}):{records:[]};
    this.records=Array.isArray(state?.records)?state.records.slice(-this.maxRecords):[];
    this.loaded=true; return this;
  }
  record(result) {
    if(!result) throw new Error("benchmark result is required");
    const record={id:`bench-${Date.now()}-${this.records.length+1}`,timestamp:new Date().toISOString(),...result};
    this.records.push(record);
    if(this.records.length>this.maxRecords) this.records=this.records.slice(-this.maxRecords);
    if(this.store) void this.store.write({records:this.records});
    return record;
  }
  list(filter={}) { return this.records.filter(r=>Object.entries(filter).every(([k,v])=>r[k]===v)); }
  best(metric="score") { return this.records.reduce((best,r)=>best===null||(r[metric]??-Infinity)>(best[metric]??-Infinity)?r:best,null); }
  trend(metric="score",limit=20) {
    return this.records.slice(-Math.max(1,limit)).map(r=>({timestamp:r.timestamp,value:Number(r[metric]??0),id:r.id}));
  }
}