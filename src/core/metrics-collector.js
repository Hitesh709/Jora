export class MetricsCollector {
  constructor({observability=null}={}) {
    this.observability=observability;
    this.counters=new Map();
    this.histograms=new Map();
    this.startedAt=Date.now();
  }
  increment(name,value=1,labels={}) {
    const key=this._key(name,labels);
    this.counters.set(key,(this.counters.get(key)||0)+value);
  }
  observe(name,value,labels={}) {
    if(!Number.isFinite(value)) return;
    const key=this._key(name,labels);
    const h=this.histograms.get(key)||{count:0,sum:0,min:null,max:null};
    h.count++;h.sum+=value;h.min=h.min===null?value:Math.min(h.min,value);h.max=h.max===null?value:Math.max(h.max,value);
    this.histograms.set(key,h);
  }
  async recordExecution({status,durationMs}={}) {
    this.increment("jora_executions_total",1,{status:status||"UNKNOWN"});
    this.observe("jora_execution_duration_ms",durationMs);
    await this.observability?.record({type:"EXECUTION_METRIC",status,durationMs}).catch?.(()=>{});
  }
  snapshot() {
    const counters={}; for(const [k,v] of this.counters)counters[k]=v;
    const histograms={}; for(const [k,v] of this.histograms)histograms[k]={...v,avg:v.count?v.sum/v.count:0};
    return {uptimeMs:Date.now()-this.startedAt,counters,histograms,timestamp:new Date().toISOString()};
  }
  _key(name,labels) {
    const entries=Object.entries(labels||{}).sort(([a],[b])=>a.localeCompare(b));
    return entries.length?name+"{"+entries.map(([k,v])=>k+"="+JSON.stringify(v)).join(",")+"}":name;
  }
}
