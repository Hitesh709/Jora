import fs from "node:fs/promises";
import path from "node:path";

const DIR=".jora";
const FILE="project-portfolio.json";
const HISTORY="project-portfolio-history.json";
const VERSION="1.0";
const STATUSES=new Set(["registered","active","paused","blocked","completed","failed","archived"]);

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}

export function createPortfolioState({root}={}){
  return {version:VERSION,root,projects:[],priorities:[],capacity:{workers:1,active:0},status:"READY",updatedAt:new Date().toISOString()};
}
export async function loadPortfolio(root){return readJson(path.join(root,DIR,FILE),null)}
export async function loadPortfolioHistory(root){return readJson(path.join(root,DIR,HISTORY),[])}
export async function savePortfolio(root,state){await ensure(root);await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");return state}
async function record(root,event){const h=await loadPortfolioHistory(root)||[];h.push({...event,at:new Date().toISOString()});await ensure(root);await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(h.slice(-500),null,2),"utf8")}

export function validatePortfolioProject(project={}){
  const reasons=[];
  if(!project.id)reasons.push("project.id is required");
  if(!project.name)reasons.push("project.name is required");
  if(project.status&&!STATUSES.has(project.status))reasons.push("invalid project.status");
  return {valid:reasons.length===0,reasons};
}
export function registerPortfolioProject(state,project){
  const validation=validatePortfolioProject(project);
  if(!validation.valid)return {state,status:"PROJECT_REJECTED",validation};
  if((state.projects||[]).some(p=>p.id===project.id))return {state,status:"PROJECT_EXISTS"};
  const entry={...project,status:project.status||"registered",priority:Number.isFinite(project.priority)?project.priority:50,health:project.health||"unknown",missionStatus:project.missionStatus||"unknown",updatedAt:new Date().toISOString()};
  return {...state,projects:[...(state.projects||[]),entry],updatedAt:new Date().toISOString(),status:"READY"};
}
export function updatePortfolioProject(state,id,patch={}){
  const projects=(state.projects||[]).map(p=>p.id===id?{...p,...patch,updatedAt:new Date().toISOString()}:p);
  return {...state,projects,updatedAt:new Date().toISOString()};
}
export function rankPortfolioProjects(state){
  return [...(state.projects||[])].sort((a,b)=>(b.priority??50)-(a.priority??50)||String(a.updatedAt||"").localeCompare(String(b.updatedAt||"")));
}
export function buildPortfolioPlan(state){
  const ranked=rankPortfolioProjects(state);
  const capacity=Math.max(1,Number(state.capacity?.workers)||1);
  return {version:VERSION,strategy:"priority-and-health-aware",capacity,assignments:ranked.slice(0,capacity).map((p,i)=>({slot:i+1,projectId:p.id,priority:p.priority,health:p.health,missionStatus:p.missionStatus}))};
}
export async function registerProject(root,project){
  let state=await loadPortfolio(root)||createPortfolioState({root});
  const result=registerPortfolioProject(state,project);
  if(result.status!=="PROJECT_REJECTED"&&result.status!=="PROJECT_EXISTS")state=result;
  await savePortfolio(root,state);await record(root,{event:"project-registered",projectId:project.id,status:result.status});
  return {status:result.status,state};
}
export async function updateProject(root,id,patch){
  const state=await loadPortfolio(root)||createPortfolioState({root});
  const next=updatePortfolioProject(state,id,patch);
  await savePortfolio(root,next);await record(root,{event:"project-updated",projectId:id,patch});
  return {status:"PROJECT_UPDATED",state:next};
}
export async function buildPortfolioSnapshot(root){
  const state=await loadPortfolio(root)||createPortfolioState({root});
  return {status:"PORTFOLIO_READY",state,plan:buildPortfolioPlan(state),history:await loadPortfolioHistory(root)};
}
export async function setPortfolioCapacity(root,{workers=1}={}){
  const state=await loadPortfolio(root)||createPortfolioState({root});
  const next={...state,capacity:{...state.capacity,workers:Math.max(1,Math.floor(workers))},updatedAt:new Date().toISOString()};
  await savePortfolio(root,next);await record(root,{event:"capacity-updated",workers:next.capacity.workers});return next;
}
export default {createPortfolioState,loadPortfolio,loadPortfolioHistory,savePortfolio,validatePortfolioProject,registerPortfolioProject,updatePortfolioProject,rankPortfolioProjects,buildPortfolioPlan,registerProject,updateProject,buildPortfolioSnapshot,setPortfolioCapacity};