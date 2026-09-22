import fs from "node:fs/promises";
import path from "node:path";

const VERSION="1.0";
const DIR=".jora";
const MANIFEST="project-memory.json";
const HISTORY="project-history.json";
const PROTECTED=[".git","node_modules"];

function norm(p=""){return String(p).replace(/\\/g,"/").replace(/^\.\//,"")}
function safe(p=""){p=norm(p);return Boolean(p&&!p.startsWith("/")&&!p.split("/").includes("..")&&!PROTECTED.some(x=>p===x||p.startsWith(x+"/")))}

async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,"utf8"))}catch{return fallback}
}
async function ensure(root){await fs.mkdir(path.join(root,DIR),{recursive:true})}

function fingerprint(contract={}){
  const files=contract.files||[], features=contract.features||[], routes=contract.routes||[];
  return {
    version:VERSION,
    fileCount:files.length,
    sourceCount:contract.sourceCount||0,
    features:[...new Set(features)].sort(),
    routes:[...new Set(routes)].sort(),
    entrypoints:[...(contract.entrypoints||[])].sort(),
    apiRouteCount:contract.api?.routeCount||0
  };
}

export function buildProjectMemory({contract={},projectName="existing-project",history=[],lastCommand=null,lastStatus=null}={}){
  return {
    version:VERSION,
    project:{name:projectName,fingerprint:fingerprint(contract),contract},
    history:history.slice(-50),
    lastCommand,
    lastStatus,
    updatedAt:new Date().toISOString()
  };
}

export function compareProjectMemory(memory={},contract={}){
  const previous=memory.project?.fingerprint||{}, current=fingerprint(contract);
  const addedFeatures=(current.features||[]).filter(x=>!(previous.features||[]).includes(x));
  const removedFeatures=(previous.features||[]).filter(x=>!current.features.includes(x));
  const addedRoutes=(current.routes||[]).filter(x=>!(previous.routes||[]).includes(x));
  const removedRoutes=(previous.routes||[]).filter(x=>!current.routes.includes(x));
  return {
    changed:Boolean(addedFeatures.length||removedFeatures.length||addedRoutes.length||removedRoutes.length||current.fileCount!==previous.fileCount),
    previous,current,delta:{addedFeatures,removedFeatures,addedRoutes,removedRoutes,fileCountDelta:current.fileCount-(previous.fileCount||0)}
  };
}

export async function loadProjectMemory(root){
  const file=path.join(root,DIR,MANIFEST);
  return readJson(file,null);
}

export async function loadProjectHistory(root){
  return readJson(path.join(root,DIR,HISTORY),[]);
}

export async function saveProjectMemory(root,memory){
  await ensure(root);
  await fs.writeFile(path.join(root,DIR,MANIFEST),JSON.stringify(memory,null,2),"utf8");
  return memory;
}

export async function recordProjectMemory(root,{contract={},command=null,status="UNKNOWN",changes=[],summary=null}={}){
  const previous=await loadProjectMemory(root);
  const history=await loadProjectHistory(root);
  const entry={
    id:"run-"+Date.now().toString(36),
    command,status,
    changes:changes||[],
    summary:summary||null,
    fingerprint:fingerprint(contract),
    at:new Date().toISOString()
  };
  const nextHistory=[...history,entry].slice(-50);
  const memory=buildProjectMemory({
    contract,
    projectName:previous?.project?.name||"existing-project",
    history:nextHistory,
    lastCommand:command,
    lastStatus:status
  });
  await saveProjectMemory(root,memory);
  await fs.writeFile(path.join(root,DIR,HISTORY),JSON.stringify(nextHistory,null,2),"utf8");
  return memory;
}

export async function initializeProjectMemory(root,contract={},options={}){
  const existing=await loadProjectMemory(root);
  if(existing)return {status:"MEMORY_EXISTS",memory:existing,comparison:compareProjectMemory(existing,contract)};
  const memory=await recordProjectMemory(root,{contract,command:options.command||null,status:"INITIALIZED",summary:"Initialized persistent JORA project memory."});
  return {status:"MEMORY_INITIALIZED",memory,comparison:null};
}

export async function buildContinuationContext(root,contract={}){
  const memory=await loadProjectMemory(root);
  if(!memory)return {status:"NO_MEMORY",memory:null,comparison:null,history:[]};
  return {status:"MEMORY_AVAILABLE",memory,comparison:compareProjectMemory(memory,contract),history:await loadProjectHistory(root)};
}

export default {buildProjectMemory,compareProjectMemory,loadProjectMemory,loadProjectHistory,saveProjectMemory,recordProjectMemory,initializeProjectMemory,buildContinuationContext};
