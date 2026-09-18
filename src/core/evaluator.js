export class Evaluator {
  constructor({minimumScore=0.8,weights={}}={}) {
    this.minimumScore=minimumScore;
    this.weights={correctness:0.25,reliability:0.15,security:0.15,performance:0.1,latency:0.1,cost:0.05,regression:0.1,maintainability:0.1,...weights};
  }
  evaluate({testsPassed,securityPassed,benchmarkScore=0,qualityScore=0,metrics={}}={}) {
    const dimensions={correctness:testsPassed?1:0,reliability:Number(metrics.reliability??qualityScore),security:securityPassed?1:Number(metrics.security??0),performance:Number(metrics.performance??benchmarkScore),latency:Number(metrics.latency??benchmarkScore),cost:Number(metrics.cost??1),regression:Number(metrics.regression??1),maintainability:Number(metrics.maintainability??qualityScore)};
    for(const key of Object.keys(dimensions)) dimensions[key]=Math.max(0,Math.min(1,dimensions[key]));
    const totalWeight=Object.values(this.weights).reduce((a,b)=>a+Number(b||0),0)||1;
    const score=Object.entries(dimensions).reduce((sum,[k,v])=>sum+v*(Number(this.weights[k]||0)/totalWeight),0);
    const failedDimensions=Object.entries(dimensions).filter(([,v])=>v<this.minimumScore).map(([dimension,v])=>({dimension,score:v}));
    const passed=Boolean(testsPassed&&securityPassed&&score>=this.minimumScore&&failedDimensions.length===0);
    return {passed,score,benchmarkScore,qualityScore,dimensions,failedDimensions,weights:this.weights,reasons:passed?["All evaluation dimensions passed"]:["One or more evaluation dimensions failed"]};
  }
}