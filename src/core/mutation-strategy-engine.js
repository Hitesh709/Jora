export class MutationStrategyEngine {
  constructor({strategies=["improve-correctness","reduce-latency","reduce-cost","increase-reliability","harden-security","improve-maintainability"]}={}){this.strategies=strategies;}
  choose({evaluation={},history=[]}={}) {
    const dimensions=evaluation.dimensions??{};
    const weakest=Object.entries(dimensions).sort((a,b)=>a[1]-b[1])[0]?.[0];
    const map={correctness:"improve-correctness",latency:"reduce-latency",cost:"reduce-cost",reliability:"increase-reliability",security:"harden-security",maintainability:"improve-maintainability"};
    const preferred=map[weakest]; const strategy=this.strategies.includes(preferred)?preferred:this.strategies[history.length%this.strategies.length];
    return {strategy,targetDimension:weakest,reason:weakest?`weakest dimension: ${weakest}`:"no dimension history"};
  }
}