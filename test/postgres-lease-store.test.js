import test from "node:test";
import assert from "node:assert/strict";
import {PostgresLeaseStore} from "../src/core/postgres-lease-store.js";

function fakePool() {
  const rows=[];
  return {
    rows,
    async query(sql,params=[]) {
      if(sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) return {rows:[],rowCount:0};
      if(sql.startsWith("INSERT INTO jora_leases")) {
        const existing=rows.find(r=>r.namespace===params[0]);
        if(existing && existing.expiresAt>Date.now() && existing.owner!==params[1]) return {rows:[],rowCount:0};
        const row={namespace:params[0],owner:params[1],token:params[2],expiresAt:Date.now()+Number(params[3]),metadata:JSON.parse(params[4])};
        if(existing) Object.assign(existing,row); else rows.push(row);
        return {rows:[row],rowCount:1};
      }
      if(sql.startsWith("UPDATE jora_leases")) {
        const row=rows.find(r=>r.namespace===params[0] && r.owner===params[1] && r.token===params[2] && r.expiresAt>Date.now());
        if(!row) return {rows:[],rowCount:0};
        row.expiresAt=Date.now()+Number(params[3]);
        return {rows:[],rowCount:1};
      }
      if(sql.startsWith("DELETE FROM jora_leases")) {
        const index=rows.findIndex(r=>r.namespace===params[0] && r.owner===params[1] && r.token===params[2]);
        if(index<0) return {rows:[],rowCount:0};
        rows.splice(index,1);
        return {rows:[],rowCount:1};
      }
      if(sql.startsWith("SELECT namespace")) {
        const row=rows.find(r=>r.namespace===params[0]);
        return {rows:row?[row]:[],rowCount:row?1:0};
      }
      throw new Error("unexpected SQL");
    }
  };
}

test("postgres lease store prevents concurrent owners and supports renewal",async()=>{
  const pool=fakePool();
  const a=new PostgresLeaseStore({pool,namespace:"test",ttlMs:1000});
  const b=new PostgresLeaseStore({pool,namespace:"test",ttlMs:1000});
  const first=await a.acquire({owner:"a"});
  assert.ok(first?.token);
  assert.equal((await b.acquire({owner:"b"})),null);
  assert.equal(await a.heartbeat({owner:"a",token:first.token}),true);
  assert.equal(await b.release({owner:"b",token:first.token}),false);
  assert.equal(await a.release({owner:"a",token:first.token}),true);
  assert.ok(await b.acquire({owner:"b"}));
});

test("expired lease can be recovered",async()=>{
  const pool=fakePool();
  const a=new PostgresLeaseStore({pool,namespace:"recover",ttlMs:1});
  const b=new PostgresLeaseStore({pool,namespace:"recover",ttlMs:1});
  const first=await a.acquire({owner:"a"});
  await new Promise(r=>setTimeout(r,5));
  const second=await b.acquire({owner:"b"});
  assert.ok(second?.token);
  assert.notEqual(second.token,first.token);
});
