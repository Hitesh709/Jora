import fs from "node:fs/promises";
import path from "node:path";
import {DeploymentController} from "./deployment-controller.js";

const DIR=".jora";
const FILE="autonomous-deployment.json";
const HISTORY="autonomous-deployment-history.json";
const VERSION="1.0";
const STATES=new Set(["READY","DEPLOYING","HEALTH_CHECKING","DEPLOYED","ROLLED_BACK","FAILED"]);

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}

export function createDeploymentState({root,environment="production",version=null,provider="custom"}={}){
  return {
    version:VERSION,
    root,
    environment,
    provider,
    state:"READY",
    currentVersion:version,
    deployedVersion:null,
    deployment:null,
    health:null,
    rollback:null,
    attempt:0,
    updatedAt:new Date().toISOString()
  };
}

export async function loadDeploymentState(root){
  return readJson(path.join(root,DIR,FILE),null);
}

export async function loadDeploymentHistory(root){
  return readJson(path.join(root,DIR,HISTORY),[]);
}

export async function saveDeploymentState(root,state){
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");
  return state;
}

async function record(root,event){
  const history=await loadDeploymentHistory(root);
  history.push({...event,at:new Date().toISOString()});
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(history.slice(-200),null,2),"utf8");
}

export function validateDeploymentCandidate(candidate={}){
  const reasons=[];
  if(!candidate||typeof candidate!=="object")reasons.push("candidate is required");
  if(!candidate.version)reasons.push("candidate.version is required");
  if(!candidate.ref&& !candidate.path && !candidate.artifact)reasons.push("candidate.ref, candidate.path, or candidate.artifact is required");
  return {valid:reasons.length===0,reasons};
}

export function buildDeploymentPlan({candidate={},environment="production",provider="custom",healthRequired=true,rollbackRequired=true}={}){
  return {
    version:VERSION,
    strategy:"gated-deployment",
    provider,
    environment,
    healthRequired:Boolean(healthRequired),
    rollbackRequired:Boolean(rollbackRequired),
    candidate,
    gates:[
      "candidate-valid",
      "deployment-created",
      ...(healthRequired?["health-check"]:[]),
      ...(rollbackRequired?["rollback-capable"]:[]),
      "promotion-recorded"
    ]
  };
}

export async function runAutonomousDeployment(root,{
  candidate,
  adapter,
  healthCheck=null,
  environment="production",
  provider="custom",
  context={},
  requireHealth=true,
  requireRollback=true,
  state=null
}={}){
  if(!String(root||"").trim())throw new Error("root is required");
  const validation=validateDeploymentCandidate(candidate);
  if(!validation.valid)return {status:"DEPLOYMENT_BLOCKED",validation};

  if(!adapter||typeof adapter.deploy!=="function")return {status:"DEPLOYMENT_BLOCKED",reason:"deployment adapter is required"};
  if(requireHealth&&!healthCheck)return {status:"DEPLOYMENT_BLOCKED",reason:"health check is required"};
  if(requireRollback&&typeof adapter.rollback!=="function")return {status:"DEPLOYMENT_BLOCKED",reason:"rollback adapter is required"};

  let deploymentState=state||await loadDeploymentState(root)||createDeploymentState({root,environment,version:candidate.version,provider});
  deploymentState={
    ...deploymentState,
    environment,provider,currentVersion:candidate.version,
    state:"DEPLOYING",attempt:(deploymentState.attempt||0)+1,
    updatedAt:new Date().toISOString()
  };
  await saveDeploymentState(root,deploymentState);
  await record(root,{event:"deployment-started",version:candidate.version,environment,provider});

  const controller=new DeploymentController({
    adapter,
    healthCheck:requireHealth?healthCheck:null,
    store:{record:async event=>record(root,event)}
  });

  try{
    const result=await controller.deploy({
      candidate,
      version:candidate.version,
      context:{...context,environment,provider,root}
    });

    const next={
      ...deploymentState,
      state:result.status==="DEPLOYED"?"DEPLOYED":result.status==="ROLLED_BACK"?"ROLLED_BACK":"FAILED",
      deployment:result.deployment||null,
      health:result.health||null,
      rollback:result.rollback||null,
      deployedVersion:result.status==="DEPLOYED"?candidate.version:deploymentState.deployedVersion,
      updatedAt:new Date().toISOString()
    };
    await saveDeploymentState(root,next);
    await record(root,{
      event:"deployment-finished",
      version:candidate.version,
      status:result.status,
      health:result.health||null,
      rollback:result.rollback||null
    });
    return {status:result.status,state:next,result,plan:buildDeploymentPlan({candidate,environment,provider,healthRequired:requireHealth,rollbackRequired:requireRollback})};
  }catch(error){
    const next={...deploymentState,state:"FAILED",updatedAt:new Date().toISOString()};
    await saveDeploymentState(root,next);
    await record(root,{event:"deployment-engine-failed",version:candidate.version,error:error.message});
    return {status:"FAILED",state:next,error:error.message};
  }
}

export async function rollbackAutonomousDeployment(root,{ref,adapter,reason="health check failed",context={}}={}){
  if(!String(root||"").trim())throw new Error("root is required");
  if(!adapter||typeof adapter.rollback!=="function")throw new Error("rollback adapter is required");
  const result=await adapter.rollback(ref,{...context,reason,root});
  const state=await loadDeploymentState(root)||createDeploymentState({root});
  const next={...state,state:"ROLLED_BACK",rollback:result,updatedAt:new Date().toISOString()};
  await saveDeploymentState(root,next);
  await record(root,{event:"manual-rollback",ref,reason,result});
  return {status:"ROLLED_BACK",state:next,result};
}

export function shouldRollback(result){
  return result?.status==="ROLLED_BACK"||result?.status==="DEPLOY_FAILED"||result?.status==="FAILED";
}

export default {
  createDeploymentState,loadDeploymentState,loadDeploymentHistory,saveDeploymentState,
  validateDeploymentCandidate,buildDeploymentPlan,runAutonomousDeployment,
  rollbackAutonomousDeployment,shouldRollback
};
