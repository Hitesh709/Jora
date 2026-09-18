export class AgentMemory {
  constructor({store=null,maxRecords=5000}={}){this.store=store;this.maxRecords=maxRecords;this.records=[];this.loaded=false;}
  async load(){if(this.loaded)return this.records;this.records=await this.store?.read?.([])??[];this.loaded=true;return this.records;}
  async remember({agentId,sessionId=null,type="fact",content,metadata={}}={}){if(!content)throw new Error("Memory content is required");await this.load();const record={id:`mem_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,agentId:agentId??null,sessionId,type,content:String(content),metadata,timestamp:new Date().toISOString()};this.records.push(record);if(this.records.length>this.maxRecords)this.records.splice(0,this.records.length-this.maxRecords);await this.store?.write?.(this.records);return structuredClone(record);}
  async recall({agentId=null,sessionId=null,type=null,limit=20}={}){await this.load();return this.records.filter(r=>(agentId==null||r.agentId===agentId)&&(sessionId==null||r.sessionId===sessionId)&&(type==null||r.type===type)).slice(-limit).map(structuredClone);}
  async clear({agentId=null}={}){await this.load();this.records=agentId==null?[]:this.records.filter(r=>r.agentId!==agentId);await this.store?.write?.(this.records);}
}
