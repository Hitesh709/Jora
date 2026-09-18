export class DistributedWorker {
  constructor({worker,leaseStore,owner="jora-worker"}={}) {
    if(!worker) throw new Error("worker is required");
    if(!leaseStore?.acquire || !leaseStore?.heartbeat || !leaseStore?.release) {
      throw new Error("leaseStore with acquire/heartbeat/release is required");
    }
    this.worker=worker;
    this.leaseStore=leaseStore;
    this.owner=owner;
    this.lease=null;
  }

  async run(options={}) {
    if(this.lease) throw new Error("distributed worker lease is already held");
    const lease=await this.leaseStore.acquire({
      owner:this.owner,
      metadata:{command:options.command??null,pid:process.pid}
    });
    if(!lease) throw new Error("distributed worker lease is already held by another worker");
    this.lease=lease;
    try {
      return await this.worker.run(options);
    } finally {
      await this.leaseStore.release({
        owner:this.owner,
        token:lease.token
      }).catch(()=>{});
      this.lease=null;
    }
  }

  async heartbeat() {
    if(!this.lease) return false;
    const fresh=await this.leaseStore.heartbeat({
      owner:this.owner,
      token:this.lease.token
    });
    if(!fresh) {
      this.worker.stop();
      return false;
    }
    return true;
  }

  stop() {
    this.worker.stop();
  }

  async status() {
    const [worker,lease]=await Promise.all([
      this.worker.status(),
      this.leaseStore.status?.()??null
    ]);
    return {worker,lease};
  }
}
