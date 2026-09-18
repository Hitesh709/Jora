export class LineageStore {
  constructor({store=null,maxRecords=10000}={}) { this.store=store; this.maxRecords=maxRecords; this.records=[]; this.loaded=false; }
  async load(){if(this.loaded)return this;const s=this.store?await this.store.read({records:[]}):{records:[]};this.records=Array.isArray(s.records)?s.records.slice(-this.maxRecords):[];this.loaded=true;return this;}
  record({candidateId,version,parentVersion=null,generation=0,metadata={}}={}){const r={candidateId,version,parentVersion,generation,metadata,timestamp:new Date().toISOString()};this.records.push(r);if(this.records.length>this.maxRecords)this.records.shift();if(this.store)void this.store.write({records:this.records});return r;}
  ancestry(version){const out=[];let current=version;const seen=new Set();while(current&&!seen.has(current)){seen.add(current);const r=this.records.find(x=>x.version===current);if(!r)break;out.push(r);current=r.parentVersion;}return out;}
  list(){return [...this.records];}
}