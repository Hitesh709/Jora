import {TaskRegistry,STATUS} from "./task-registry.js";

export class RoadmapEngine {
  constructor({store=null,roadmap=[],maxHistory=5000}={}) {
    this.store=store;
    this.roadmap=roadmap.map(task=>({...task,dependencies:[...(task.dependencies??[])]}));
    this.maxHistory=maxHistory;
    this.registry=new TaskRegistry(this.roadmap);
    this.state={version:2,tasks:{},history:[]};
    this.loaded=false;
  }

  async load() {
    if(this.loaded) return this.state;
    const saved=await this.store?.read?.(this.state)??this.state;
    this.state={version:2,tasks:{},history:[],...saved};
    const legacyCompleted=new Set(saved?.completed??[]);
    const legacyFailed=new Set(saved?.failed??[]);
    const legacyHistory=Array.isArray(saved?.history)?saved.history:[];
    for(const task of this.roadmap) {
      const persisted=this.state.tasks?.[task.id]??{};
      const migratedStatus=legacyCompleted.has(task.id)?"DONE":legacyFailed.has(task.id)?"FAILED":null;
      const status=persisted.status??migratedStatus??task.status??STATUS.BACKLOG;
      this.state.tasks[task.id]={...task,...persisted,status,attempts:Number(persisted.attempts??0),evidence:[...(persisted.evidence??[])]};
      const current=this.registry.get(task.id);
      if(current) {
        current.status=status;
        current.evidence=[...(persisted.evidence??[])];
      }
    }
    if(!this.state.history.length && legacyHistory.length) this.state.history=legacyHistory;
    delete this.state.completed;
    delete this.state.failed;
    this.loaded=true;
    await this.save();
    return this.state;
  }

  async save() {
    this.state.history=(this.state.history??[]).slice(-this.maxHistory);
    await this.store?.write?.(this.state);
    return this.state;
  }

  _task(id) {
    const task=this.state.tasks?.[id];
    if(!task) throw new Error(`Unknown roadmap task: ${id}`);
    return task;
  }

  addTask(task) {
    if(!task?.id) throw new Error("Task id is required");
    if(this.roadmap.some(x=>x.id===task.id)) throw new Error(`Task already exists: ${task.id}`);
    const normalized={...task,dependencies:[...(task.dependencies??[])],status:task.status??STATUS.BACKLOG};
    this.roadmap.push(normalized);
    this.state.tasks[normalized.id]={...normalized,attempts:0,evidence:[]};
    this.registry.add(normalized);
    return structuredClone(this.state.tasks[normalized.id]);
  }

  async claim(id) {
    await this.load();
    const task=this._task(id);
    if(task.status===STATUS.DONE) return structuredClone(task);
    const deps=task.dependencies??[];
    if(!deps.every(dep=>this._task(dep).status===STATUS.DONE)) throw new Error(`Dependencies are not complete for ${id}`);
    if(![STATUS.BACKLOG,STATUS.READY,STATUS.FAILED,STATUS.REJECTED,STATUS.ROLLED_BACK].includes(task.status)) {
      throw new Error(`Task is not claimable: ${id} (${task.status})`);
    }
    task.status=STATUS.IN_PROGRESS;
    task.attempts=Number(task.attempts??0)+1;
    task.claimedAt=new Date().toISOString();
    this.registry.get(id).status=STATUS.IN_PROGRESS;
    this.state.history.push({type:"TASK_CLAIMED",id,attempt:task.attempts,at:new Date().toISOString()});
    await this.save();
    return structuredClone(task);
  }

  async record(id,status,evidence={}) {
    await this.load();
    const task=this._task(id);
    task.status=status;
    if(evidence && Object.keys(evidence).length) task.evidence.push(evidence);
    task.updatedAt=new Date().toISOString();
    const current=this.registry.get(id);
    if(current) { current.status=status; current.evidence=[...task.evidence]; }
    this.state.history.push({type:"TASK_STATUS",id,status,evidence,at:task.updatedAt});
    await this.save();
    return structuredClone(task);
  }

  next({limit=1}={}) {
    if(!this.loaded) throw new Error("RoadmapEngine.load() must be called before next()");
    return this.roadmap
      .map(task=>this.state.tasks[task.id])
      .filter(task=>task && ![STATUS.DONE,STATUS.IN_PROGRESS].includes(task.status))
      .filter(task=>(task.dependencies??[]).every(dep=>this.state.tasks[dep]?.status===STATUS.DONE))
      .sort((a,b)=>(Number(b.priority??0)-Number(a.priority??0)) || String(a.id).localeCompare(String(b.id)))
      .slice(0,limit)
      .map(x=>structuredClone(x));
  }

  progress() {
    const tasks=Object.values(this.state.tasks??{});
    const completed=tasks.filter(t=>t.status===STATUS.DONE).length;
    const failed=tasks.filter(t=>t.status===STATUS.FAILED).length;
    const active=tasks.filter(t=>t.status===STATUS.IN_PROGRESS).length;
    return {total:tasks.length,completed,failed,active,remaining:Math.max(0,tasks.length-completed),percent:tasks.length?completed/tasks.length:0};
  }

  get(id) {
    if(!this.loaded) return null;
    return this.state.tasks?.[id] ? structuredClone(this.state.tasks[id]) : null;
  }

  all() {
    if(!this.loaded) return [];
    return Object.values(this.state.tasks).map(x=>structuredClone(x));
  }
}
