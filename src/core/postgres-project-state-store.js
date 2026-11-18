import {normalizeProjectState} from "./project-state-engine.js";

const keyOf=(value="")=>String(value??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);

export class PostgresProjectStateStore {
  constructor({pool,namespace="jora",maxRecords=500}={}) {
    if(!pool?.query) throw new Error("pool with query() is required");
    this.pool=pool;
    this.namespace=namespace;
    this.maxRecords=Math.max(20,Number(maxRecords)||500);
    this.initialized=false;
  }

  async initialize() {
    if(this.initialized) return;
    await this.pool.query(`CREATE TABLE IF NOT EXISTS jora_project_states (
      namespace TEXT NOT NULL,
      project_id TEXT NOT NULL,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(namespace, project_id)
    )`);
    await this.pool.query("CREATE INDEX IF NOT EXISTS jora_project_states_updated_idx ON jora_project_states(namespace, updated_at DESC)");
    this.initialized=true;
  }

  async get(projectId) {
    const key=keyOf(projectId);
    if(!key) return undefined;
    await this.initialize();
    const result=await this.pool.query("SELECT project_id,state,updated_at FROM jora_project_states WHERE namespace=$1 AND project_id=$2",[this.namespace,key]);
    const row=result.rows[0];
    return row?{projectId:row.project_id,state:row.state,updatedAt:new Date(row.updated_at).toISOString()}:undefined;
  }

  async save(projectId,state) {
    const key=keyOf(projectId||state?.project);
    if(!key) return undefined;
    await this.initialize();
    const normalized=normalizeProjectState(state);
    const result=await this.pool.query(`INSERT INTO jora_project_states(namespace,project_id,state,updated_at)
      VALUES($1,$2,$3::jsonb,NOW())
      ON CONFLICT(namespace,project_id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()
      RETURNING project_id,state,updated_at`,[this.namespace,key,JSON.stringify(normalized)]);
    await this.pool.query(`DELETE FROM jora_project_states WHERE namespace=$1 AND project_id IN (
      SELECT project_id FROM jora_project_states WHERE namespace=$1 ORDER BY updated_at DESC OFFSET $2
    )`,[this.namespace,this.maxRecords]);
    const row=result.rows[0];
    return {projectId:row.project_id,state:row.state,updatedAt:new Date(row.updated_at).toISOString()};
  }

  async list({limit=50}={}) {
    await this.initialize();
    const safe=Math.min(500,Math.max(1,Number(limit)||50));
    const result=await this.pool.query("SELECT project_id,state,updated_at FROM jora_project_states WHERE namespace=$1 ORDER BY updated_at DESC LIMIT $2",[this.namespace,safe]);
    return result.rows.map(row=>({projectId:row.project_id,state:row.state,updatedAt:new Date(row.updated_at).toISOString()}));
  }
}

export async function createPostgresProjectStateStore({connectionString,namespace="jora",maxConnections=5}={}) {
  if(!connectionString) throw new Error("connectionString is required");
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString,max:maxConnections});
  const store=new PostgresProjectStateStore({pool,namespace});
  await store.initialize();
  return store;
}

export const projectStateKey=keyOf;
