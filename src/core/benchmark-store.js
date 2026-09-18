export class BenchmarkStore {
  constructor() { this.records=[]; }

  record(result) {
    if (!result) throw new Error("benchmark result is required");
    const record={id:`bench-${Date.now()}-${this.records.length+1}`,timestamp:new Date().toISOString(),...result};
    this.records.push(record);
    return record;
  }

  list(filter={}) {
    return this.records.filter(r=>Object.entries(filter).every(([k,v])=>r[k]===v));
  }

  best(metric="score") {
    return this.records.reduce((best,r)=>best===null || (r[metric]??-Infinity)>(best[metric]??-Infinity)?r:best,null);
  }
}
