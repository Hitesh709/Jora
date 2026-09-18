export class EvolutionScheduler {
  constructor({maxGenerations=10}={}){this.maxGenerations=maxGenerations;}
  plan({generation=0,populationSize=1,history=[]}={}) {
    return {generation:generation+1,maxGenerations:this.maxGenerations,candidateCount:Math.max(1,populationSize),strategyRotation:history.length};
  }
  shouldContinue(generation){return generation<this.maxGenerations;}
}