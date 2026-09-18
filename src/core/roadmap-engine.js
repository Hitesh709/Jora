export class RoadmapEngine {
  constructor({store=null,roadmap=[],maxHistory=5000}={}){this.store=store;this.roadmap=roadmap.map(x=>({...x,dependencies:[...(x.dependencies??[])]}));this.maxHistory=maxHistory;this.state={completed:[],failed:[],history:[]};this.loaded=false;}
  async load(){if(this.loaded)return this.state;this.state=await this.store?.read?.(this.state)??this.state;this.loaded=true;return this.state;}
  async save(){this.state.history=this.state.history.slice(-this.maxHistory);await this.store?.write?.(this.state);}
  async record(id,status,evidence={}){await this.load();if(status==="DONE"&&!this.state.completed.includes(id))this.state.completed.push(id);if(status==="FAILED")this.state.failed.push(id);this.state.history.push({id,status,evidence,timestamp:new Date().toISOString()});await this.save();}
  next({limit=1}={}){const done=new Set(this.state.completed);return this.roadmap.filter(t=>!done.has(t.id)&&t.dependencies.every(d=>done.has(d))).sort((a,b)=>(b.priority??0)-(a.priority??0)).slice(0,limit).map(structuredClone);}
  progress(){return {total:this.roadmap.length,completed:this.state.completed.length,failed:this.state.failed.length,remaining:Math.max(0,this.roadmap.length-this.state.completed.length),percent:this.roadmap.length?this.state.completed.length/this.roadmap.length:0};}
  get(id){return this.roadmap.find(x=>x.id===id)??null;}
}
