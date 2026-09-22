import fs from "node:fs/promises";
import path from "node:path";
import {
  loadMissionState,
  resumeMissionManager,
  startNextMission,
  checkpointMission,
  completeMission,
  failMission
} from "./mission-manager-engine.js";

const DIR=".jora";
const FILE="autonomous-worker.json";
const HISTORY="autonomous-worker-history.json";
const VERSION="1.0";

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}
async function save(root,state){
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8");
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

export async function loadWorkerState(root){
  return readJson(path.join(root,DIR,FILE),null);
}

export async function loadWorkerHistory(root){
  return readJson(path.join(root,DIR,HISTORY),[]);
}

export async function saveWorkerState(root,state){
  await save(root,state);
  return state;
}

export function createWorkerState({root,command=null,intervalMs=1000,maxCycles=Infinity}={}){
  return {
    version:VERSION,
    root,
    command,
    status:"READY",
    cycle:0,
    maxCycles,
    intervalMs,
    currentMissionId:null,
    lastError:null,
    startedAt:null,
    stoppedAt:null,
    updatedAt:new Date().toISOString()
  };
}

async function record(root,event){
  const history=await loadWorkerHistory(root);
  history.push({...event,at:new Date().toISOString()});
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(history.slice(-200),null,2),"utf8");
}

export async function runAutonomousWorker(root,{
  command=null,
  intervalMs=1000,
  maxCycles=Infinity,
  missionExecutor=null,
  stopWhenComplete=true
}={}){
  if(!String(root||"").trim())throw new Error("root is required");
  const missionExecutorFn=missionExecutor||null;
  let state=await loadWorkerState(root)||createWorkerState({root,command,intervalMs,maxCycles});
  if(state.status==="RUNNING")throw new Error("autonomous worker already running");
  state={...state,command:command||state.command,intervalMs,maxCycles,status:"RUNNING",startedAt:state.startedAt||new Date().toISOString(),stoppedAt:null,lastError:null};
  await saveWorkerState(root,state);
  await record(root,{event:"worker-started",cycle:state.cycle});

  try{
    await resumeMissionManager(root,{reason:"worker-start"});
    while(state.status==="RUNNING"&&state.cycle<maxCycles){
      const missionState=await loadMissionState(root);
      const next=missionState?.currentMissionId
        ? missionState.missions?.find(m=>m.id===missionState.currentMissionId)
        : null;
      const candidate=next&&["ready","running","failed"].includes(next.status)
        ? next
        : missionState?.missions?.find(m=>m.status==="running")||missionState?.missions?.find(m=>m.status==="ready"||m.status==="failed");

      if(!candidate){
        state={...state,status:"COMPLETED",updatedAt:new Date().toISOString()};
        await saveWorkerState(root,state);
        await record(root,{event:"worker-completed",cycle:state.cycle});
        break;
      }

      state={...state,cycle:state.cycle+1,currentMissionId:candidate.id,updatedAt:new Date().toISOString()};
      await saveWorkerState(root,state);
      await record(root,{event:"mission-cycle-start",cycle:state.cycle,missionId:candidate.id});

      let active=await loadMissionState(root);
      const persisted=active?.missions?.find(m=>m.id===candidate.id);
      if(persisted?.status==="failed"||persisted?.status==="running") await resumeMissionManager(root,{reason:"worker-cycle"});
      active=await loadMissionState(root);
      const activeMission=active?.missions?.find(m=>m.id===candidate.id);
      if(!activeMission||activeMission.status==="completed")continue;
      if(activeMission.status!=="running")await startNextMission(root,{missionId:candidate.id});

      try{
        const result=missionExecutorFn
          ? await missionExecutorFn({root,command,state,mission:activeMission,cycle:state.cycle,checkpoint:active?.checkpoint||null})
          : {status:"CHECKPOINT_ONLY",complete:false,summary:"No mission executor supplied; checkpoint preserved."};

        await checkpointMission(root,{
          missionId:candidate.id,
          status:result?.complete===false?"running":"completed",
          summary:result?.summary||"Mission cycle checkpoint completed.",
          details:{cycle:state.cycle,result:result||null},
          result
        });

        if(result?.complete!==false){
          await completeMission(root,candidate.id,{summary:result?.summary||"Mission completed by autonomous worker.",result});
        }
        await record(root,{event:"mission-cycle-complete",cycle:state.cycle,missionId:candidate.id,status:result?.status||"COMPLETED"});
      }catch(error){
        await failMission(root,candidate.id,{error:error.message,retryable:true});
        state={...state,lastError:error.message,updatedAt:new Date().toISOString()};
        await saveWorkerState(root,state);
        await record(root,{event:"mission-cycle-failed",cycle:state.cycle,missionId:candidate.id,error:error.message});
      }

      const after=await loadMissionState(root);
      const unfinished=(after?.missions||[]).some(m=>["planned","ready","running","failed"].includes(m.status));
      if(!unfinished&&stopWhenComplete){
        state={...state,status:"COMPLETED",updatedAt:new Date().toISOString()};
        await saveWorkerState(root,state);
        await record(root,{event:"worker-completed",cycle:state.cycle});
        break;
      }
      if(state.cycle>=maxCycles)break;
      if(intervalMs>0)await sleep(intervalMs);
    }

    if(state.status==="RUNNING"){
      state={...state,status:"STOPPED",stoppedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await saveWorkerState(root,state);
      await record(root,{event:"worker-cycle-limit",cycle:state.cycle});
    }
    return {status:state.status,state,missionState:await loadMissionState(root)};
  }catch(error){
    state={...state,status:"FAILED",lastError:error.message,stoppedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await saveWorkerState(root,state);
    await record(root,{event:"worker-failed",cycle:state.cycle,error:error.message});
    return {status:"FAILED",state,missionState:await loadMissionState(root)};
  }
}

export function validateWorkerState(state={}){
  const reasons=[];
  if(state.version!==VERSION)reasons.push("unsupported worker version");
  if(!state.root)reasons.push("worker root is missing");
  if(!Number.isInteger(state.cycle)||state.cycle<0)reasons.push("invalid cycle");
  if(!Number.isFinite(state.maxCycles)&&state.maxCycles!==Infinity)reasons.push("invalid maxCycles");
  if(!Number.isFinite(state.intervalMs)||state.intervalMs<0)reasons.push("invalid intervalMs");
  return {valid:reasons.length===0,reasons};
}

export default {loadWorkerState,loadWorkerHistory,saveWorkerState,createWorkerState,runAutonomousWorker,validateWorkerState};
