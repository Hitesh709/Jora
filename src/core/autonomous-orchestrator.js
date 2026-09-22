import {generateUniversalProject} from "./universal-project-generator.js";
import {executeImplementationPlan} from "./execution-engine.js";
import {testAndRepairGeneration} from "./test-repair-engine.js";
import {previewAndPromote} from "./preview-promotion-engine.js";
import {materializeGeneration,runWorkspaceTests,readWorkspaceFile,startWorkspacePreview,stopWorkspacePreview} from "./workspace-engine.js";
import {runFailureDrivenRepair} from "./failure-repair-engine.js";
import {verifyWorkspacePreview} from "./browser-verification-engine.js";
import {runInteractionTests} from "./interaction-testing-engine.js";
import {compileScenarioPlan} from "./ai-test-generation-engine.js";
import {runBrowserRepairLoop} from "./browser-repair-engine.js";

export function createOrchestrationState(command){
  return {version:"2.1",command,status:"READY",stage:"idle",history:[],startedAt:null,finishedAt:null};
}

function stage(state,name,status,details={}){
  state.stage=name;
  state.history.push({stage:name,status,at:new Date().toISOString(),...details});
}

export async function runAutonomousProject(command,{maxRepairAttempts=2}={}){
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

    stage(state,"workspace","RUNNING");
    const workspace=await materializeGeneration(project.generation);
    const workspaceTests=await runWorkspaceTests(workspace.root);
    stage(state,"workspace",workspaceTests.passed?"COMPLETED":"FAILED",{root:workspace.root});
    if(!workspaceTests.passed) throw new Error("workspace tests failed: "+workspaceTests.stderr);

    stage(state,"test-repair","RUNNING");
    const failureRepair=await runFailureDrivenRepair(workspace.root,project.generation,{maxAttempts:maxRepairAttempts,runTests:runWorkspaceTests,readFiles:readWorkspaceFile});
    const verification=failureRepair.status==="REPAIRED"||failureRepair.result.passed
      ? {status:"REPAIRED",attempts:failureRepair.attempts,final:{passed:true},generation:project.generation}
      : testAndRepairGeneration(project.generation,{maxAttempts:maxRepairAttempts});
    stage(state,"test-repair",verification.status,{attempts:verification.attempts,workspaceAttempts:failureRepair.attempts});

    stage(state,"preview","RUNNING");
    const preview=await startWorkspacePreview(workspace.root);
    if(preview.status!=="PREVIEW_RUNNING"){
      stage(state,"preview","FAILED",{url:preview.url,health:preview.health});
      throw new Error("live preview failed: "+(preview.health?.error||preview.health?.body||"server did not become healthy"));
    }
    stage(state,"preview","COMPLETED",{url:preview.url,port:preview.port,healthStatus:preview.health.status});

    stage(state,"browser-verification","RUNNING");
    const browser=await verifyWorkspacePreview(preview.url);
    stage(state,"browser-verification",browser.status,{verified:browser.verified,consoleErrors:browser.consoleErrors?.length||0,pageErrors:browser.pageErrors?.length||0});
    if(browser.status==="BROWSER_FAILED"||browser.status==="BROWSER_UNAVAILABLE"){
      await stopWorkspacePreview(preview);
      throw new Error("browser verification failed: "+(browser.reason||browser.error||"browser checks did not pass"));
    }

    stage(state,"ai-test-generation","RUNNING");
    const scenarioPlan=compileScenarioPlan(project.blueprint);
    stage(state,"ai-test-generation","COMPLETED",{scenarios:scenarioPlan.scenarios.length});
    
    stage(state,"interaction-testing","RUNNING");
    const interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
    stage(state,"interaction-testing",interactions.status,{verified:interactions.verified,checks:interactions.checks?.length||0});
    if(interactions.status==="INTERACTION_FAILED"||interactions.status==="BROWSER_UNAVAILABLE"){
      await stopWorkspacePreview(preview);
      throw new Error("interaction testing failed: "+(interactions.error||interactions.checks?.find(x=>!x.passed)?.error||"functional UI checks did not pass"));
    }

    stage(state,"preview-promotion","RUNNING");
    const delivery=previewAndPromote(verification.generation,{...verification,browserVerification:browser,interactionTesting:interactions},{});
    delivery.preview.live=true;
    delivery.preview.url=preview.url;
    delivery.preview.health=preview.health;
    if(delivery.promotion.status!=="PROMOTION_APPROVED") await stopWorkspacePreview(preview);
    else await stopWorkspacePreview(preview);
    stage(state,"preview-promotion",delivery.promotion.status,{preview:delivery.preview.status,url:preview.url});

    state.status=delivery.result.status==="PROMOTED"?"PROMOTED":"NOT_PROMOTED";
    state.workspace=workspace;
    state.preview={url:preview.url,health:preview.health,status:preview.status,browser,scenarioPlan,interactions};
    state.stage="complete";state.finishedAt=new Date().toISOString();
    return {state,project,execution,verification,delivery};
  }catch(error){
    state.status="FAILED";state.error=error.message;state.finishedAt=new Date().toISOString();
    return {state};
  }
}

export function summarizeOrchestration(result){
  const s=result?.state;
  return {status:s?.status||"UNKNOWN",stage:s?.stage||"unknown",stages:s?.history?.map(x=>({stage:x.stage,status:x.status}))||[],projectName:result?.project?.name||null,previewUrl:s?.preview?.url||null};
}
