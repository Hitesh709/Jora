import {JsonStore} from "./json-store.js";

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

  async promote(candidate,metrics={}) {
    await this.load();
    const record={
      candidate,
      metrics,
      promotedAt:new Date().toISOString(),
      previous:this.champion
    };
    this.history.push(record);
    this.champion=candidate;
    await this.persist();
    return record;
  }

  async rollback() {
    await this.load();
    if (!this.history.length) return null;
    this.history.pop();
    this.champion=this.history.length
      ? this.history[this.history.length-1].candidate
      : null;
    await this.persist();
    return this.champion;
  }

  list(){return [...this.history];}

  async persist() {
    if (!this.store) return {champion:this.champion,history:this.history};
    return this.store.write({champion:this.champion,history:this.history});
  }
}
