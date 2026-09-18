export class OperationalHealthMonitor {
  constructor({metrics,observability=null,worker=null,queue=null,thresholds={},onAlert=null}={}) {
    if(!metrics) throw new Error("metrics is required");
    this.metrics=metrics; this.observability=observability; this.worker=worker; this.queue=queue;
    this.thresholds={failureRate:0.5,queueDepth:100,staleWorkerMs:120000,latencyMs:120000,...thresholds};
    this.onAlert=onAlert; this.lastAlerts=new Map();
  }
  async check({now=Date.now()}={}) {
    const snapshot=this.metrics.snapshot(); const alerts=[];
    const rate=snapshot.health.executionFailureRate;
    if(rate>=this.thresholds.failureRate && (snapshot.counters.jora_executions_total??0)>0)
      alerts.push(this._alert("HIGH_FAILURE_RATE",rate,"execution failure rate "+rate));
    const latency=snapshot.histograms.jora_execution_duration_ms;
    if(latency?.avg>=this.thresholds.latencyMs) alerts.push(this._alert("HIGH_LATENCY",latency.avg,"average execution latency "+latency.avg+"ms"));
    const state=this.worker?.status?await this.worker.status():null;
    const hb=state?.worker?.heartbeatAt?Date.parse(state.worker.heartbeatAt):null;
    if(state?.worker?.status==="RUNNING" && hb && now-hb>=this.thresholds.staleWorkerMs)
      alerts.push(this._alert("STALE_WORKER",now-hb,"worker heartbeat is stale"));
    if(this.queue?.list) {
      const jobs=await this.queue.list({limit:Math.min(500,this.thresholds.queueDepth+1),status:"QUEUED"});
      if(jobs.length>=this.thresholds.queueDepth) alerts.push(this._alert("QUEUE_BACKLOG",jobs.length,"queued jobs "+jobs.length));
    }
    for(const alert of alerts) {
      const previous=this.lastAlerts.get(alert.alertType);
      if(previous?.signature===alert.signature) continue;
      this.lastAlerts.set(alert.alertType,alert);
      await this.observability?.record(alert).catch?.(()=>{});
      await this.onAlert?.(alert);
    }
    return {healthy:alerts.length===0,alerts,snapshot};
  }
  _alert(alertType,value,message) {
    return {type:"OPERATIONAL_ALERT",severity:alertType==="STALE_WORKER"?"CRITICAL":"WARNING",alertType,value,message,signature:alertType+":"+String(value),timestamp:new Date().toISOString()};
  }
}
