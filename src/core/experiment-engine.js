export class ExperimentEngine {
  constructor({benchmarkStore=null}={}){this.benchmarkStore=benchmarkStore;}
  async run({candidates=[],experiment="candidate-comparison",evaluate=async c=>c?.evaluation??{},metadata={}}={}) {
    const results=[];
    for(const candidate of candidates){const evaluation=await evaluate(candidate);const result={experiment,candidateId:candidate?.id??candidate?.version??null,evaluation,metadata,timestamp:new Date().toISOString()};results.push(result);await this.benchmarkStore?.record?.(result);}
    const scores=results.map(x=>Number(x.evaluation?.score??x.evaluation?.benchmarkScore??0));
    return {experiment,results,meanScore:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0};
  }
}