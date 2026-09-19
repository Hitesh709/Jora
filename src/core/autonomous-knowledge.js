function clone(v){return structuredClone(v);}

export class KnowledgeIngestionPipeline {
  constructor({knowledgeStore,observability=null}={}){if(!knowledgeStore)throw new Error("knowledgeStore is required");this.knowledgeStore=knowledgeStore;this.observability=observability;}
  async ingest({items=[],source=null,sourceVersion=null,authority=0.5}={}){const results=[];for(const item of items){const record=await this.knowledgeStore.upsert({id:item.id,title:item.title??"",content:item.content, tags:item.tags??[],source:item.source??source,metadata:{...(item.metadata??{}),provenance:{source:item.source??source,sourceVersion:item.sourceVersion??sourceVersion,authority:Number(authority),ingestedAt:new Date().toISOString()}}});results.push(record);}await this.observability?.append?.({type:"KNOWLEDGE_INGESTED",count:results.length,at:new Date().toISOString()});return results;}
}

export class KnowledgeIndex {
  constructor({knowledgeStore}={}){this.knowledgeStore=knowledgeStore;}
  async index(){const records=await this.knowledgeStore.list();return {count:records.length,terms:new Set(records.flatMap(r=>String(r.content).toLowerCase().split(/\W+/).filter(Boolean))).size};}
  async search(query,{limit=10,tags=[]}={}){return this.knowledgeStore.search(query,{limit,tags});}
}

export class EvidenceAwareRetriever {
  constructor({knowledgeStore,agentMemory=null}={}){this.knowledgeStore=knowledgeStore;this.agentMemory=agentMemory;}
  async retrieve({query,limit=8,now=Date.now()}={}){const records=await this.knowledgeStore.search(query,{limit:Math.max(limit*3,limit)});const scored=records.map(r=>{const p=r.metadata?.provenance??{};const authority=Math.max(0,Math.min(1,Number(p.authority??0.5)));const ageDays=Math.max(0,(now-new Date(p.ingestedAt??r.updatedAt??now).getTime())/86400000);const freshness=1/(1+ageDays/30);const relevance=Math.min(1,Number(r.score??0)/Math.max(1,String(query).split(/\W+/).filter(Boolean).length));const evidence=Number(p.evidenceScore??0.5);const score=.45*relevance+.25*freshness+.2*authority+.1*evidence;return {...r,retrievalScore:Number(score.toFixed(6)),evidence:{authority,freshness,evidence}};}).sort((a,b)=>b.retrievalScore-a.retrievalScore).slice(0,limit);return scored;}
}

export class ProvenanceManager {
  enrich(record,{source,version,authority=0.5,evidenceScore=0.5}={}){return {...clone(record),metadata:{...(record.metadata??{}),provenance:{source:source??record.source??null,version:version??null,authority:Number(authority),evidenceScore:Number(evidenceScore),updatedAt:new Date().toISOString()}}};}
  validate(record){const p=record?.metadata?.provenance;return {passed:Boolean(p?.source&&p?.updatedAt),missing:[...(!p?.source?["source"]:[]),...(!p?.updatedAt?["updatedAt"]:[])]};}
}

export class KnowledgeConflictResolver {
  resolve(records=[]){const groups=new Map();for(const r of records){const key=String(r.title||r.content).toLowerCase().replace(/\W+/g," ").trim();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}const resolved=[];const conflicts=[];for(const [key,items] of groups){const sorted=[...items].sort((a,b)=>Number(b.metadata?.provenance?.authority??0)-Number(a.metadata?.provenance?.authority??0));const chosen=sorted[0];if(items.length>1){conflicts.push({key,records:items.map(clone),selected:chosen.id,reason:"highest provenance authority"});}resolved.push(chosen);}return {resolved,conflicts};}
}

export class MemoryConsolidationEngine {
  constructor({learningMemory,knowledgeStore,observability=null}={}){this.learningMemory=learningMemory;this.knowledgeStore=knowledgeStore;this.observability=observability;}
  async consolidate(){const records=await this.learningMemory.list();const lessons=records.flatMap(r=>(r.lessons??[]).map(lesson=>({lesson,outcome:r.outcome,strategy:r.strategy,generation:r.generation,timestamp:r.timestamp})));const grouped=new Map();for(const x of lessons){const key=String(x.lesson).toLowerCase().trim();if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(x);}const saved=[];for(const [key,items] of grouped){if(items.length<2)continue;saved.push(await this.knowledgeStore.upsert({id:"lesson_"+Buffer.from(key).toString("base64url").slice(0,48),title:"Consolidated lesson",content:key,tags:["lesson","learned"],metadata:{frequency:items.length,outcomes:[...new Set(items.map(x=>x.outcome))],strategies:[...new Set(items.map(x=>x.strategy).filter(Boolean))],lastSeen:items.at(-1).timestamp}}));}await this.observability?.append?.({type:"MEMORY_CONSOLIDATED",lessons:saved.length,at:new Date().toISOString()});return saved;}
}

export class FailurePatternLibrary {
  constructor({knowledgeStore}={}){this.knowledgeStore=knowledgeStore;}
  async record({failureType,message,strategy=null,success=false}={}){const id="failure_"+String(failureType||"unknown").toLowerCase().replace(/\W+/g,"_");const existing=(await this.knowledgeStore.list()).find(x=>x.id===id);const data=existing?.metadata?.pattern??{failureType,count:0,successfulStrategies:{}};data.count++;if(success&&strategy)data.successfulStrategies[strategy]=(data.successfulStrategies[strategy]??0)+1;return this.knowledgeStore.upsert({id,title:"Failure pattern: "+failureType,content:message??failureType,tags:["failure-pattern",String(failureType)],metadata:{pattern:data}});}
  async strategies(failureType){const id="failure_"+String(failureType||"unknown").toLowerCase().replace(/\W+/g,"_");const r=(await this.knowledgeStore.list()).find(x=>x.id===id);return Object.entries(r?.metadata?.pattern?.successfulStrategies??{}).sort((a,b)=>b[1]-a[1]).map(([strategy,count])=>({strategy,count}));}
}

export class StrategyEffectivenessModel {
  constructor({learningMemory}={}){this.learningMemory=learningMemory;}
  async score(strategy){const records=(await this.learningMemory.list()).filter(r=>r.strategy===strategy);if(!records.length)return {strategy,sampleSize:0,successRate:null};const successes=records.filter(r=>r.outcome==="SUCCESS"||r.outcome==="PASSED"||r.outcome==="PROMOTED").length;return {strategy,sampleSize:records.length,successRate:successes/records.length};}
  async rank(){const records=await this.learningMemory.list();const strategies=[...new Set(records.map(r=>r.strategy).filter(Boolean))];return Promise.all(strategies.map(s=>this.score(s))).then(x=>x.sort((a,b)=>(b.successRate??-1)-(a.successRate??-1)));}
}

export class ExperienceGuidedPlanner {
  constructor({strategyModel,learningMemory}={}){this.strategyModel=strategyModel;this.learningMemory=learningMemory;}
  async plan(task,{defaultStrategy="standard"}={}){const ranked=await this.strategyModel.rank();const preferred=ranked[0]?.strategy??defaultStrategy;const lessons=await this.learningMemory.lessons({strategy:preferred});return {...clone(task),executionStrategy:preferred,learnedLessons:lessons.slice(-10),experienceSignals:{strategies:ranked.slice(0,5)}};}
}

export class ContinuousLearningLoop {
  constructor({learningMemory,knowledgeStore,consolidator,observability=null}={}){this.learningMemory=learningMemory;this.knowledgeStore=knowledgeStore;this.consolidator=consolidator;this.observability=observability;}
  async learn({candidate,outcome,strategy,lessons=[],evidence={}}={}){await this.learningMemory.record({candidate,outcome,strategy,lessons});if(evidence?.failureType){await new FailurePatternLibrary({knowledgeStore:this.knowledgeStore}).record({failureType:evidence.failureType,message:evidence.message,strategy,success:outcome==="SUCCESS"});}const consolidated=await this.consolidator.consolidate();await this.observability?.append?.({type:"LEARNING_CYCLE",outcome,strategy,lessons:lessons.length,consolidated:consolidated.length,at:new Date().toISOString()});return {outcome,strategy,consolidated};}
}
