function clone(value){return structuredClone(value);}

export class ArchitectureStore {
  constructor({store=null,maxRecords=1000}={}){this.store=store;this.maxRecords=maxRecords;this.records=[];this.loaded=false;}
  async load(){if(this.loaded)return this.records;const saved=await this.store?.read?.([]);this.records=Array.isArray(saved)?saved:[];this.loaded=true;return this.records;}
  async save(){this.records=this.records.slice(-this.maxRecords);await this.store?.write?.(this.records);return this.records;}
  async saveContract(contract,{decision=null,parentArchitectureId=null}={}){await this.load();const record={...clone(contract),parentArchitectureId:parentArchitectureId??contract.parentArchitectureId??null,decision:clone(decision??contract.decision??null),version:this.records.filter(x=>x.id===contract.id).length+1};this.records.push(record);await this.save();return clone(record);}
  async latest(id){await this.load();const matches=this.records.filter(x=>x.id===id);return matches.length?clone(matches[matches.length-1]):null;}
  async lineage(id){await this.load();const out=[];let current=this.records.find(x=>x.id===id);const seen=new Set();while(current&&!seen.has(current.id)){seen.add(current.id);out.push(clone(current));current=current.parentArchitectureId?this.records.find(x=>x.id===current.parentArchitectureId):null;}return out;}
  async list(){await this.load();return clone(this.records);}
}

export class TaskDAGOptimizer {
  optimize(tasks=[]){
    const nodes=new Map(tasks.map(t=>[t.id,{...clone(t),dependencies:[...(t.dependencies??[])]}]));
    const indegree=new Map([...nodes].map(([id])=>[id,0]));
    const outgoing=new Map([...nodes].map(([id])=>[id,[]]));
    for(const t of nodes.values()) for(const dep of t.dependencies){
      if(!nodes.has(dep)) throw new Error(`Unknown task dependency: ${dep}`);
      indegree.set(t.id,indegree.get(t.id)+1);outgoing.get(dep).push(t.id);
    }
    const ready=[...nodes.values()].filter(t=>indegree.get(t.id)===0).sort((a,b)=>(b.priority??0)-(a.priority??0));
    const order=[];const levels=[];
    while(ready.length){
      const level=ready.splice(0,ready.length);
      levels.push(level.map(t=>t.id));
      for(const t of level){order.push(t.id);for(const next of outgoing.get(t.id)){indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)ready.push(nodes.get(next));}}
      ready.sort((a,b)=>(b.priority??0)-(a.priority??0));
    }
    if(order.length!==nodes.size) throw new Error("Task DAG contains a cycle");
    const criticalDepth=new Map();
    const depth=id=>{if(criticalDepth.has(id))return criticalDepth.get(id);const t=nodes.get(id);const d=1+Math.max(0,...t.dependencies.map(depth));criticalDepth.set(id,d);return d;};
    for(const id of nodes.keys()) depth(id);
    return {order,levels,parallelGroups:levels,criticalPathLength:Math.max(0,...criticalDepth.values()),tasks:order.map(id=>clone(nodes.get(id)))};
  }
}

export class TaskContractEngine {
  compile(task,{risk=null,evidenceRequired=[],verifier=null}={}){
    if(!task?.id) throw new Error("task id is required");
    const acceptance=[...(task.acceptanceCriteria??[])].filter(Boolean);
    return {...clone(task),acceptanceCriteria:acceptance,evidenceRequired:[...evidenceRequired],risk:risk??task.risk??{level:"UNKNOWN",score:null},contract:{version:1,verifier:verifier??"default",evidenceRequired:[...evidenceRequired],acceptanceCriteria:acceptance}};
  }
  verify(task,result,evidence={}){
    const required=task?.contract?.evidenceRequired??[];
    const missing=required.filter(key=>evidence?.[key]===undefined&&result?.[key]===undefined);
    const accepted=missing.length===0 && result?.status!=="FAILED" && result?.status!=="REJECTED";
    return {passed:accepted,missing,evidence:clone(evidence)};
  }
}

export class AdaptiveExecutionPlanner {
  plan(tasks=[],{history=[],resources={}}={}){
    const optimizer=new TaskDAGOptimizer();
    const graph=optimizer.optimize(tasks);
    const failureCounts=new Map();
    for(const h of history){if(h?.strategy&&h?.success===false)failureCounts.set(h.strategy,(failureCounts.get(h.strategy)??0)+1);}
    const constrained=graph.tasks.map(task=>{const risk=task.risk?.score??0;const strategy=risk>=0.7?"isolated-verified":risk>=0.4?"guarded":"standard";return {...task,executionStrategy:resources.network==="deny"&&strategy==="standard"?"guarded":strategy};});
    return {...graph,tasks:constrained,historySignals:{failedStrategies:Object.fromEntries(failureCounts)}};
  }
}

export class ResourceAwareScheduler {
  constructor({cpu=1,memory=1,concurrency=1,model=Infinity,sandbox=Infinity}={}){this.capacity={cpu,memory,concurrency,model,sandbox};}
  admit(task,{usage={}}={}){
    const req=task?.resources??{};
    for(const key of Object.keys(this.capacity)) if(Number(usage[key]??0)+Number(req[key]??0)>Number(this.capacity[key])) return {admitted:false,reason:`resource limit: ${key}`};
    return {admitted:true};
  }
}

export class CheckpointStore {
  constructor({store=null}={}){this.store=store;this.state={};}
  async save(id,state){this.state[id]={updatedAt:new Date().toISOString(),state:clone(state)};await this.store?.write?.(this.state);return clone(this.state[id]);}
  async load(id){if(this.store?.read){const saved=await this.store.read(this.state);this.state=saved&&typeof saved==="object"?saved:this.state;}return this.state[id]?clone(this.state[id]):null;}
}

export class IdempotencyGuard {
  constructor(){this.completed=new Map();}
  key(taskId,executionKey){return `${taskId}::${executionKey}`;}
  get(taskId,executionKey){return this.completed.get(this.key(taskId,executionKey))??null;}
  record(taskId,executionKey,result){this.completed.set(this.key(taskId,executionKey),clone(result));return clone(result);}
}

export class MissionTransactionManager {
  constructor(){this.transactions=new Map();}
  begin(id,metadata={}){if(this.transactions.has(id))throw new Error(`Transaction already exists: ${id}`);const tx={id,status:"OPEN",metadata:clone(metadata),startedAt:new Date().toISOString(),tasks:[]};this.transactions.set(id,tx);return clone(tx);}
  append(id,task){const tx=this.transactions.get(id);if(!tx||tx.status!=="OPEN")throw new Error("transaction is not open");tx.tasks.push(clone(task));return clone(tx);}
  commit(id){const tx=this.transactions.get(id);if(!tx||tx.status!=="OPEN")throw new Error("transaction is not open");tx.status="COMMITTED";tx.finishedAt=new Date().toISOString();return clone(tx);}
  rollback(id,reason){const tx=this.transactions.get(id);if(!tx||tx.status!=="OPEN")throw new Error("transaction is not open");tx.status="ROLLED_BACK";tx.reason=reason;tx.finishedAt=new Date().toISOString();return clone(tx);}
}
