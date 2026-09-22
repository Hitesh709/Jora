import fs from "node:fs/promises";
import path from "node:path";

const VERSION="1.0";
const PROTECTED=new Set(["test",".jora/acceptance.json",".jora/requirements.json"]);
const safe=p=>{p=String(p||"").replace(/\\/g,"/");return p&&!p.startsWith("/")&&!p.split("/").includes("..")&&!p.startsWith(".git/")&&!p.startsWith("node_modules/")};
const protectedPath=p=>{p=String(p||"").replace(/\\/g,"/");return [...PROTECTED].some(x=>p===x||p.startsWith(x+"/"))};

function text(input={}) {
  return JSON.stringify({
    request:input.command||"",
    blueprint:input.blueprint||{},
    requirements:input.requirements||{},
    existing:input.existingFeatures||[],
    desired:input.desiredFeatures||[]
  }).toLowerCase();
}

export function extractFeatureDelta(input={}) {
  const all=text(input);
  const requested=new Set(input.desiredFeatures||[]);
  const inferred=[
    ["authentication",/login|sign[ -]?in|signup|register|auth/.test(all)],
    ["search",/search|filter|find/.test(all)],
    ["chat",/chat|messaging|message/.test(all)],
    ["commerce",/checkout|payment|cart|stripe|paypal|razorpay/.test(all)],
    ["leaderboard",/leaderboard|ranking|high score/.test(all)],
    ["multiplayer",/multiplayer|real[ -]?time|online players/.test(all)],
    ["booking",/booking|reservation|appointment/.test(all)],
    ["notifications",/notification|alert|email notification/.test(all)],
    ["gameplay",/game|level|score|enemy|player/.test(all)]
  ];
  for(const [name,yes] of inferred) if(yes) requested.add(name);
  const existing=new Set(input.existingFeatures||[]);
  return {
    version:VERSION,
    added:[...requested].filter(x=>!existing.has(x)),
    retained:[...requested].filter(x=>existing.has(x)),
    removed:[],
    unchanged:[...existing].filter(x=>requested.has(x))
  };
}

function featureModule(feature) {
  const map={
    authentication:["src/features/authentication.js",'export const authenticationFeature={name:"authentication",status:"planned"};'],
    search:["src/features/search.js",'export const searchFeature={name:"search",status:"planned"};'],
    chat:["src/features/chat.js",'export const chatFeature={name:"chat",status:"planned"};'],
    commerce:["src/features/commerce.js",'export const commerceFeature={name:"commerce",status:"planned"};'],
    leaderboard:["src/features/leaderboard.js",'export const leaderboardFeature={name:"leaderboard",status:"planned"};'],
    multiplayer:["src/features/multiplayer.js",'export const multiplayerFeature={name:"multiplayer",status:"planned"};'],
    booking:["src/features/booking.js",'export const bookingFeature={name:"booking",status:"planned"};'],
    notifications:["src/features/notifications.js",'export const notificationsFeature={name:"notifications",status:"planned"};'],
    gameplay:["src/features/gameplay.js",'export const gameplayFeature={name:"gameplay",status:"planned"};']
  };
  const [file,content]=map[feature]||[];
  return file?{feature,path:file,content}:null;
}

export async function inspectFeatureEvolution(root,input={}) {
  const files=[];
  async function walk(dir=root){
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(e.name===".git"||e.name==="node_modules")continue;
      const abs=path.join(dir,e.name);
      if(e.isDirectory())await walk(abs);else files.push(path.relative(root,abs).replace(/\\/g,"/"));
    }
  }
  await walk();
  const delta=extractFeatureDelta(input);
  const missing=delta.added.map(featureModule).filter(Boolean).filter(x=>!files.includes(x.path));
  return {version:VERSION,delta,files,missing};
}

export function buildFeatureEvolutionPlan(inspection={}) {
  const creates=(inspection.missing||[]).map(x=>({operation:"create",...x}));
  return {
    version:VERSION,
    strategy:creates.length?"feature-expansion":"no-change",
    addedFeatures:inspection.delta?.added||[],
    creates,
    steps:[
      {id:"delta",action:"extract-requirement-delta"},
      {id:"impact",action:"inspect-existing-feature-surface"},
      {id:"generate",action:"generate-missing-feature-modules"},
      {id:"integrate",action:"prepare-feature-integration-contracts"},
      {id:"regression",action:"run-existing-and-new-feature-tests"}
    ],
    guardrails:[
      "Preserve existing behavior unless the request explicitly changes it.",
      "Never modify protected tests or acceptance artifacts.",
      "Never delete an existing feature during additive expansion.",
      "Only generate modules justified by the requested feature delta.",
      "Require regression verification before promotion."
    ]
  };
}

export function validateFeatureEvolutionPlan(plan) {
  const reasons=[];
  for(const item of plan?.creates||[]){
    if(!safe(item.path))reasons.push("unsafe path: "+item.path);
    if(protectedPath(item.path))reasons.push("protected path: "+item.path);
    if(typeof item.content!=="string"||!item.content.trim())reasons.push("empty feature module: "+item.path);
  }
  return {valid:reasons.length===0,reasons};
}

export async function applyFeatureEvolution(root,plan,{runTests}={}) {
  const validation=validateFeatureEvolutionPlan(plan);
  if(!validation.valid)return {status:"REJECTED",created:[],rollback:[],validation};
  const created=[];
  try{
    for(const item of plan.creates||[]){
      if(!safe(item.path)||protectedPath(item.path))throw new Error("unsafe feature target");
      if(await fs.access(path.join(root,item.path)).then(()=>true).catch(()=>false))continue;
      await fs.mkdir(path.dirname(path.join(root,item.path)),{recursive:true});
      await fs.writeFile(path.join(root,item.path),item.content,"utf8");
      created.push(item.path);
    }
    const tests=typeof runTests==="function"?await runTests(root):null;
    if(tests&&!tests.passed)throw new Error("regression failed after feature expansion");
    return {status:"FEATURES_EXPANDED",created,rollback:[],validation,tests};
  }catch(error){
    for(const file of created)try{await fs.rm(path.join(root,file),{force:true})}catch{}
    return {status:"ROLLED_BACK",created:[],rollback:created,validation,error:error.message};
  }
}

export async function persistFeatureEvolutionReport(root,report){
  await fs.mkdir(path.join(root,".jora"),{recursive:true});
  await fs.writeFile(path.join(root,".jora","feature-evolution.json"),JSON.stringify(report,null,2),"utf8");
  return report;
}

export async function runFeatureEvolutionLoop(root,input={}) {
  const inspection=await inspectFeatureEvolution(root,input);
  const plan=buildFeatureEvolutionPlan(inspection);
  if(!plan.creates.length)return {version:VERSION,status:"NO_FEATURE_DELTA",expanded:false,inspection,plan};
  const result=await applyFeatureEvolution(root,plan,{runTests:input.runTests});
  return {version:VERSION,status:result.status,expanded:result.status==="FEATURES_EXPANDED",inspection,plan,result};
}

export default {extractFeatureDelta,inspectFeatureEvolution,buildFeatureEvolutionPlan,validateFeatureEvolutionPlan,applyFeatureEvolution,persistFeatureEvolutionReport,runFeatureEvolutionLoop};
