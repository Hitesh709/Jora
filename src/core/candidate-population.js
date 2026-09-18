export class CandidatePopulation {
  constructor({maxSize=8}={}) { this.maxSize=maxSize; this.candidates=[]; }
  add(candidate,metadata={}) {
    const record={id:`candidate-${Date.now()}-${this.candidates.length+1}`,candidate,metadata,createdAt:new Date().toISOString()};
    this.candidates.push(record); if(this.candidates.length>this.maxSize) this.candidates.shift(); return record;
  }
  rank(selector) { return [...this.candidates].sort((a,b)=>Number(selector(b.candidate))-Number(selector(a.candidate))); }
  best(selector) { return this.rank(selector)[0]??null; }
  list(){return [...this.candidates];}
  clear(){this.candidates=[];}
}