import {JsonStore} from "./json-store.js";
export class PersistentExecutionStore {
  constructor({store=new JsonStore({file:"./.jora/executions.json"})}={}){this.store=store;}
  async create(input){const db=await this.store.read({executions:[]}); const id="exec_"+Date.now()+"_"+Math.random().toString(36).slice(2,8); const record={id,...input,status:"RUNNING",trace:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; db.executions.push(record); await this.store.write(db); return structuredClone(record);}
  async append(id,event){return this.update(id,r=>{r.trace.push(event);});}
  async finish(id,status,result=null){return this.update(id,r=>{r.status=status;r.result=result;});}
  async update(id,fn){const db=await this.store.read({executions:[]}); const r=db.executions.find(x=>x.id===id); if(!r) throw new Error("Unknown execution: "+id); fn(r); r.updatedAt=new Date().toISOString(); await this.store.write(db); return structuredClone(r);}
  async get(id){const db=await this.store.read({executions:[]}); const r=db.executions.find(x=>x.id===id); return r?structuredClone(r):undefined;}
  async list(){return (await this.store.read({executions:[]})).executions;}
}
