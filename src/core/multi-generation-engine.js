export class MultiGenerationEngine {
  constructor({delivery=null,population=null,selector=null,maxCandidates=4}={}){this.delivery=delivery;this.population=population;this.selector=selector;this.maxCandidates=maxCandidates;}
  async generate({command,context={},generation=1,count=this.maxCandidates}={}) {
    const candidates=[];
    for(let i=0;i<Math.max(1,count);i++){
      const project=this.delivery?await this.delivery.deliver({command,context:{...context,generation,candidateIndex:i}}):null;
      const candidate=project?.project??project;
      if(candidate){const record=this.population?.add?.(candidate,{generation,candidateIndex:i,command})??{candidate};candidates.push(record);}
    }
    const score=x=>Number(x?.candidate?.evaluation?.score??x?.candidate?.evaluation?.benchmarkScore??x?.candidate?.score??0);
    const ranked=[...candidates].sort((a,b)=>score(b)-score(a));
    return {generation,candidates,ranked,best:ranked[0]??null};
  }
}