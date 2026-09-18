import crypto from "node:crypto";

export class AuditLog {
  constructor({observability=null,maxEntries=5000}={}) { this.observability=observability; this.maxEntries=maxEntries; this.entries=[]; this.lastHash="GENESIS"; }
  async record({action,actorId="system",tenantId="default",resource=null,metadata={}}={}) {
    const entry={id:"audit_"+crypto.randomUUID(),action,actorId,tenantId,resource,metadata,timestamp:new Date().toISOString(),previousHash:this.lastHash};
    entry.hash=crypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");
    this.lastHash=entry.hash; this.entries.push(entry); if(this.entries.length>this.maxEntries)this.entries.shift();
    await this.observability?.record({type:"AUDIT_EVENT",...entry});
    return entry;
  }
  list({tenantId=null,limit=100}={}) { const a=tenantId?this.entries.filter(e=>e.tenantId===tenantId):this.entries; return a.slice(-Math.min(this.maxEntries,Math.max(1,Number(limit)||100))); }
  verify() { let previous="GENESIS"; for(const e of this.entries){const copy={...e};delete copy.hash;const hash=crypto.createHash("sha256").update(JSON.stringify(copy)).digest("hex");if(e.previousHash!==previous||e.hash!==hash)return {valid:false,entryId:e.id};previous=e.hash;}return {valid:true,count:this.entries.length}; }
}
