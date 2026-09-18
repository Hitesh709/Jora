export class LearningMemory {
  constructor({maxRecords=10000}={}){this.maxRecords=maxRecords;this.records=[];}
  record({candidate, outcome, generation=0, strategy=null, lessons=[]}={}){const r={candidateId:candidate?.id??candidate?.version??null,version:candidate?.version??null,outcome,generation,strategy,lessons,timestamp:new Date().toISOString()};this.records.push(r);if(this.records.length>this.maxRecords)this.records.shift();return r;}
  lessons({outcome=null,strategy=null}={}){return this.records.filter(r=>(outcome==null||r.outcome===outcome)&&(strategy==null||r.strategy===strategy)).flatMap(r=>r.lessons??[]);}
  list(){return [...this.records];}
}