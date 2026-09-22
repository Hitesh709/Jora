import fs from "node:fs/promises";
import path from "node:path";

const VERSION="1.0";
const DIR=".jora";
const FILE="project-missions.json";
const HISTORY="project-mission-history.json";
const MAX_HISTORY=200;
const STATUSES=new Set(["planned","ready","running","completed","failed","blocked","skipped"]);

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}
function normalizeStatus(s,f="planned"){const v=String(s||f).toLowerCase();return STATUSES.has(v)?v:f}
function unique(a=[]){return [...new Set(a.filter(Boolean))]}

export function decomposeMission(command,{contract={},features=[],existingMissions=[]}={}){
  const existing=Array.isArray(existingMissions)?existingMissions:[];
  if(existing.length)return existing;
  const requested=unique([...(features||[]),...(contract.features||[])]);
  const missions=[
    {id:"M001",title:"Analyze requirements",kind:"analysis",status:"ready",priority:100,dependencies:[],acceptance:["Requirements are represented in the project blueprint."]},
    {id:"M002",title:"Establish project architecture",kind:"architecture",status:"planned",priority:90,dependencies:["M001"],acceptance:["Project architecture and contracts are defined."]},
    {id:"M003",title:"Implement core product",kind:"implementation",status:"planned",priority:80,dependencies:["M002"],acceptance:["Requested core product behavior is implemented."]}
  ];
  let n=4, previous="M003";
  for(const feature of requested){
    missions.push({id:"M"+String(n++).padStart(3,"0"),title:"Implement "+feature+" feature",kind:"feature",feature,status:"planned",priority:70,dependencies:[previous],acceptance:["Requested "+feature+" behavior is implemented and testable."]});
    previous=missions.at(-1).id;
  }
  missions.push({id:"M"+String(n++).padStart(3,"0"),title:"Run tests and repair failures",kind:"verification",status:"planned",priority:60,dependencies:[previous],acceptance:["Workspace tests pass after repairs."]});
  missions.push({id:"M"+String(n++).padStart(3,"0"),title:"Browser verify and promote",kind:"delivery",status:"planned",priority:50,dependencies:[missions.at(-1).id],acceptance:["Browser verification and promotion gates pass."]});
  return missions.map(m=>({...m,command:command||null}));
}

export function buildMissionState({command=null,contract={},missions=[],currentMissionId=null,history=[],checkpoint=null,existing=null}={}){
  const previous=existing||{};
  const list=missions.length?missions:(previous.missions||[]);
  return {
    version:VERSION,
    command:command||previous.command||null,
    contract:contract||previous.contract||{},
    missions:list,
    currentMissionId:currentMissionId||previous.currentMissionId||list.find(m=>m.status==="running")?.id||list.find(m=>m.status==="ready")?.id||null,
    checkpoint:checkpoint||previous.checkpoint||null,
    history:[...(history.length?history:(previous.history||[]))].slice(-MAX_HISTORY),
    updatedAt:new Date().toISOString()
  };
}

export function getReadyMissions(state={}){
  const missions=state.missions||[];
  const completed=new Set(missions.filter(m=>m.status==="completed").map(m=>m.id));
  return missions.filter(m=>["planned","ready"].includes(m.status)&&((m.dependencies||[]).every(d=>completed.has(d)))).sort((a,b)=>(b.priority||0)-(a.priority||0));
}

export function selectNextMission(state={}){
  return getReadyMissions(state)[0]||null;
}

export function createMissionCheckpoint(state,{missionId=null,status="checkpoint",summary=null,details={}}={}){
  return {
    id:"checkpoint-"+Date.now().toString(36),
    missionId:missionId||state.currentMissionId||null,
    status,
    summary,
    details:details||{},
    at:new Date().toISOString()
  };
}

export async function loadMissionState(root){return readJson(path.join(root,DIR,FILE),null)}
export async function loadMissionHistory(root){return readJson(path.join(root,DIR,HISTORY),[])}
export async function saveMissionState(root,state){
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");
  return state;
}

export async function recordMissionEvent(root,input={}){
  const previous=await loadMissionState(root);
  const missions=input.missions||previous?.missions||[];
  const state=buildMissionState({...input,missions,existing:previous});
  const event={
    id:"mission-event-"+Date.now().toString(36),
    missionId:input.missionId||state.currentMissionId||null,
    event:input.event||"updated",
    status:input.status||"UPDATED",
    summary:input.summary||null,
    at:new Date().toISOString()
  };
  state.history=[...(state.history||[]),event].slice(-MAX_HISTORY);
  state.checkpoint=input.checkpoint||state.checkpoint||null;
  await saveMissionState(root,state);
  await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(state.history,null,2),"utf8");
  return {status:"MISSION_STATE_RECORDED",state,event};
}

export async function initializeMissionManager(root,{command=null,contract={},features=[]}={}){
  const existing=await loadMissionState(root);
  if(existing)return {status:"MISSIONS_EXIST",state:existing,nextMission:selectNextMission(existing)};
  const missions=decomposeMission(command,{contract,features});
  const state=buildMissionState({command,contract,missions});
  await saveMissionState(root,state);
  await fs.writeFile(path.join(root,DIR,HISTORY),"[]","utf8");
  return recordMissionEvent(root,{command,contract,missions,event:"initialized",status:"INITIALIZED",summary:"Mission plan created.",missionId:state.currentMissionId});
}

export async function startNextMission(root,input={}){
  const state=await loadMissionState(root);
  if(!state)return {status:"NO_MISSION_STATE"};
  const mission=input.missionId?state.missions.find(m=>m.id===input.missionId):selectNextMission(state);
  if(!mission)return {status:"NO_READY_MISSION",state};
  const missions=state.missions.map(m=>m.id===mission.id?{...m,status:"running",startedAt:new Date().toISOString()}:m);
  const checkpoint=createMissionCheckpoint({...state,currentMissionId:mission.id},{missionId:mission.id,status:"running",summary:"Mission started."});
  return recordMissionEvent(root,{...input,missions,currentMissionId:mission.id,checkpoint,missionId:mission.id,event:"started",status:"RUNNING",summary:mission.title});
}

export async function completeMission(root,missionId,input={}){
  const state=await loadMissionState(root);
  if(!state)throw new Error("mission state not found");
  const missions=state.missions.map(m=>m.id===missionId?{...m,status:"completed",completedAt:new Date().toISOString(),result:input.result||null}:m);
  const next=selectNextMission({...state,missions,currentMissionId:null});
  const checkpoint=createMissionCheckpoint({...state,currentMissionId:next?.id||null},{missionId:missionId,status:"completed",summary:input.summary||"Mission completed.",details:{nextMissionId:next?.id||null}});
  return recordMissionEvent(root,{...input,missions,currentMissionId:next?.id||null,checkpoint,missionId,event:"completed",status:"COMPLETED",summary:input.summary||"Mission completed."});
}

export async function failMission(root,missionId,input={}){
  const state=await loadMissionState(root);
  if(!state)throw new Error("mission state not found");
  const missions=state.missions.map(m=>m.id===missionId?{...m,status:input.blocked?"blocked":"failed",attempts:(m.attempts||0)+1,lastError:input.error||null}:m);
  const checkpoint=createMissionCheckpoint({...state,currentMissionId:missionId},{missionId,status:input.blocked?"blocked":"failed",summary:input.summary||input.error||"Mission failed.",details:{retryable:input.retryable!==false}});
  return recordMissionEvent(root,{...input,missions,currentMissionId:missionId,checkpoint,missionId,event:input.blocked?"blocked":"failed",status:input.blocked?"BLOCKED":"FAILED",summary:input.summary||input.error||"Mission failed."});
}

export function validateMissionState(state={}){
  const reasons=[];
  if(state.version!==VERSION)reasons.push("unsupported mission version");
  if(!Array.isArray(state.missions))reasons.push("missions must be an array");
  const ids=new Set();
  for(const m of state.missions||[]){if(!m.id||ids.has(m.id))reasons.push("duplicate or missing mission id");ids.add(m.id);if(!STATUSES.has(m.status))reasons.push("invalid mission status: "+m.id);for(const d of m.dependencies||[])if(!ids.has(d)&&!state.missions.some(x=>x.id===d))reasons.push("missing dependency: "+d)}
  return {valid:!reasons.length,reasons};
}

export default {decomposeMission,buildMissionState,getReadyMissions,selectNextMission,createMissionCheckpoint,loadMissionState,loadMissionHistory,saveMissionState,recordMissionEvent,initializeMissionManager,startNextMission,completeMission,failMission,validateMissionState};
