import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";

export class DurableArtifactStore {
  constructor({file="./.jora/v3-artifacts.json"}={}){this.file=path.resolve(file);this.state=null;}
  async _load(){if(this.state)return this.state;try{this.state=JSON.parse(await fs.readFile(this.file,"utf8"));}catch{this.state={artifacts:[]};}return this.state;}
  async _save(){await fs.mkdir(path.dirname(this.file),{recursive:true});const tmp=this.file+".tmp";await fs.writeFile(tmp,JSON.stringify(this.state,null,2),"utf8");await fs.rename(tmp,this.file);}
  async put({name,content,metadata={}}={}){if(!name)throw new Error("artifact name is required");await this._load();const row={id:"artifact_"+randomUUID(),name,content,metadata,createdAt:new Date().toISOString()};this.state.artifacts.push(row);await this._save();return row;}
  async get(id){await this._load();return this.state.artifacts.find(x=>x.id===id)||null;}
  async list(){await this._load();return [...this.state.artifacts];}
}

export class MissionTransaction {
  constructor({store=null}={}){this.store=store;this.transactions=new Map();}
  begin({mission,metadata={}}={}){const id="txn_"+randomUUID();const tx={id,mission,metadata,state:"OPEN",steps:[],createdAt:new Date().toISOString()};this.transactions.set(id,tx);return tx;}
  step(id,{name,result}={}){const tx=this.transactions.get(id);if(!tx||tx.state!=="OPEN")throw new Error("transaction is not open");tx.steps.push({name,result,at:new Date().toISOString()});return tx;}
  commit(id){const tx=this.transactions.get(id);if(!tx)throw new Error("transaction not found");tx.state="COMMITTED";tx.committedAt=new Date().toISOString();return tx;}
  rollback(id,reason="rollback requested"){const tx=this.transactions.get(id);if(!tx)throw new Error("transaction not found");tx.state="ROLLED_BACK";tx.reason=reason;tx.rolledBackAt=new Date().toISOString();return tx;}
}

export class DeliveryPolicyEngine {
  evaluate({risk="medium",testsPassed=false,reviewApproved=false,healthPassed=false}={}){const normalized=String(risk).toLowerCase();const allowed=normalized==="low"&&testsPassed||testsPassed&&reviewApproved&&healthPassed;return {allowed,risk:normalized,reasons:{testsPassed,reviewApproved,healthPassed},status:allowed?"ALLOWED":"BLOCKED"};}
}

export class PromotionGate {
  constructor({policy=new DeliveryPolicyEngine()}={}){this.policy=policy;}
  evaluate(input={}){const result=this.policy.evaluate(input);return {...result,gatedAt:new Date().toISOString()};}
}

export class ReleaseLineageTracker {
  constructor(){this.releases=[];}
  record({mission,commit,environment,status,metadata={}}={}){const row={id:"release_"+randomUUID(),mission,commit,environment,status,metadata,recordedAt:new Date().toISOString()};this.releases.push(row);return row;}
  list(){return this.releases.slice(-200);}
}

export class CanaryController {
  evaluate({baseline=0,canary=0,errorBudget=0.01}={}){const delta=canary-baseline;const healthy=canary<=errorBudget;return {baseline,canary,delta,errorBudget,healthy,status:healthy?"CANARY_HEALTHY":"CANARY_STOP"};}
}

export class RolloutController {
  plan({strategy="canary",stages=["10%","50%","100%"]}={}){return {strategy,stages:[...stages],createdAt:new Date().toISOString()};}
  next({currentIndex=0,stages=["10%","50%","100%"]}={}){const next=currentIndex+1;return {index:next,stage:stages[next]||null,complete:next>=stages.length};}
}

export class PostDeploymentVerifier {
  verify({testsPassed=false,healthPassed=false,canaryHealthy=true}={}){const passed=Boolean(testsPassed&&healthPassed&&canaryHealthy);return {passed,status:passed?"VERIFIED":"VERIFICATION_FAILED",verifiedAt:new Date().toISOString()};}
}

export class ReleaseRecoveryManager {
  constructor(){this.actions=[];}
  recover({releaseId,reason,rollbackTarget}={}){const action={id:"recovery_"+randomUUID(),releaseId,reason,rollbackTarget,status:"ROLLBACK_REQUESTED",createdAt:new Date().toISOString()};this.actions.push(action);return action;}
  list(){return this.actions.slice(-100);}
}

export class AutonomousReleaseControlPlane {
  constructor({artifacts=null,transactions=null,policy=null,promotion=null,lineage=null,canary=null,rollout=null,verifier=null,recovery=null}={}){this.artifacts=artifacts??new DurableArtifactStore();this.transactions=transactions??new MissionTransaction();this.policy=policy??new DeliveryPolicyEngine();this.promotion=promotion??new PromotionGate({policy:this.policy});this.lineage=lineage??new ReleaseLineageTracker();this.canary=canary??new CanaryController();this.rollout=rollout??new RolloutController();this.verifier=verifier??new PostDeploymentVerifier();this.recovery=recovery??new ReleaseRecoveryManager();}
  status(){return {version:"2.60.0",capabilities:{durableArtifacts:true,missionTransactions:true,deliveryPolicy:true,promotionGates:true,releaseLineage:true,canary:true,progressiveRollout:true,postDeploymentVerification:true,releaseRecovery:true,autonomousRelease:true},releases:this.lineage.list().length,recoveries:this.recovery.list().length};}
}
