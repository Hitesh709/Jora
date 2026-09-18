export class ChampionStore {
  constructor(){this.champion=null; this.history=[];}
  get(){return this.champion;}
  promote(candidate,metrics={}) {
    const record={candidate,metrics,promotedAt:new Date().toISOString(),previous:this.champion};
    this.history.push(record); this.champion=candidate; return record;
  }
  rollback() {
    if (!this.history.length) return null;
    this.history.pop();
    this.champion=this.history.length?this.history[this.history.length-1].candidate:null;
    return this.champion;
  }
  list(){return [...this.history];}
}
