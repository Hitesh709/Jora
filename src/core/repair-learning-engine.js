import fs from "node:fs/promises";
import path from "node:path";

const MEMORY_FILE=".jora/repair-memory.json";

export function createRepairMemory(seed={}){
  return {
    version:"1.0",
    cycles:0,
    outcomes:[],
    strategies:{},
    ...seed,
    strategies:{...(seed.strategies||{})},
    outcomes:Array.isArray(seed.outcomes)?seed.outcomes.slice(-50):[]
  };
}

function strategyKey(patch){
  return String(patch?.reason||patch?.operation||"unknown")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export function learnFromRepairCycle(memory,cycle){
  const next=createRepairMemory(memory);
  next.cycles++;
  const applied=(cycle?.applied||[]).filter(x=>x.applied);
  const repaired=Boolean(cycle?.repaired);
  for(const patch of cycle?.patches||[]){
    const key=strategyKey(patch);
    if(!next.strategies[key]) next.strategies[key]={attempts:0,successes:0,failures:0,lastUsed:null};
    const stat=next.strategies[key];
    stat.attempts++;
    if(repaired){stat.successes++;}else{stat.failures++;}
    stat.lastUsed=new Date().toISOString();
  }
  next.outcomes.push({
    cycle:next.cycles,
    repaired,
    applied:applied.length,
    failedChecks:cycle?.failedChecks||0,
    timestamp:new Date().toISOString()
  });
  next.outcomes=next.outcomes.slice(-50);
  return next;
}

export function rankRepairStrategies(memory,patches=[]){
  const m=createRepairMemory(memory);
  return [...patches].sort((a,b)=>{
    const sa=m.strategies[strategyKey(a)]||{attempts:0,successes:0};
    const sb=m.strategies[strategyKey(b)]||{attempts:0,successes:0};
    const score=s=>s.attempts?((s.successes+1)/(s.attempts+2)):0.5;
    return score(sb)-score(sa);
  });
}

export async function loadRepairMemory(root){
  try{
    const raw=await fs.readFile(path.join(root,MEMORY_FILE),"utf8");
    return createRepairMemory(JSON.parse(raw));
  }catch{
    return createRepairMemory();
  }
}

export async function saveRepairMemory(root,memory){
  const target=path.join(root,MEMORY_FILE);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,JSON.stringify(createRepairMemory(memory),null,2)+"\n","utf8");
  return target;
}
