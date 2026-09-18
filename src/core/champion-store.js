export class ChampionStore {
  constructor({store=null}={}) {
    this.store=store;
    this.champion=null;
    this.history=[];
    this.loaded=false;
  }

  async load() {
    if (this.loaded) return this;
    const state=this.store ? await this.store.read({champion:null,history:[]}) : {champion:null,history:[]};
    this.champion=state?.champion??null;
    this.history=Array.isArray(state?.history)?state.history:[];
    this.loaded=true;
    return this;
  }

  get(){return this.champion;}

  promote(candidate,metrics={}) {
    const record={
      candidate,
      metrics,
      promotedAt:new Date().toISOString(),
      previous:this.champion
    };
    this.history.push(record);
    this.champion=candidate;
    this.loaded=true;
    if (!this.store) return record;
    return this.persist().then(()=>record);
  }

  rollback() {
    if (!this.history.length) return null;
    this.history.pop();
    this.champion=this.history.length
      ? this.history[this.history.length-1].candidate
      : null;
    if (!this.store) return this.champion;
    return this.persist().then(()=>this.champion);
  }

  list(){return [...this.history];}

  async persist() {
    if (!this.store) return {champion:this.champion,history:this.history};
    return this.store.write({champion:this.champion,history:this.history});
  }
}
