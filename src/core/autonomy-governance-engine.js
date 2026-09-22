import fs from "node:fs/promises";
import path from "node:path";

const DIR=".jora",FILE="autonomy-governance.json",HISTORY="autonomy-governance-history.json",VERSION="1.0";
async function readJson(f,d){try{return JSON.parse(await fs.readFile(f,"utf8"))}catch{return d}}
async function ensure(r){await fs.mkdir(path.join(r,DIR),{recursive:true})}
export function createGovernanceState({root,mode="guarded"}={}){return {version:VERSION,root,mode,policies:{maxParallelProjects:1,requireVerification:true,requireRollback:true,protectedPaths:["test/","package-lock.json"]},decisions:[],status:"READY",updatedAt:new Date().toISOString()}}
export async function loadGovernanceState(root){return readJson(path.join(root,DIR,FILE),null)}
export async function loadGovernanceHistory(root){return readJson(path.join(root,DIR,HISTORY),[])}
export async function saveGovernanceState(root,state){await ensure(root);await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");return state}
async function record(root,event){const h=await loadGovernanceHistory(root)||[];h.push({...event,at:new Date().toISOString()});await ensure(root);await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(h.slice(-500),null,2),"utf8")}
export function evaluateAutonomyAction(state,{action="unknown",projectId=null,verificationPassed=false,rollbackAvailable=false,files=[]}={}){
  const reasons=[];
  if(state.policies.requireVerification&&!verificationPassed)reasons.push("verification gate required");
  if(state.policies.requireRollback&&!rollbackAvailable)reasons.push("rollback capability required");
  for(const file of files)if(state.policies.protectedPaths.some(prefix=>String(file).startsWith(prefix)))reasons.push("protected path: "+file);
  const allowed=reasons.length===0;
  return {allowed,status:allowed?"ALLOWED":"BLOCKED",action,projectId,reasons,requirements:{verificationPassed,rollbackAvailable}};
}
export function recordGovernanceDecision(state,decision){return {...state,decisions:[...(state.decisions||[]),{...decision,at:new Date().toISOString()}].slice(-200),status:decision.allowed?"APPROVED":"BLOCKED",updatedAt:new Date().toISOString()}}
export async function authorizeAutonomyAction(root,input={}){
  const state=await loadGovernanceState(root)||createGovernanceState({root});
  const decision=evaluateAutonomyAction(state,input);const next=recordGovernanceDecision(state,decision);
  await saveGovernanceState(root,next);await record(root,{event:"governance-decision",...decision});return {status:decision.status,decision,state:next};
}
export default {createGovernanceState,loadGovernanceState,loadGovernanceHistory,saveGovernanceState,evaluateAutonomyAction,recordGovernanceDecision,authorizeAutonomyAction};