import {JsonStore} from "./json-store.js";

function compactEvent(event={}) {
  if(!event || typeof event!=="object") return {type:"EVENT",message:String(event??"")};
  const keep=["type","timestamp","status","phase","message","taskId","agentId","branch","base","taskCount","architectureId","specificationVersion","resultCount","durationMs","error"];
  const out={};
  for(const key of keep) if(event[key]!==undefined) out[key]=event[key];
  return out;
}

function compactResult(result=null) {
  if(result==null || typeof result!=="object") return result;
  const evaluation=result.evaluation??{};
  const security=result.security??{};
  return {
    status:result.status??null,
    version:result.version??null,
    benchmarkScore:result.benchmarkScore??evaluation.benchmarkScore??null,
    qualityScore:result.qualityScore??evaluation.qualityScore??null,
    productionReady:result.productionReady??evaluation.passed??null,
    securityPassed:result.securityPassed??security.passed??null,
    deploymentStatus:result.deployment?.status??null,
    cycles:Array.isArray(result.results)?result.results.length:(result.cycles??null),
    planning:result.planning
      ? {
          taskCount:Number(result.planning.taskCount??result.planning.dag?.nodes?.length??0),
          criticalPath:Array.isArray(result.planning.criticalPath)?result.planning.criticalPath.slice(0,30):[]
        }
      : null,
    error:result.error?.message??result.error??null
  };
}

export class PersistentExecutionStore {
  constructor({
    store=new JsonStore({file:"./.jora/executions.json"}),
    maxRecords=100
  }={}) {
    this.store=store;
    this.maxRecords=Math.max(10,Number(maxRecords)||100);
  }

  async _read() {
    const db=await this.store.read({executions:[]});
    const executions=Array.isArray(db?.executions)?db.executions.slice(-this.maxRecords):[];
    return {executions};
  }

  async _write(db) {
    db.executions=db.executions.slice(-this.maxRecords);
    return this.store.write(db);
  }

  async create(input) {
    const db=await this._read();
    const id="exec_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const record={
      id,
      taskId:input.taskId,
      agentId:input.agentId,
      input:{command:String(input.input?.command??"").slice(0,4000),tenantId:input.input?.tenantId??"default"},
      status:"RUNNING",
      trace:[],
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    db.executions.push(record);
    await this._write(db);
    return structuredClone(record);
  }

  async append(id,event) {
    return this.update(id,r=>{
      r.trace=Array.isArray(r.trace)?r.trace.slice(-99):[];
      r.trace.push(compactEvent(event));
    });
  }

  async finish(id,status,result=null) {
    return this.update(id,r=>{
      r.status=status;
      r.result=compactResult(result);
    });
  }

  async update(id,fn) {
    const db=await this._read();
    const r=db.executions.find(x=>x.id===id);
    if(!r) throw new Error("Unknown execution: "+id);
    fn(r);
    r.updatedAt=new Date().toISOString();
    await this._write(db);
    return structuredClone(r);
  }

  async get(id) {
    const db=await this._read();
    const r=db.executions.find(x=>x.id===id);
    return r?structuredClone(r):undefined;
  }

  async list() {
    return (await this._read()).executions;
  }
}
