import {randomUUID} from "node:crypto";

export class PostgresTaskQueue {
  constructor({pool,namespace="jora",leaseMs=120_000}={}) {
    if(!pool?.query) throw new Error("pool with query() is required");
    if(!namespace) throw new Error("namespace is required");
    this.pool=pool;
    this.namespace=namespace;
    this.leaseMs=leaseMs;
    this.initialized=false;
  }

  async initialize() {
    if(this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jora_jobs (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        command TEXT NOT NULL,
        constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_by TEXT,
        locked_until TIMESTAMPTZ,
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        backoff_ms INTEGER NOT NULL DEFAULT 1000
      )
    `);
    await this.pool.query(`ALTER TABLE jora_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`);
    await this.pool.query(`ALTER TABLE jora_jobs ADD COLUMN IF NOT EXISTS backoff_ms INTEGER NOT NULL DEFAULT 1000`);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS jora_jobs_claim_idx
      ON jora_jobs(namespace,status,available_at,created_at)
    `);
    this.initialized=true;
  }

  async enqueue({command,constraints={},context={},availableAt=null,maxAttempts=3,backoffMs=1000}={}) {
    if(!command) throw new Error("command is required");
    await this.initialize();
    const id="job_"+randomUUID();
    const result=await this.pool.query(
      `INSERT INTO jora_jobs
       (id,namespace,command,constraints,context,status,available_at,max_attempts,backoff_ms)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,'QUEUED',COALESCE($6::timestamptz,NOW()),$7,$8)
       RETURNING *`,
      [id,this.namespace,command,JSON.stringify(constraints),JSON.stringify(context),availableAt,maxAttempts,backoffMs]
    );
    return result.rows[0];
  }

  async claim({workerId}={}) {
    if(!workerId) throw new Error("workerId is required");
    await this.initialize();
    const client=this.pool.connect ? await this.pool.connect() : this.pool;
    try {
      if(client.query===this.pool.query) {
        const result=await client.query(`
          WITH candidate AS (
            SELECT id FROM jora_jobs
            WHERE namespace=$1 AND status='QUEUED' AND available_at<=NOW()
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE jora_jobs j
          SET status='RUNNING',attempts=j.attempts+1,locked_by=$2,
              locked_until=NOW()+($3 * INTERVAL '1 millisecond'),updated_at=NOW()
          FROM candidate
          WHERE j.id=candidate.id
          RETURNING j.*`,[this.namespace,workerId,this.leaseMs]);
        return result.rows[0]??null;
      }
      await client.query("BEGIN");
      const result=await client.query(`
        SELECT * FROM jora_jobs
        WHERE namespace=$1 AND status='QUEUED' AND available_at<=NOW()
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,[this.namespace]);
      if(!result.rows.length){await client.query("COMMIT");return null;}
      const row=result.rows[0];
      const updated=await client.query(
        `UPDATE jora_jobs SET status='RUNNING',attempts=attempts+1,locked_by=$2,
         locked_until=NOW()+($3 * INTERVAL '1 millisecond'),updated_at=NOW()
         WHERE id=$1 RETURNING *`,[row.id,workerId,this.leaseMs]);
      await client.query("COMMIT");
      return updated.rows[0]??null;
    } catch(error) {
      await client.query("ROLLBACK").catch(()=>{});
      throw error;
    } finally {
      if(client!==this.pool && client.release) client.release();
    }
  }

  async complete({id,workerId,result=null}={}) {
    await this.initialize();
    const r=await this.pool.query(
      `UPDATE jora_jobs SET status='SUCCEEDED',result=$3::jsonb,error=NULL,
       locked_by=NULL,locked_until=NULL,finished_at=NOW(),updated_at=NOW()
       WHERE id=$1 AND locked_by=$2 RETURNING *`,
      [id,workerId,JSON.stringify(result)]
    );
    if(!r.rows.length) throw new Error("job lease is not owned by worker");
    return r.rows[0];
  }

  async fail({id,workerId,error,retry=true}={}) {
    await this.initialize();
    const r=await this.pool.query(
      `UPDATE jora_jobs SET
       status=CASE WHEN $3 AND attempts < max_attempts THEN 'QUEUED' ELSE 'DEAD_LETTER' END,
       error=$4,locked_by=NULL,locked_until=NULL,
       available_at=CASE WHEN $3 AND attempts < max_attempts THEN NOW() + (backoff_ms * POWER(2,GREATEST(attempts-1,0)) * INTERVAL '1 millisecond') ELSE available_at END,
       finished_at=CASE WHEN $3 AND attempts < max_attempts THEN NULL ELSE NOW() END,
       updated_at=NOW()
       WHERE id=$1 AND locked_by=$2 RETURNING *`,
      [id,workerId,retry,error??"job failed"]
    );
    if(!r.rows.length) throw new Error("job lease is not owned by worker");
    return r.rows[0];
  }

  async get(id) {
    await this.initialize();
    const r=await this.pool.query("SELECT * FROM jora_jobs WHERE namespace=$1 AND id=$2",[this.namespace,id]);
    return r.rows[0]??null;
  }

  async list({limit=50,status}={}) {
    await this.initialize();
    const safeLimit=Math.min(200,Math.max(1,Number(limit)||50));
    const params=[this.namespace];
    let sql="SELECT * FROM jora_jobs WHERE namespace=$1";
    if(status){params.push(status);sql+=" AND status=$2";}
    params.push(safeLimit);
    sql+=" ORDER BY created_at DESC LIMIT $"+params.length;
    const r=await this.pool.query(sql,params);
    return r.rows;
  }

  async recoverExpired() {
    await this.initialize();
    const r=await this.pool.query(
      `UPDATE jora_jobs SET status='QUEUED',locked_by=NULL,locked_until=NULL,
       available_at=NOW(),updated_at=NOW()
       WHERE namespace=$1 AND status='RUNNING' AND locked_until<NOW()
       RETURNING id`,[this.namespace]
    );
    return r.rowCount;
  }
}

export async function createPostgresTaskQueue({connectionString,namespace,leaseMs,maxConnections=5}={}) {
  if(!connectionString) throw new Error("connectionString is required");
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString,max:maxConnections});
  const queue=new PostgresTaskQueue({pool,namespace,leaseMs});
  await queue.initialize();
  return queue;
}
