export class LearningMemory {
  constructor({maxRecords=10000,store=null}={}){this.maxRecords=maxRecords;this.store=store;this.records=[];this.loaded=false;}
  async load(){if(this.loaded)return this.records;this.records=await this.store?.read?.([])??[];this.loaded=true;return this.records;}
  async record({candidate,outcome,generation=0,strategy=null,lessons=[]}={}){await this.load();const r={candidateId:candidate?.id??candidate?.version??null,version:candidate?.version??null,outcome,generation,strategy,lessons,timestamp:new Date().toISOString()};this.records.push(r);if(this.records.length>this.maxRecords)this.records.shift();await this.store?.write?.(this.records);return r;}
  async lessons({outcome=null,strategy=null}={}){await this.load();return this.records.filter(r=>(outcome==null||r.outcome===outcome)&&(strategy==null||r.strategy===strategy)).flatMap(r=>r.lessons??[]);}
  async list(){await this.load();return this.records.map(record=>structuredClone(record));}
}
