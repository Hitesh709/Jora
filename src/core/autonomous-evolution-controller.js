export class AutonomousEvolutionController {
  constructor({generationEngine,experimentEngine,learningMemory,scheduler,selector=null,maxGenerations=10}={}){this.generationEngine=generationEngine;this.experimentEngine=experimentEngine;this.learningMemory=learningMemory;this.scheduler=scheduler;this.selector=selector;this.maxGenerations=maxGenerations;this.stopRequested=false;}
  stop(){this.stopRequested=true;}
  async run({command,context={},startGeneration=1}={}) {
    const generations=[];let champion=context.champion??null;
    for(let generation=startGeneration;generation<=this.maxGenerations&&!this.stopRequested;generation++){
      const priorLessons=await this.learningMemory?.lessons?.()??[];
      const generated=await this.generationEngine.generate({command,context:{...context,champion,priorLessons},generation});
      const experiment=await this.experimentEngine?.run?.({candidates:generated.candidates.map(x=>x.candidate),metadata:{generation,priorLessons}});
      const selected=this.selector?.select?.({candidate:generated.best?.candidate,champion})??{selected:Boolean(generated.best),candidateScore:0};
      for(const item of generated.candidates){this.learningMemory?.record?.({candidate:item.candidate,outcome:item===generated.best&&selected.selected?"SELECTED":"REJECTED",generation,lessons:item.candidate?.lessons??[],strategy:item.candidate?.strategy??null});}
      generations.push({generation,generated,experiment,selected});
      if(selected.selected){champion=generated.best.candidate;}
      if(!this.scheduler?.shouldContinue?.(generation))break;
    }
    return {status:this.stopRequested?"STOPPED":"COMPLETED",generations,champion};
  }
}