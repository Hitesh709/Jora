export class ExecutionStore {
  constructor() { this.executions = new Map(); }
  create({ taskId, agentId, input }) {
    if (!taskId || !agentId) throw new Error("taskId and agentId are required");
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record = { id, taskId, agentId, input, status:"RUNNING", trace:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    this.executions.set(id, record); return structuredClone(record);
  }
  append(id, event) {
    const r=this.executions.get(id); if(!r) throw new Error(`Unknown execution: ${id}`);
    r.trace.push(event); r.updatedAt=new Date().toISOString(); return structuredClone(r);
  }
  finish(id,status,result=null) {
    const r=this.executions.get(id); if(!r) throw new Error(`Unknown execution: ${id}`);
    r.status=status; r.result=result; r.updatedAt=new Date().toISOString(); return structuredClone(r);
  }
  get(id) { const r=this.executions.get(id); return r ? structuredClone(r) : undefined; }
  list() { return [...this.executions.values()].map(value => structuredClone(value)); }
}