export class MetricsCollector {
  constructor({observability=null}={}) {
    this.observability=observability;
    this.counters=new Map();
    this.histograms=new Map();
    this.startedAt=Date.now();
    this.gauges=new Map();
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
  setGauge(name,value,labels={}) { if(Number.isFinite(value)) this.gauges.set(this._key(name,labels),value); }
  getGauge(name,labels={}) { return this.gauges.get(this._key(name,labels)); }
  async recordExecution({status,durationMs}={}) {
    const normalized=status||"UNKNOWN";
    this.increment("jora_executions_total",1,{status:normalized});
    if(normalized==="FAILED") this.increment("jora_failures_total");
    if(normalized==="PROMOTED" || normalized==="DEPLOYED") this.increment("jora_successful_releases_total");
    this.observe("jora_execution_duration_ms",durationMs);
    await this.observability?.record({type:"EXECUTION_METRIC",status,durationMs}).catch?.(()=>{});
  }
  snapshot() {
    const counters={}; for(const [k,v] of this.counters)counters[k]=v;
    const histograms={}; for(const [k,v] of this.histograms)histograms[k]={...v,avg:v.count?v.sum/v.count:0};
    const gauges={}; for(const [k,v] of this.gauges)gauges[k]=v;
    const total=[...this.counters].filter(([k])=>k.startsWith("jora_executions_total")).reduce((n,[,v])=>n+v,0);
    const failures=this.counters.get("jora_failures_total")||0;
    return {uptimeMs:Date.now()-this.startedAt,counters,histograms,gauges,health:{executionFailureRate:total?failures/total:0},timestamp:new Date().toISOString()};
  }
  _key(name,labels) {
    const entries=Object.entries(labels||{}).sort(([a],[b])=>a.localeCompare(b));
    return entries.length?name+"{"+entries.map(([k,v])=>k+"="+JSON.stringify(v)).join(",")+"}":name;
  }
}
