import fs from "node:fs/promises";
import path from "node:path";
import {collectMultiFileCodeUnderstanding} from "./code-understanding-engine.js";
import {runFeatureEvolutionLoop,persistFeatureEvolutionReport} from "./feature-evolution-engine.js";
import {runFeatureImplementationLoop,persistFeatureImplementationReport} from "./feature-implementation-engine.js";
import {runFeatureIntegrationLoop,persistFeatureIntegrationReport} from "./feature-integration-engine.js";

const VERSION="1.0";
const PROTECTED=[".git","node_modules",".jora/acceptance.json",".jora/requirements.json"];
const RULES=[
  ["search",/search|filter|find|lookup/],["authentication",/login|sign[ -]?in|signup|register|authentication|auth/],
  ["chat",/chat|messaging|message|conversation/],["commerce",/checkout|payment|cart|shop|store|ecommerce/],
  ["leaderboard",/leaderboard|ranking|high score/],["multiplayer",/multiplayer|real[ -]?time|online players/],
  ["booking",/booking|reservation|appointment/],["notifications",/notification|alert|reminder/],
  ["gameplay",/game|gameplay|level|enemy|player|score/]
];
const norm=p=>String(p||"").replace(/\\/g,"/").replace(/^\.\//,"");
const safe=p=>{p=norm(p);return Boolean(p&&!p.startsWith("/")&&!p.split("/").includes("..")&&!PROTECTED.some(x=>p===x||p.startsWith(x+"/")))};
const protectedPath=p=>PROTECTED.some(x=>norm(p)===x||norm(p).startsWith(x+"/"));
async function walk(root,current=root,out=[]){for(const e of await fs.readdir(current,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".git")continue;const a=path.join(current,e.name);if(e.isDirectory())await walk(root,a,out);else out.push(norm(path.relative(root,a)))}return out}
async function readIf(root,file){try{return await fs.readFile(path.join(root,file),"utf8")}catch{return null}}

export async function inspectExistingProject(root){
  const files=await walk(root), sourceFiles=files.filter(f=>/\.(js|mjs|cjs|ts|tsx|jsx|html|css)$/.test(f));
  const pkg=await readIf(root,"package.json"), html=await readIf(root,"src/index.html")||await readIf(root,"index.html")||"";
  const sources=[];for(const f of sourceFiles.slice(0,160)){const c=await readIf(root,f);if(c)sources.push({path:f,content:c})}
  const combined=sources.map(x=>x.content).join("\n");
  const routes=[...new Set([...combined.matchAll(/["'](\/(?:api\/)?[A-Za-z0-9_./:-]+)["']/g)].map(m=>m[1]))].sort();
  const features=[];for(const [f,re] of RULES)if(re.test(combined))features.push(f);
  let scripts={};if(pkg){try{scripts=JSON.parse(pkg).scripts||{}}catch{}}
  return {version:VERSION,root,files,sourceFiles,entrypoints:files.filter(f=>["src/index.js","index.js","src/index.html","index.html"].includes(f)),
    package:{present:Boolean(pkg),scripts},routes,features:[...new Set(features)],entities:[],tests:files.filter(f=>/(^|\/)tests?\//.test(f)||/\.test\.(js|mjs|cjs)$/.test(f)),
    ui:{htmlPresent:Boolean(html),featureMarkers:[...html.matchAll(/data-jora-feature="([^"]+)"/g)].map(m=>m[1])},
    api:{routeCount:routes.filter(x=>x.startsWith("/api/")).length},sourceCount:sourceFiles.length};
}
export function extractExistingProjectContract(i={}){return {version:VERSION,files:i.files||[],entrypoints:i.entrypoints||[],package:i.package||{present:false,scripts:{}},routes:i.routes||[],features:[...new Set(i.features||[])],entities:i.entities||[],tests:i.tests||[],ui:i.ui||{htmlPresent:false,featureMarkers:[]},api:i.api||{routeCount:0}}}
function requestedFeatures(input={}){
  const text=JSON.stringify({command:input.command||"",blueprint:input.blueprint||{},desiredFeatures:input.desiredFeatures||[]}).toLowerCase(),set=new Set((input.desiredFeatures||[]).filter(x=>typeof x==="string"));
  for(const [f,re] of RULES)if(re.test(text))set.add(f);return [...set].filter(f=>RULES.some(x=>x[0]===f));
}
export function diffRequirementsAgainstProject(input={}){
  const existing=new Set(input.existingContract?.features||[]),requested=requestedFeatures(input);
  const added=requested.filter(x=>!existing.has(x)),retained=requested.filter(x=>existing.has(x));
  const requestedRoutes=[...new Set((String(input.command||"").match(/\/api\/[A-Za-z0-9_./:-]+/g)||[]))],known=new Set(input.existingContract?.routes||[]);
  const missingRoutes=requestedRoutes.filter(x=>!known.has(x));
  return {version:VERSION,requested,existing:[...existing],added,retained,removed:[],missingRoutes,
    classifications:{features:added.length?"additive":"unchanged",routes:missingRoutes.length?"additive":"unchanged"},
    classification:added.length||missingRoutes.length?"additive":"no-change"};
}
export async function buildModificationImpactGraph(root,input={}){
  const understanding=await collectMultiFileCodeUnderstanding(root,input),connected=understanding.report?.connectedFiles||[];
  return {version:VERSION,targets:[...(input.diff?.added||[]),...(input.diff?.missingRoutes||[])],connectedFiles:connected,dependencyEdges:understanding.report?.dependencyEdges||[],scope:connected.length>1?"multi-file":connected.length===1?"single-file":"workspace",reasoning:understanding.report?.reasoning||null};
}
export function buildExistingProjectModificationPlan({diff={},impact={}}={}){
  const steps=[];if(diff.added?.length)steps.push({id:"feature-evolution",action:"reconcile-requested-features-with-existing-project"});
  if(diff.added?.length)steps.push({id:"feature-implementation",action:"implement-missing-features-in-existing-ui"});
  if(diff.added?.length||diff.missingRoutes?.length)steps.push({id:"feature-integration",action:"integrate-missing-cross-layer-contracts"});
  steps.push({id:"regression",action:"run-existing-project-regression-tests"});
  return {version:VERSION,strategy:steps.length>1?"existing-project-incremental-modification":"no-change",classification:diff.classification||"no-change",impactScope:impact.scope||"workspace",steps,preserve:["Existing features","Existing routes","Existing tests","Existing acceptance artifacts"],guardrails:["Modify only files justified by the request.","Never weaken existing tests or acceptance artifacts.","Use transactional rollback when regression fails.","Re-run regression before promotion."]};
}
export function validateExistingProjectModificationPlan(plan={}){const reasons=[];if(!Array.isArray(plan.steps))reasons.push("steps must be an array");for(const s of plan.steps||[])if(!s.id||!s.action)reasons.push("invalid step");return {valid:!reasons.length,reasons}}
async function snapshot(root){const files=await walk(root),map=new Map();for(const f of files){if(protectedPath(f))continue;const c=await readIf(root,f);if(c!==null)map.set(f,c)}return map}
async function restore(root,before){const now=await walk(root);for(const f of now)if(!protectedPath(f)&&!before.has(f))await fs.rm(path.join(root,f),{force:true});for(const [f,c] of before){const current=await readIf(root,f);if(current!==c){await fs.mkdir(path.dirname(path.join(root,f)),{recursive:true});await fs.writeFile(path.join(root,f),c,"utf8")}}}
export async function applyExistingProjectModifications(root,plan,{input={},runTests}={}){
  const validation=validateExistingProjectModificationPlan(plan);if(!validation.valid)return {status:"REJECTED",validation};
  const before=await snapshot(root),reports={};
  try{
    if(plan.steps.some(x=>x.id==="feature-evolution")){reports.featureEvolution=await runFeatureEvolutionLoop(root,{...input,desiredFeatures:input.diff?.requested||input.desiredFeatures||[],existingFeatures:input.existingContract?.features||[],runTests});await persistFeatureEvolutionReport(root,reports.featureEvolution);if(["ROLLED_BACK","REJECTED"].includes(reports.featureEvolution.status))throw new Error(reports.featureEvolution.result?.error||"feature evolution rejected")}
    if(plan.steps.some(x=>x.id==="feature-implementation")){reports.featureImplementation=await runFeatureImplementationLoop(root,{...input,desiredFeatures:input.diff?.requested||input.desiredFeatures||[],runTests});await persistFeatureImplementationReport(root,reports.featureImplementation);if(["ROLLED_BACK","REJECTED"].includes(reports.featureImplementation.status))throw new Error(reports.featureImplementation.result?.error||"feature implementation rejected")}
    if(plan.steps.some(x=>x.id==="feature-integration")){reports.featureIntegration=await runFeatureIntegrationLoop(root,{...input,desiredFeatures:input.diff?.requested||input.desiredFeatures||[],runTests});await persistFeatureIntegrationReport(root,reports.featureIntegration);if(["ROLLED_BACK","REJECTED"].includes(reports.featureIntegration.status))throw new Error(reports.featureIntegration.result?.error||"feature integration rejected")}
    const tests=typeof runTests==="function"?await runTests(root):null;if(tests&&!tests.passed)throw new Error("existing-project regression failed");
    return {status:"MODIFIED",modified:true,reports,tests};
  }catch(error){await restore(root,before);return {status:"ROLLED_BACK",modified:false,reports,error:error.message}}
}
export async function persistExistingProjectModificationReport(root,report){await fs.mkdir(path.join(root,".jora"),{recursive:true});await fs.writeFile(path.join(root,".jora","existing-project-modification.json"),JSON.stringify(report,null,2),"utf8");return report}
export async function runExistingProjectModificationLoop(root,input={}){
  if(!root)throw new Error("root is required");
  const inspection=await inspectExistingProject(root),existingContract=extractExistingProjectContract(inspection),diff=diffRequirementsAgainstProject({...input,existingContract}),impact=await buildModificationImpactGraph(root,{...input,diff}),plan=buildExistingProjectModificationPlan({diff,impact});
  if(!diff.added.length&&!diff.missingRoutes.length){const report={version:VERSION,status:"NO_MODIFICATION_NEEDED",modified:false,inspection,existingContract,diff,impact,plan};await persistExistingProjectModificationReport(root,report);return report}
  const result=await applyExistingProjectModifications(root,plan,{input:{...input,existingContract,diff},runTests:input.runTests}),report={version:VERSION,status:result.status,modified:result.modified,inspection,existingContract,diff,impact,plan,result};
  await persistExistingProjectModificationReport(root,report);return report;
}
export default {inspectExistingProject,extractExistingProjectContract,diffRequirementsAgainstProject,buildModificationImpactGraph,buildExistingProjectModificationPlan,validateExistingProjectModificationPlan,applyExistingProjectModifications,persistExistingProjectModificationReport,runExistingProjectModificationLoop};
