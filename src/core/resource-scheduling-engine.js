import fs from "node:fs/promises";
import path from "node:path";

const DIR=".jora",FILE="resource-scheduler.json",HISTORY="resource-scheduler-history.json",VERSION="1.0";
async function readJson(f,d){try{return JSON.parse(await fs.readFile(f,"utf8"))}catch{return d}}
async function ensure(r){await fs.mkdir(path.join(r,DIR),{recursive:true})}
export function createResourceSchedulerState({root,workers=1}={}){return {version:VERSION,root,workers:Math.max(1,workers),leases:[],queue:[],status:"READY",updatedAt:new Date().toISOString()}}
export async function loadResourceScheduler(root){return readJson(path.join(root,DIR,FILE),null)}
export async function loadResourceSchedulerHistory(root){return readJson(path.join(root,DIR,HISTORY),[])}
export async function saveResourceScheduler(root,state){await ensure(root);await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");return state}
async function record(root,event){const h=await loadResourceSchedulerHistory(root)||[];h.push({...event,at:new Date().toISOString()});await ensure(root);await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(h.slice(-500),null,2),"utf8")}
export function enqueueResourceTask(state,task){
  if(!task?.id||!task.projectId)return {status:"TASK_REJECTED",state};
  if((state.queue||[]).some(t=>t.id===task.id)||(state.leases||[]).some(t=>t.taskId===task.id))return {status:"TASK_EXISTS",state};
  const entry={...task,priority:Number.isFinite(task.priority)?task.priority:50,status:"queued",queuedAt:new Date().toISOString()};
  return {...state,queue:[...(state.queue||[]),entry],updatedAt:new Date().toISOString(),status:"READY"};
}
export function allocateResourceTasks(state){
  const active=state.leases||[],capacity=Math.max(1,state.workers||1),slots=Math.max(0,capacity-active.length);
  const queue=[...(state.queue||[])].sort((a,b)=>(b.priority??50)-(a.priority??50));
  const selected=queue.slice(0,slots),ids=new Set(selected.map(t=>t.id));
  const leases=selected.map((t,i)=>({leaseId:t.id+":"+Date.now()+":"+i,taskId:t.id,projectId:t.projectId,status:"leased",worker:i+1,leasedAt:new Date().toISOString()}));
  return {...state,queue:queue.filter(t=>!ids.has(t.id)),leases:[...active,...leases],updatedAt:new Date().toISOString()};
}
export function releaseResourceTask(state,taskId,status="completed"){
  return {...state,leases:(state.leases||[]).filter(l=>l.taskId!==taskId),updatedAt:new Date().toISOString(),lastRelease:{taskId,status,at:new Date().toISOString()}};
}
export function buildSchedulingDecision(state){const next=allocateResourceTasks(state);return {status:"SCHEDULED",assignments:next.leases.filter(l=>!(state.leases||[]).some(x=>x.taskId===l.taskId)),state:next}}
export async function scheduleResources(root,tasks=[],options={}){
  let state=await loadResourceScheduler(root)||createResourceSchedulerState({root,workers:options.workers||1});
  for(const task of tasks){const r=enqueueResourceTask(state,task);if(r.status!=="TASK_REJECTED"&&r.status!=="TASK_EXISTS")state=r}
  const decision=buildSchedulingDecision(state);state=decision.state;await saveResourceScheduler(root,state);await record(root,{event:"resources-scheduled",assignments:decision.assignments});return {status:"SCHEDULED",state,assignments:decision.assignments};
}
export default {createResourceSchedulerState,loadResourceScheduler,loadResourceSchedulerHistory,saveResourceScheduler,enqueueResourceTask,allocateResourceTasks,releaseResourceTask,buildSchedulingDecision,scheduleResources};