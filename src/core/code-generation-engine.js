function artifact(path,taskId,operation,content,description){return {path,taskId,operation,content,description};}

export function generateTaskArtifacts(blueprint,plan,baseFiles=[]){
  const files=[...baseFiles];
  const add=(path,taskId,operation,content,description)=>files.push(artifact(path,taskId,operation,content,description));
  for(const step of plan.steps){
    if(step.id==="01-analyze") add(".jora/requirements.json",step.id,"create",JSON.stringify({product:blueprint.product,roles:blueprint.roles,flows:blueprint.flows,features:blueprint.features,platform:blueprint.platform,constraints:blueprint.constraints},null,2),"Machine-readable requirements extracted by Jora.");
    else if(step.id==="03-data") add(".jora/data-model.json",step.id,"create",JSON.stringify({entities:blueprint.entities},null,2),"Machine-readable data model.");
    else if(step.id==="04-shell") add(".jora/ui-contract.json",step.id,"create",JSON.stringify({screens:blueprint.screens,platform:blueprint.platform},null,2),"UI contract consumed by generators.");
    else if(step.id==="07-api") add(".jora/api-contract.json",step.id,"create",JSON.stringify({style:blueprint.api,endpoints:["health","capabilities"]},null,2),"API contract for backend generation.");
    else if(step.id==="08-integrations") add(".jora/integrations.json",step.id,"create",JSON.stringify({integrations:blueprint.integrations},null,2),"Integration manifest; secrets are never embedded.");
    else if(step.id==="09-gameplay") add(".jora/gameplay.json",step.id,"create",JSON.stringify({gameType:blueprint.gameType,platform:blueprint.platform},null,2),"Game-specific generation contract.");
    else if(step.id==="10-verify") add(".jora/acceptance.json",step.id,"create",JSON.stringify({criteria:blueprint.acceptanceCriteria},null,2),"Acceptance criteria for verification.");
  }
  add(".jora/plan.json","PLAN","create",JSON.stringify(plan,null,2),"Executable planner output.");
  add(".jora/generation-manifest.json","MANIFEST","create",JSON.stringify({version:"1.0",strategy:"task-to-code",tasks:plan.steps.map(s=>({id:s.id,title:s.title,type:s.type,outputs:files.filter(f=>f.taskId===s.id).map(f=>f.path)})),files:files.map(f=>f.path)},null,2),"Traceability manifest connecting plan tasks to generated files.");
  return files;
}

export function compilePlanToCode(blueprint,plan,baseFiles=[]){
  const files=generateTaskArtifacts(blueprint,plan,baseFiles);
  return {strategy:"task-to-code",version:"1.0",files,taskMap:plan.steps.map(step=>({taskId:step.id,title:step.title,type:step.type,outputs:files.filter(f=>f.taskId===step.id).map(f=>f.path),status:"generated"}))};
}

export class CodeGenerationEngine{
  constructor(){this.version="1.0";}
  generate({blueprint,plan,baseFiles=[]}={}){if(!blueprint||!plan)throw new Error("blueprint and plan are required");return compilePlanToCode(blueprint,plan,baseFiles);}
}
