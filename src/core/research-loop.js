export class ResearchLoop {
  constructor({strategyEngine,scheduler}={}){this.strategyEngine=strategyEngine;this.scheduler=scheduler;}
  planNext({champion,evaluation={},history=[],generation=0}={}) {
    const strategy=this.strategyEngine?.choose({evaluation,history})??{strategy:"baseline"};
    const schedule=this.scheduler?.plan({generation,populationSize:1,history})??{generation:generation+1};
    return {generation:schedule.generation, strategy, hypothesis:`Improve ${strategy.targetDimension??"the system"} using ${strategy.strategy}`,baselineVersion:champion?.version??null};
  }
}