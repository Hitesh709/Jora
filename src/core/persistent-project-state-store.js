/**
 * Jora Phase 4 — Persistent Project Memory
 *
 * Keeps compact project state across API/process restarts without persisting
 * generated source files or secrets.
 */
import {JsonStore} from "./json-store.js";
import {normalizeProjectState} from "./project-state-engine.js";

const keyOf=(value="")=>String(value??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);

export class PersistentProjectStateStore {
  constructor({store=new JsonStore({file:"./.jora/projects.json"}),maxRecords=500}={}) {
    this.store=store;
    this.maxRecords=Math.max(20,Number(maxRecords)||500);
  }

  async _read() {
    const db=await this.store.read({projects:{}});
    return {projects:db?.projects&&typeof db.projects==="object"?db.projects:{}};
  }

  async get(projectId) {
    const key=keyOf(projectId);
    if(!key) return undefined;
    const db=await this._read();
    const value=db.projects[key];
    return value?structuredClone(value):undefined;
  }

  async save(projectId,state) {
    const key=keyOf(projectId||state?.project);
    if(!key) return undefined;
    const db=await this._read();
    const normalized=normalizeProjectState(state);
    const record={projectId:key,updatedAt:new Date().toISOString(),state:normalized};
    db.projects[key]=record;
    const entries=Object.entries(db.projects).sort((a,b)=>String(a[1]?.updatedAt||"").localeCompare(String(b[1]?.updatedAt||"")));
    db.projects=Object.fromEntries(entries.slice(-this.maxRecords));
    await this.store.write(db);
    return structuredClone(record);
  }

  async list({limit=50}={}) {
    const db=await this._read();
    return Object.values(db.projects).sort((a,b)=>String(b?.updatedAt||"").localeCompare(String(a?.updatedAt||""))).slice(0,Math.max(1,Number(limit)||50));
  }
}

export const projectStateKey=keyOf;
