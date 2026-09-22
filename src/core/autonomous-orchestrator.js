import {generateUniversalProject} from "./universal-project-generator.js";
import {executeImplementationPlan} from "./execution-engine.js";
import {testAndRepairGeneration} from "./test-repair-engine.js";
import {previewAndPromote} from "./preview-promotion-engine.js";

export function createOrchestrationState(command){
  return {version:"2.0",command,status:"READY",stage:"idle",history:[],startedAt:null,finishedAt:null};
}

function stage(state,name,status,details={}){
  state.stage=name;
  state.history.push({stage:name,status,at:new Date().toISOString(),...details});
}

export function runAutonomousProject(command,{maxRepairAttempts=2}={}){
  if(!String(command||"").trim()) throw new Error("command is required");
  const state=createOrchestrationState(command);
  state.status="RUNNING";state.startedAt=new Date().toISOString();
  try{
    stage(state,"requirements","RUNNING");
    const project=generateUniversalProject(command);
    stage(state,"requirements","COMPLETED",{blueprintVersion:project.blueprint.projectBlueprint.version});

    stage(state,"planning","COMPLETED",{steps:project.blueprint.plan.steps.length});

    stage(state,"execution","RUNNING");
    const execution=executeImplementationPlan(project.blueprint.plan);
    if(execution.status!=="COMPLETED") throw new Error(execution.error||"execution failed");
    stage(state,"execution","COMPLETED",{completedSteps:execution.completedSteps.length});

    stage(state,"test-repair","RUNNING");
    const verification=testAndRepairGeneration(project.generation,{maxAttempts:maxRepairAttempts});
    stage(state,"test-repair",verification.status,{attempts:verification.attempts});

    stage(state,"preview-promotion","RUNNING");
    const delivery=previewAndPromote(verification.generation,verification,{});
    stage(state,"preview-promotion",delivery.promotion.status,{preview:delivery.preview.status});

    state.status=delivery.result.status==="PROMOTED"?"PROMOTED":"NOT_PROMOTED";
    state.stage="complete";state.finishedAt=new Date().toISOString();
    return {state,project,execution,verification,delivery};
  }catch(error){
    state.status="FAILED";state.error=error.message;state.finishedAt=new Date().toISOString();
    return {state};
  }
}

export function summarizeOrchestration(result){
  const s=result?.state;
  return {status:s?.status||"UNKNOWN",stage:s?.stage||"unknown",stages:s?.history?.map(x=>({stage:x.stage,status:x.status}))||[],projectName:result?.project?.name||null};
}
