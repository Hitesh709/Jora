export class DurableWorker {
  constructor({
    cycle,
    store,
    intervalMs=60_000,
    heartbeatMs=10_000,
    staleAfterMs=120_000,
    maxCycles=Infinity,
    workerId="jora-worker",
    leaseStore=null
  }={}) {
    if(!cycle) throw new Error("cycle is required");
    if(!store?.read || !store?.write) throw new Error("store with read/write is required");
    this.cycle=cycle;
    this.store=store;
    this.intervalMs=intervalMs;
    this.heartbeatMs=heartbeatMs;
    this.staleAfterMs=staleAfterMs;
    this.maxCycles=maxCycles;
    this.workerId=workerId;
    this.leaseStore=leaseStore;
    this.leaseToken=null;
    this.running=false;
    this.stopRequested=false;
    this.jobId=null;
    this.heartbeatTimer=null;
  }

  async _read(){
    return this.store.read({
      version:1,
      worker:{id:this.workerId,status:"IDLE",heartbeatAt:null},
      job:null,
      history:[]
    });
  }

  async _write(state){
    return this.store.write(state);
  }

  _isFresh(heartbeatAt){
    if(!heartbeatAt) return false;
    return Date.now()-Date.parse(heartbeatAt) < this.staleAfterMs;
  }

  async _heartbeat(){
    if(!this.running || !this.jobId) return;
    if(this.leaseStore && this.leaseToken) {
      const fresh=await this.leaseStore.heartbeat({owner:this.workerId,token:this.leaseToken});
      if(!fresh) {
        this.stopRequested=true;
        return;
      }
    }
    const state=await this._read();
    if(state.worker?.id!==this.workerId || state.job?.id!==this.jobId) return;
    const now=new Date().toISOString();
    state.worker={...(state.worker??{}),id:this.workerId,status:"RUNNING",heartbeatAt:now,pid:process.pid};
    state.job={...(state.job??{}),heartbeatAt:now,updatedAt:now};
    await this._write(state);
  }

  _startHeartbeat(){
    this._stopHeartbeat();
    this.heartbeatTimer=setInterval(()=>{
      void this._heartbeat().catch(()=>{});
    },Math.max(250,this.heartbeatMs));
    this.heartbeatTimer.unref?.();
  }

  _stopHeartbeat(){
    if(this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer=null;
  }

  async _acquire({command}){
    if(this.leaseStore) {
      const lease=await this.leaseStore.acquire({owner:this.workerId,metadata:{command,pid:process.pid}});
      if(!lease) throw new Error("worker lease is already active");
      this.leaseToken=lease.token;
    }
    const state=await this._read();
    const active=state.worker?.status==="RUNNING" && this._isFresh(state.worker?.heartbeatAt);
    if(active) throw new Error("worker lease is already active");

    const recovered=state.job?.status==="RUNNING";
    const now=new Date().toISOString();
    const jobId=state.job?.id && recovered
      ? state.job.id
      : "job_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const attempts=Number(state.job?.attempts??0)+(recovered?1:0);
    const history=Array.isArray(state.history)?state.history:[];
    if(recovered) {
      history.push({
        type:"RECOVERED",
        jobId:state.job.id,
        reason:"stale worker heartbeat",
        at:now
      });
    }

    state.worker={id:this.workerId,status:"RUNNING",pid:process.pid,startedAt:now,heartbeatAt:now};
    state.job={
      id:jobId,
      command,
      status:"RUNNING",
      attempts:attempts||1,
      cycles:Number(state.job?.cycles??0),
      activeCycle:null,
      startedAt:recovered ? state.job.startedAt??now : now,
      resumedAt:recovered ? now : null,
      heartbeatAt:now,
      updatedAt:now,
      lastError:null
    };
    state.history=history.slice(-100);
    await this._write(state);
    this.jobId=jobId;
    return state;
  }

  async run({command,context={}}={}){
    if(!command) throw new Error("command is required");
    if(this.running) throw new Error("worker already running");

    this.running=true;
    this.stopRequested=false;
    let state;
    try {
      state=await this._acquire({command});
      this._startHeartbeat();

      while(!this.stopRequested && state.job.cycles<this.maxCycles){
        const cycleNumber=state.job.cycles+1;
        state=await this._read();
        state.job={
          ...(state.job??{}),
          status:"RUNNING",
          activeCycle:cycleNumber,
          heartbeatAt:new Date().toISOString(),
          updatedAt:new Date().toISOString()
        };
        await this._write(state);

        try {
          await this.cycle({cycle:cycleNumber,command,context});
          state=await this._read();
          state.job={
            ...(state.job??{}),
            status:"RUNNING",
            cycles:cycleNumber,
            activeCycle:null,
            lastCycleStatus:"SUCCEEDED",
            lastError:null,
            heartbeatAt:new Date().toISOString(),
            updatedAt:new Date().toISOString()
          };
          await this._write(state);
        } catch(error) {
          state=await this._read();
          state.job={
            ...(state.job??{}),
            status:"RUNNING",
            cycles:cycleNumber,
            activeCycle:null,
            lastCycleStatus:"FAILED",
            lastError:error.message,
            heartbeatAt:new Date().toISOString(),
            updatedAt:new Date().toISOString()
          };
          state.history=[...(state.history??[]),{
            type:"CYCLE_FAILED",
            jobId:this.jobId,
            cycle:cycleNumber,
            error:error.message,
            at:new Date().toISOString()
          }].slice(-100);
          await this._write(state);
        }

        if(!this.stopRequested && state.job.cycles<this.maxCycles){
          await new Promise(resolve=>setTimeout(resolve,this.intervalMs));
        }
      }

      state=await this._read();
      const finalStatus=this.stopRequested?"STOPPED":"COMPLETED";
      state.worker={...(state.worker??{}),id:this.workerId,status:"IDLE",heartbeatAt:null,stoppedAt:new Date().toISOString()};
      state.job={...(state.job??{}),status:finalStatus,activeCycle:null,finishedAt:new Date().toISOString(),heartbeatAt:null,updatedAt:new Date().toISOString()};
      state.history=[...(state.history??[]),{
        type:"WORKER_FINISHED",
        jobId:this.jobId,
        status:finalStatus,
        cycles:state.job.cycles,
        at:new Date().toISOString()
      }].slice(-100);
      await this._write(state);
      return {jobId:this.jobId,cycles:state.job.cycles,status:finalStatus};
    } finally {
      this._stopHeartbeat();
      if(this.leaseStore && this.leaseToken) {
        await this.leaseStore.release({owner:this.workerId,token:this.leaseToken}).catch(()=>{});
      }
      this.leaseToken=null;
      this.running=false;
      this.jobId=null;
    }
  }

  stop(){
    this.stopRequested=true;
  }

  async status(){
    const state=await this._read();
    return {
      worker:state.worker??null,
      job:state.job??null,
      history:state.history??[]
    };
  }
}
