export class RefactorSafetyGate {
  constructor({minimumQualityScore=0.8}={}){this.minimumQualityScore=minimumQualityScore;}
  evaluate({impact={},quality={},testsPassed=true,securityPassed=true}={}) {
    const highRisk=Number(impact.highRisk??impact.riskScore??0)>0;
    const passed=testsPassed&&securityPassed&&!highRisk&&Number(quality.score??0)>=this.minimumQualityScore;
    return {passed,reason:passed?"Refactor safety gates passed":"Refactor safety gate blocked the change",highRisk,qualityScore:Number(quality.score??0)};
  }
}
