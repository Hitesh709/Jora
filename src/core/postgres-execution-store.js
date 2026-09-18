import crypto from "node:crypto";

export class PostgresExecutionStore {
  constructor({pool,namespace="jora",maxTraceEvents=500}={}) {
    if(!pool?.query) throw new Error("pool with query() is required");
    this.pool=pool; this.namespace=namespace; this.maxTraceEvents=maxTraceEvents; this.initialized=false;
  }
  async initialize(){
    if(this.initialized)return;
    await this.pool.query(`CREATE TABLE IF NOT EXISTS jora_executions (
      id TEXT PRIMARY KEY, namespace TEXT NOT NULL, task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
      input JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL,
      trace JSONB NOT NULL DEFAULT '[]'::jsonb, result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS jora_executions_namespace_created_idx
      ON jora_executions(namespace,created_at DESC)`);
    this.initialized=true;
  }
  async create({taskId="command",agentId="jora-master",input={}}={}){
    await this.initialize(); const id="exec_"+crypto.randomUUID();
    const r=await this.pool.query(`INSERT INTO jora_executions
      (id,namespace,task_id,agent_id,input,status,trace) VALUES($1,$2,$3,$4,$5::jsonb,'RUNNING','[]'::jsonb) RETURNING *`,
      [id,this.namespace,taskId,agentId,JSON.stringify(input)]);
    return this._map(r.rows[0]);
  }
  async append(id,event){
    await this.initialize();
    const r=await this.pool.query(`UPDATE jora_executions
      SET trace=(SELECT COALESCE(jsonb_agg(value),'[]'::jsonb) FROM (
        SELECT value FROM jsonb_array_elements(trace || $3::jsonb) WITH ORDINALITY AS x(value,ord)
        ORDER BY ord DESC LIMIT $4) kept),updated_at=NOW()
      WHERE id=$1 AND namespace=$2 RETURNING *`,
      [id,this.namespace,JSON.stringify([event]),this.maxTraceEvents]);
    if(!r.rows.length)throw new Error("Unknown execution: "+id); return this._map(r.rows[0]);
  }
  async finish(id,status,result=null){
    await this.initialize();
    const r=await this.pool.query(`UPDATE jora_executions SET status=$3,result=$4::jsonb,updated_at=NOW()
      WHERE id=$1 AND namespace=$2 RETURNING *`,[id,this.namespace,status,JSON.stringify(result)]);
    if(!r.rows.length)throw new Error("Unknown execution: "+id); return this._map(r.rows[0]);
  }
  async get(id){
    await this.initialize(); const r=await this.pool.query("SELECT * FROM jora_executions WHERE namespace=$1 AND id=$2",[this.namespace,id]);
    return r.rows[0]?this._map(r.rows[0]):undefined;
  }
  async list({limit=100,status}={}){
    await this.initialize(); const safe=Math.min(500,Math.max(1,Number(limit)||100));
    const params=[this.namespace]; let sql="SELECT * FROM jora_executions WHERE namespace=$1";
    if(status){params.push(status);sql+=" AND status=$2";} params.push(safe); sql+=" ORDER BY created_at DESC LIMIT $"+params.length;
    const r=await this.pool.query(sql,params); return r.rows.map(row=>this._map(row));
  }
  _map(row){return {id:row.id,taskId:row.task_id,agentId:row.agent_id,input:row.input??{},status:row.status,
    trace:row.trace??[],result:row.result??null,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}
}
export async function createPostgresExecutionStore({connectionString,namespace,maxTraceEvents,maxConnections=5}={}){
  if(!connectionString)throw new Error("connectionString is required");
  const {Pool}=await import("pg"); const pool=new Pool({connectionString,max:maxConnections});
  const store=new PostgresExecutionStore({pool,namespace,maxTraceEvents}); await store.initialize(); return store;
}
