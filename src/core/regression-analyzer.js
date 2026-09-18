export class RegressionAnalyzer {
  constructor({thresholds={}}={}) {
    this.thresholds={scoreDelta:-0.02,dimensionDelta:-0.05,...thresholds};
  }
  compare(candidate={},champion=null,history=[]) {
    if(!champion) return {passed:true,baseline:"NONE",regressions:[],improvements:[]};
    const cd=candidate.evaluation??candidate;
    const bd=champion.evaluation??champion;
    const regressions=[],improvements=[];
    const cScore=Number(cd.score??cd.benchmarkScore??0), bScore=Number(bd.score??bd.benchmarkScore??0);
    const delta=cScore-bScore;
    if(delta<this.thresholds.scoreDelta) regressions.push({dimension:"score",delta,threshold:this.thresholds.scoreDelta});
    const dimensions=new Set([...Object.keys(cd.dimensions??{}),...Object.keys(bd.dimensions??{})]);
    for(const dimension of dimensions) {
      const d=Number(cd.dimensions?.[dimension]??0)-Number(bd.dimensions?.[dimension]??0);
      if(d<this.thresholds.dimensionDelta) regressions.push({dimension,delta:d,threshold:this.thresholds.dimensionDelta});
      if(d>0) improvements.push({dimension,delta:d});
    }
    const historicalScores=history.map(r=>Number(r.score??r.evaluation?.score)).filter(Number.isFinite);
    return {passed:regressions.length===0,baseline:"CHAMPION",scoreDelta:delta,regressions,improvements,historicalBest:historicalScores.length?Math.max(...historicalScores):null};
  }
}