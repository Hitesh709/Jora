import {buildAdaptivePlan} from "./adaptive-strategy-engine.js";

export function measureSelfImprovement({before={},after={}}={}) {
  const metrics=["successRate","repairCycles","latencyMs","costUnits"];
  const delta={};
  for(const key of metrics) {
    if(Number.isFinite(before[key])&&Number.isFinite(after[key])) delta[key]=after[key]-before[key];
  }
  const regressed=
    delta.successRate<0 ||
    delta.repairCycles>0 ||
    delta.latencyMs>0 ||
    delta.costUnits>0;
  const improved=
    !regressed &&
    (delta.successRate>0 ||
      delta.repairCycles<0 ||
      delta.latencyMs<0 ||
      delta.costUnits<0);
  return {version:"1.0",delta,improved,regressed,status:"MEASURED"};
}

export function buildSelfImprovementCycle({objective,evidence={},candidates=[],before={},after={}}={}) {
  const measurement=measureSelfImprovement({before,after});
  const plan=buildAdaptivePlan({objective,candidates,evidence});
  return {
    version:"1.0",
    measurement,
    plan,
    policy:{promoteOnlyIfVerified:true,rollbackOnRegression:true,retainEvidence:true}
  };
}

export function validateSelfImprovementCycle(cycle={}) {
  const reasons=[];
  if(!cycle.plan?.strategy) reasons.push("strategy is missing");
  if(cycle.policy?.promoteOnlyIfVerified!==true) reasons.push("verification promotion gate required");
  if(cycle.policy?.rollbackOnRegression!==true) reasons.push("rollback regression gate required");
  if(cycle.measurement?.regressed===true) reasons.push("measured regression detected");
  return {valid:reasons.length===0,reasons};
}

export class SelfImprovementEngine {
  constructor({version="1.90.0"}={}) {
    this.version=version;
  }

  plan({policies=[]}={}) {
    return {
      accepted:true,
      status:"SELF_IMPROVEMENT_PLAN_READY",
      version:this.version,
      policies:Array.isArray(policies)?policies:[],
      guardrails:[
        "verify before promotion",
        "rollback on regression",
        "preserve tests",
        "retain evidence"
      ]
    };
  }
}

export default {
  SelfImprovementEngine,
  measureSelfImprovement,
  buildSelfImprovementCycle,
  validateSelfImprovementCycle
};
