import fs from "node:fs/promises";
import path from "node:path";
import {buildContinuationContext,recordProjectMemory} from "./project-memory-engine.js";

const VERSION="1.0";
const DIR=".jora";
const FILE="project-lifecycle.json";
const HISTORY="project-lifecycle-history.json";
const MAX_HISTORY=100;
const STATES=new Set(["initialized","active","planning","modifying","verifying","promoted","failed","rolled_back","deployed"]);

function now(){return new Date().toISOString()}
function norm(value=""){return String(value).replace(/\\/g,"/").replace(/^\.\//,"")}
function safeRelative(file=""){const p=norm(file);return Boolean(p&&!p.startsWith("/")&&!p.split("/").includes(".."))}
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}

function normalizeState(value,fallback="active"){
  const state=String(value||fallback).toLowerCase();
  return STATES.has(state)?state:fallback;
}

function projectIdentity(contract={},requestedName=null){
  const entrypoints=contract.entrypoints||[];
  const name=String(requestedName||"").trim()||"jora-project";
  return {
    name,
    kind:contract.kind||null,
    entrypoints:[...new Set(entrypoints)].sort(),
    createdAt:null
  };
}

export function buildProjectLifecycle({contract={},projectName=null,command=null,state="initialized",roadmap=[],decisions=[],versions=[],deployments=[],mission=null,history=[],existing=null}={}){
  const previous=existing||{};
  const identity=previous.identity||projectIdentity(contract,projectName);
  const lifecycle={
    version:VERSION,
    identity:{
      ...identity,
      name:identity.name||projectName||"jora-project",
      kind:identity.kind||contract.kind||null,
      entrypoints:[...new Set([...(identity.entrypoints||[]),...(contract.entrypoints||[])])].sort(),
      createdAt:identity.createdAt||now()
    },
    state:normalizeState(state,previous.state||"initialized"),
    mission:mission||previous.mission||{
      command:command||previous.lastCommand||null,
      objective:command||previous.lastCommand||null,
      status:"active"
    },
    roadmap:Array.isArray(roadmap)&&roadmap.length?roadmap:(previous.roadmap||[]),
    decisions:Array.isArray(decisions)&&decisions.length?decisions:(previous.decisions||[]),
    versions:Array.isArray(versions)&&versions.length?versions:(previous.versions||[]),
    deployments:Array.isArray(deployments)&&deployments.length?deployments:(previous.deployments||[]),
    currentContract:contract,
    lastCommand:command||previous.lastCommand||null,
    updatedAt:now(),
    history:[...(history.length?history:(previous.history||[]))].slice(-MAX_HISTORY)
  };
  return lifecycle;
}

export async function loadProjectLifecycle(root){
  return readJson(path.join(root,DIR,FILE),null);
}

export async function loadProjectLifecycleHistory(root){
  return readJson(path.join(root,DIR,HISTORY),[]);
}

export async function saveProjectLifecycle(root,lifecycle){
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,FILE),JSON.stringify(lifecycle,null,2),"utf8");
  return lifecycle;
}

export function buildLifecycleChange({state,command=null,phase="continuation",status="UPDATED",summary=null,changes=[],metadata={}}={}){
  return {
    id:"lifecycle-"+Date.now().toString(36),
    phase,
    state:normalizeState(state,"active"),
    status,
    command,
    summary:summary||null,
    changes:Array.isArray(changes)?changes:[],
    metadata:metadata||{},
    at:now()
  };
}

export function buildProjectRoadmap({command=null,contract={},existing=[]}={}){
  const current=Array.isArray(existing)?existing:[];
  if(current.length)return current;
  const features=contract.features||[];
  const items=[
    {id:"mission",title:"Complete requested mission",status:"active",source:command||"current request"},
    {id:"verify",title:"Verify generated behavior",status:"planned",source:"JORA verification gates"},
    {id:"promote",title:"Promote verified project",status:"planned",source:"JORA promotion gate"}
  ];
  for(const feature of features)items.push({id:"feature-"+feature,title:"Validate "+feature+" feature",status:"planned",source:"project contract"});
  return items;
}

export function buildVersionRecord({lifecycle,change,state="active"}={}){
  const versions=lifecycle.versions||[];
  return {
    id:"v"+(versions.length+1),
    state:normalizeState(state,"active"),
    phase:change.phase,
    summary:change.summary,
    changes:change.changes||[],
    at:change.at
  };
}

export async function recordProjectLifecycle(root,input={}){
  if(!root)throw new Error("root is required");
  const contract=input.contract||{};
  const previous=await loadProjectLifecycle(root);
  const lifecycle=buildProjectLifecycle({
    contract,
    projectName:input.projectName||previous?.identity?.name||null,
    command:input.command||null,
    state:input.state||"active",
    roadmap:input.roadmap||[],
    decisions:input.decisions||[],
    versions:previous?.versions||[],
    deployments:input.deployments||previous?.deployments||[],
    mission:input.mission||null,
    existing:previous
  });
  const change=buildLifecycleChange(input);
  lifecycle.roadmap=buildProjectRoadmap({command:input.command||lifecycle.lastCommand,contract,existing:lifecycle.roadmap});
  lifecycle.history=[...(lifecycle.history||[]),change].slice(-MAX_HISTORY);
  lifecycle.versions=[...(lifecycle.versions||[]),buildVersionRecord({lifecycle,change,state:lifecycle.state})];
  await saveProjectLifecycle(root,lifecycle);
  await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(lifecycle.history,null,2),"utf8");
  if(input.recordMemory!==false){
    await recordProjectMemory(root,{
      contract,
      command:input.command||null,
      status:input.status||change.status,
      changes:input.changes||[],
      summary:input.summary||change.summary
    });
  }
  return {status:"LIFECYCLE_RECORDED",lifecycle,change};
}

export async function initializeProjectLifecycle(root,{contract={},command=null,projectName=null}={}){
  const existing=await loadProjectLifecycle(root);
  if(existing)return {status:"LIFECYCLE_EXISTS",lifecycle:existing};
  return recordProjectLifecycle(root,{
    contract,command,projectName,state:"initialized",phase:"initialization",status:"INITIALIZED",
    summary:"Initialized persistent JORA project lifecycle.",changes:[],recordMemory:true
  });
}

export async function buildProjectLifecycleContext(root,contract={}){
  const lifecycle=await loadProjectLifecycle(root);
  const continuation=await buildContinuationContext(root,contract);
  return {status:lifecycle?"LIFECYCLE_AVAILABLE":"NO_LIFECYCLE",lifecycle,continuation};
}

export async function recordDeploymentLifecycle(root,input={}){
  const state=input.status==="DEPLOYED"||input.state==="deployed"?"deployed":input.status==="ROLLED_BACK"||input.state==="rolled_back"?"rolled_back":"failed";
  return transitionProjectLifecycle(root,state,{...input,phase:"deployment",state});
}

export async function transitionProjectLifecycle(root,state,input={}){
  return recordProjectLifecycle(root,{
    ...input,
    state,
    phase:input.phase||"lifecycle-transition",
    status:input.status||state.toUpperCase(),
    summary:input.summary||("Project lifecycle transitioned to "+normalizeState(state)),
    recordMemory:input.recordMemory!==false
  });
}

export function validateProjectLifecycle(lifecycle={}){
  const reasons=[];
  if(lifecycle.version!==VERSION)reasons.push("unsupported lifecycle version");
  if(!lifecycle.identity?.name)reasons.push("project identity is missing");
  if(!STATES.has(lifecycle.state))reasons.push("invalid lifecycle state");
  if(!Array.isArray(lifecycle.roadmap))reasons.push("roadmap must be an array");
  if(!Array.isArray(lifecycle.history))reasons.push("history must be an array");
  for(const item of lifecycle.history||[])if(item.phase&&!safeRelative(item.phase))reasons.push("invalid history phase");
  return {valid:!reasons.length,reasons};
}

export default {
  buildProjectLifecycle,loadProjectLifecycle,loadProjectLifecycleHistory,saveProjectLifecycle,
  buildLifecycleChange,buildProjectRoadmap,buildVersionRecord,recordProjectLifecycle,
  initializeProjectLifecycle,buildProjectLifecycleContext,recordDeploymentLifecycle,transitionProjectLifecycle,validateProjectLifecycle
};
