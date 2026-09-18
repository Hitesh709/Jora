export class CodeQualityAssessor {
  constructor({minimumScore=0.8}={}){this.minimumScore=minimumScore;}
  assess({files=[],testsPassed=true,securityPassed=true}={}) {
    const text=files.map(f=>typeof f==="string"?f:f?.content??"").join("\n");
    const findings=[];
    if(/console\.log\(/.test(text)) findings.push("console.log usage detected");
    if(/TODO|FIXME/.test(text)) findings.push("TODO/FIXME marker detected");
    const sizePenalty=Math.min(0.2,Math.max(0,text.split("\n").length-2000)/10000);
    const score=Math.max(0,1-sizePenalty-(testsPassed?0:0.4)-(securityPassed?0:0.4));
    return {passed:score>=this.minimumScore,score,findings,testsPassed,securityPassed};
  }
}
