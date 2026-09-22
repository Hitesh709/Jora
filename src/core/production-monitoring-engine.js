import fs from "node:fs/promises";
import path from "node:path";
import {IncidentManager} from "./incident-manager.js";

const DIR=".jora";
const FILE="production-monitor.json";
const HISTORY="production-monitor-history.json";
const VERSION="1.0";

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}
async function save(root,state){await ensure(root);await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(state,null,2),"utf8")}
async function record(root,event){
  const history=await readJson(path.join(root,DIR,HISTORY),[]);
  history.push({...event,at:new Date().toISOString()});
  await ensure(root);await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(history.slice(-500),null,2),"utf8");
}

export function createProductionMonitorState({root,environment="production",url=null,intervalMs=30000}={}){
  return {
    version:VERSION,root,environment,url,intervalMs,status:"READY",
    cycles:0,consecutiveFailures:0,lastCheckAt:null,lastHealthyAt:null,
    lastFailure:null,activeIncidentIds:[],lastRecovery:null,updatedAt:new Date().toISOString()
  };
}

export async function loadProductionMonitorState(root){
  return readJson(path.join(root,DIR,FILE),null);
}
export async function loadProductionMonitorHistory(root){
  return readJson(path.join(root,DIR,HISTORY),[]);
}
export async function saveProductionMonitorState(root,state){await save(root,state);return state}

export function validateMonitorConfig({url,probe=null}={}){
  const reasons=[];
  if(!String(url||"").trim())reasons.push("url is required");
  if(probe!==null&&typeof probe!=="function")reasons.push("probe must be a function");
  return {valid:reasons.length===0,reasons};
}

export async function httpProbe(url,{timeoutMs=10000,expectedStatus=200}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const response=await fetch(url,{method:"GET",signal:controller.signal});
    const latencyMs=Date.now()-started;
    return {passed:response.status===expectedStatus,status:response.status,latencyMs,url};
  }catch(error){
    return {passed:false,status:null,latencyMs:Date.now()-started,url,error:error.message};
  }finally{clearTimeout(timer)}
}

export function buildProductionAlert(probe,{failureThreshold=2,latencyThresholdMs=5000,consecutiveFailures=0}={}){
  if(!probe?.passed){
    return {
      type:"OPERATIONAL_ALERT",alertType:"DEPLOYED_SERVICE_UNHEALTHY",severity:consecutiveFailures+1>=failureThreshold?"CRITICAL":"WARNING",
      value:probe?.status??null,message:probe?.error||("deployed service returned status "+probe?.status),
      probe,signature:"DEPLOYED_SERVICE_UNHEALTHY:"+String(probe?.status)+":"+String(probe?.error||"")
    };
  }
  if(Number.isFinite(probe.latencyMs)&&probe.latencyMs>=latencyThresholdMs){
    return {
      type:"OPERATIONAL_ALERT",alertType:"DEPLOYED_SERVICE_SLOW",severity:"WARNING",
      value:probe.latencyMs,message:"deployed service latency "+probe.latencyMs+"ms",
      probe,signature:"DEPLOYED_SERVICE_SLOW:"+Math.round(probe.latencyMs/1000)
    };
  }
  return null;
}

export async function runProductionMonitorCycle(root,{
  url,
  probe=httpProbe,
  probeOptions={},
  incidentManager=null,
  recovery=null,
  failureThreshold=2,
  latencyThresholdMs=5000,
  state=null
}={}){
  const config=validateMonitorConfig({url,probe});
  if(!config.valid)return {status:"MONITOR_BLOCKED",config};

  let monitor=state||await loadProductionMonitorState(root)||createProductionMonitorState({root,url});
  monitor={...monitor,url,cycles:(monitor.cycles||0)+1,status:"CHECKING",lastCheckAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await saveProductionMonitorState(root,monitor);

  let result;
  try{result=await probe(url,probeOptions)}catch(error){result={passed:false,error:error.message,url}}
  const alert=buildProductionAlert(result,{failureThreshold,latencyThresholdMs,consecutiveFailures:monitor.consecutiveFailures||0});
  let incident=null,recoveryResult=null;

  if(!result.passed){
    monitor.consecutiveFailures=(monitor.consecutiveFailures||0)+1;
    monitor.lastFailure=result;
    if(incidentManager){
      incident=await incidentManager.open(alert);
      monitor.activeIncidentIds=[...new Set([...(monitor.activeIncidentIds||[]),incident.id])];
    }
    if(monitor.consecutiveFailures>=failureThreshold&&recovery?.repair){
      if(incident)await incidentManager.startRecovery(incident.id,{strategy:"production-repair",probe:result});
      recoveryResult=await recovery.repair({root,url,probe:result,incident,reason:"deployed service unhealthy"});
      monitor.lastRecovery=recoveryResult;
      if(incident){
        if(recoveryResult?.status==="RECOVERED"||recoveryResult?.status==="DEPLOYED"){
          await incidentManager.resolve(incident.id,recoveryResult);
          monitor.activeIncidentIds=(monitor.activeIncidentIds||[]).filter(id=>id!==incident.id);
        }else await incidentManager.failRecovery(incident.id,recoveryResult?.error||"recovery did not resolve incident");
      }
    }
  }else{
    monitor.consecutiveFailures=0;
    monitor.lastHealthyAt=new Date().toISOString();
    if(incidentManager){
      for(const id of monitor.activeIncidentIds||[]){
        await incidentManager.resolve(id,{status:"HEALTHY",probe:result});
      }
      monitor.activeIncidentIds=[];
    }
  }

  monitor.status=result.passed?"HEALTHY":(recoveryResult?.status==="RECOVERED"||recoveryResult?.status==="DEPLOYED"?"RECOVERED":"UNHEALTHY");
  monitor.updatedAt=new Date().toISOString();
  await saveProductionMonitorState(root,monitor);
  await record(root,{event:"monitor-cycle",cycle:monitor.cycles,status:monitor.status,probe:result,alert,recovery:recoveryResult,incidentId:incident?.id||null});
  return {status:monitor.status,state:monitor,probe:result,alert,incident,recovery:recoveryResult};
}

export async function runProductionMonitoringLoop(root,{
  url,
  intervalMs=30000,
  maxCycles=Infinity,
  probe=httpProbe,
  probeOptions={},
  incidentManager=null,
  recovery=null,
  failureThreshold=2,
  latencyThresholdMs=5000
}={}){
  let state=await loadProductionMonitorState(root)||createProductionMonitorState({root,url,intervalMs});
  if(state.status==="RUNNING")throw new Error("production monitor already running");
  state={...state,url,intervalMs,status:"RUNNING",updatedAt:new Date().toISOString()};
  await saveProductionMonitorState(root,state);
  await record(root,{event:"monitor-started",url});

  for(let i=0;i<maxCycles&&state.status==="RUNNING";i++){
    const cycle=await runProductionMonitorCycle(root,{url,probe,probeOptions,incidentManager,recovery,failureThreshold,latencyThresholdMs,state});
    state=cycle.state;
    if(i+1<maxCycles&&intervalMs>0)await new Promise(r=>setTimeout(r,intervalMs));
  }

  state={...state,status:"STOPPED",updatedAt:new Date().toISOString()};
  await saveProductionMonitorState(root,state);
  await record(root,{event:"monitor-stopped",cycles:state.cycles});
  return {status:"STOPPED",state};
}

export function createProductionIncidentManager({observability=null}={}){
  return new IncidentManager({observability});
}

export default {
  createProductionMonitorState,loadProductionMonitorState,loadProductionMonitorHistory,saveProductionMonitorState,
  validateMonitorConfig,httpProbe,buildProductionAlert,runProductionMonitorCycle,runProductionMonitoringLoop,
  createProductionIncidentManager
};
