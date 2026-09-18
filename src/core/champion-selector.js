export class ChampionSelector {
  constructor({minimumScore=0.8,minimumDelta=0}={}) { this.minimumScore=minimumScore; this.minimumDelta=minimumDelta; }
  select({candidate=null,champion=null}={}) {
    const score=x=>Number(x?.evaluation?.score??x?.evaluation?.benchmarkScore??x?.score??0);
    const candidateScore=score(candidate), championScore=champion?score(champion):-Infinity;
    const delta=champion?candidateScore-championScore:Infinity;
    const selected=!champion
      ? candidateScore>=this.minimumScore
      : candidateScore>=this.minimumScore && delta>=this.minimumDelta;
    return {selected,candidateScore,championScore,delta,reason:selected?"candidate qualifies as champion":"candidate does not meet champion selection threshold"};
  }
}