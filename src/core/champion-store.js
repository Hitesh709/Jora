export class ChampionStore {
  constructor({store=null,maxHistory=1000}={}) { this.store=store; this.maxHistory=maxHistory; this.champion=null; this.history=[]; this.loaded=false; }
  async load() {
    if(this.loaded) return this;
    const state=this.store?await this.store.read({champion:null,history:[]}):{champion:null,history:[]};
    this.champion=state?.champion??null; this.history=Array.isArray(state?.history)?state.history.slice(-this.maxHistory):[]; this.loaded=true; return this;
  }
  get(){return this.champion;}
  promote(candidate,metrics={}) {
    const previous=this.champion;
    const record={candidate,metrics,promotedAt:new Date().toISOString(),previous, lineage:{parentVersion:previous?.version??null,version:candidate?.version??null}};
    this.history.push(record); if(this.history.length>this.maxHistory) this.history=this.history.slice(-this.maxHistory);
    this.champion=candidate; this.loaded=true;
    if(!this.store) return record;
    return this.persist().then(()=>record);
  }
  rollback() {
    if(!this.history.length) return null;
    const current=this.history.pop();
    this.champion=current?.previous??(this.history.length?this.history[this.history.length-1].candidate:null);
    if(!this.store) return this.champion;
    return this.persist().then(()=>this.champion);
  }
  list(){return [...this.history];}
  lineage(){return this.history.map((r,i)=>({index:i,version:r.candidate?.version??null,parentVersion:r.lineage?.parentVersion??null,promotedAt:r.promotedAt,metrics:r.metrics}));}
  async persist(){return this.store?this.store.write({champion:this.champion,history:this.history}):{champion:this.champion,history:this.history};}
}