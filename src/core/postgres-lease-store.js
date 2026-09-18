import {randomUUID} from "node:crypto";

export class PostgresLeaseStore {
  constructor({pool,namespace="jora-worker",ttlMs=120_000}={}) {
    if(!pool?.query) throw new Error("pool with query() is required");
    if(!namespace) throw new Error("namespace is required");
    if(!Number.isFinite(ttlMs) || ttlMs<=0) throw new Error("ttlMs must be positive");
    this.pool=pool;
    this.namespace=namespace;
    this.ttlMs=ttlMs;
    this.initialized=false;
  }

  async initialize() {
    if(this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jora_leases (
        namespace TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS jora_leases_expiry_idx
      ON jora_leases (expires_at)
    `);
    this.initialized=true;
  }

  async acquire({owner,metadata={}}={}) {
    if(!owner) throw new Error("owner is required");
    await this.initialize();
    const token=randomUUID();
    const result=await this.pool.query(
      `INSERT INTO jora_leases(namespace,owner,token,expires_at,updated_at,metadata)
       VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 millisecond'),NOW(),$5::jsonb)
       ON CONFLICT(namespace) DO UPDATE
       SET owner=EXCLUDED.owner,
           token=EXCLUDED.token,
           expires_at=EXCLUDED.expires_at,
           updated_at=NOW(),
           metadata=EXCLUDED.metadata
       WHERE jora_leases.expires_at<=NOW() OR jora_leases.owner=$2
       RETURNING namespace,owner,token,expires_at,updated_at,metadata`,
      [this.namespace,owner,token,this.ttlMs,JSON.stringify(metadata)]
    );
    if(!result.rows.length) return null;
    return structuredClone(result.rows[0]);
  }

  async heartbeat({owner,token,metadata}={}) {
    if(!owner || !token) return false;
    await this.initialize();
    const params=[this.namespace,owner,token,this.ttlMs];
    const metadataSql=metadata===undefined ? "" : ", metadata=$5::jsonb";
    if(metadata!==undefined) params.push(JSON.stringify(metadata));
    const result=await this.pool.query(
      `UPDATE jora_leases
       SET expires_at=NOW()+($4 * INTERVAL '1 millisecond'),
           updated_at=NOW()${metadataSql}
       WHERE namespace=$1 AND owner=$2 AND token=$3 AND expires_at>NOW()`,
      params
    );
    return result.rowCount===1;
  }

  async release({owner,token}={}) {
    if(!owner || !token) return false;
    await this.initialize();
    const result=await this.pool.query(
      "DELETE FROM jora_leases WHERE namespace=$1 AND owner=$2 AND token=$3",
      [this.namespace,owner,token]
    );
    return result.rowCount===1;
  }

  async status() {
    await this.initialize();
    const result=await this.pool.query(
      "SELECT namespace,owner,token,expires_at,updated_at,metadata FROM jora_leases WHERE namespace=$1",
      [this.namespace]
    );
    return result.rows[0]??null;
  }
}

export async function createPostgresLeaseStore({connectionString,namespace,ttlMs,maxConnections=5}={}) {
  if(!connectionString) throw new Error("connectionString is required");
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString,max: maxConnections});
  const store=new PostgresLeaseStore({pool,namespace,ttlMs});
  await store.initialize();
  return store;
}
