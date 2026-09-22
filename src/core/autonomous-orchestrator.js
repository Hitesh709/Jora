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
import {runEngineeringIntelligence,persistEngineeringReport} from "./engineering-intelligence-engine.js";
import {runCodeReasoningRepairLoop} from "./code-reasoning-engine.js";
import {collectMultiFileCodeUnderstanding,persistCodeUnderstandingReport} from "./code-understanding-engine.js";
import {runArchitectureReasoningLoop} from "./architecture-reasoning-engine.js";

export function createOrchestrationState(command){
  return {version:"3.3",command,status:"READY",stage:"idle",history:[],startedAt:null,finishedAt:null};
}

function stage(state,name,status,details={}){
  state.stage=name;
  state.history.push({stage:name,status,at:new Date().toISOString(),...details});
}

export async function runAutonomousProject(command,{maxRepairAttempts=3}={}){
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
    let workspaceTests=await runWorkspaceTests(workspace.root);
    stage(state,"workspace",workspaceTests.passed?"COMPLETED":"FAILED",{root:workspace.root});
    if(!workspaceTests.passed) throw new Error("workspace tests failed: "+workspaceTests.stderr);

    stage(state,"test-repair","RUNNING");
    const failureRepair=await runFailureDrivenRepair(workspace.root,project.generation,{maxAttempts:maxRepairAttempts,runTests:runWorkspaceTests,readFiles:readWorkspaceFile});
    let verification=failureRepair.status==="REPAIRED"||failureRepair.result.passed
      ? {status:"REPAIRED",attempts:failureRepair.attempts,final:{passed:true},generation:project.generation}
      : testAndRepairGeneration(project.generation,{maxAttempts:maxRepairAttempts});
    stage(state,"test-repair",verification.status,{attempts:verification.attempts,workspaceAttempts:failureRepair.attempts});

    stage(state,"preview","RUNNING");
    let preview=await startWorkspacePreview(workspace.root);
    if(preview.status!=="PREVIEW_RUNNING"){
      stage(state,"preview","FAILED",{url:preview.url,health:preview.health});
      throw new Error("live preview failed: "+(preview.health?.error||preview.health?.body||"server did not become healthy"));
    }
    stage(state,"preview","COMPLETED",{url:preview.url,port:preview.port,healthStatus:preview.health.status});

    stage(state,"browser-verification","RUNNING");
    let browser=await verifyWorkspacePreview(preview.url);
    stage(state,"browser-verification",browser.status,{verified:browser.verified,consoleErrors:browser.consoleErrors?.length||0,pageErrors:browser.pageErrors?.length||0});
    if(browser.status==="BROWSER_FAILED"||browser.status==="BROWSER_UNAVAILABLE"){
      await stopWorkspacePreview(preview);
      throw new Error("browser verification failed: "+(browser.reason||browser.error||"browser checks did not pass"));
    }

    stage(state,"ai-test-generation","RUNNING");
    const scenarioPlan=compileScenarioPlan(project.blueprint);
    stage(state,"ai-test-generation","COMPLETED",{scenarios:scenarioPlan.scenarios.length});

    stage(state,"interaction-testing","RUNNING");
    let interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
    stage(state,"interaction-testing",interactions.status,{verified:interactions.verified,checks:interactions.checks?.length||0});
    if(interactions.status==="BROWSER_UNAVAILABLE"){
      await stopWorkspacePreview(preview);
      throw new Error("interaction testing failed: "+(interactions.error||"browser is unavailable"));
    }

    let engineeringIntelligence=runEngineeringIntelligence({
      command,
      blueprint:project.blueprint.projectBlueprint,
      generation:project.generation,
      workspaceTests,
      browserVerification:browser,
      interactions
    });
    await persistEngineeringReport(workspace.root,engineeringIntelligence);
    stage(state,"engineering-intelligence",engineeringIntelligence.status,{
      rootCause:engineeringIntelligence.diagnosis.rootCause,
      confidence:engineeringIntelligence.diagnosis.confidence,
      repairMode:engineeringIntelligence.diagnosis.repairMode,
      candidateTasks:engineeringIntelligence.diagnosis.candidateTasks?.length||0
    });

    let codeReasoning=null;
    let codeUnderstanding=null;
    let browserRepair=null;
    let architectureReasoning=null;

    codeUnderstanding=await collectMultiFileCodeUnderstanding(workspace.root,{
      workspaceTests,
      browserVerification:browser,
      interactions,
      engineeringIntelligence
    });
    await persistCodeUnderstandingReport(workspace.root,codeUnderstanding.report);
    stage(state,"code-understanding",codeUnderstanding.report.status,{scope:codeUnderstanding.report.reasoning.scope,connectedFiles:codeUnderstanding.report.connectedFiles.length,edges:codeUnderstanding.report.dependencyEdges.length});

    if(interactions.status==="INTERACTION_FAILED" && engineeringIntelligence.diagnosis.repairMode==="source-targeted"){
      stage(state,"code-reasoning","RUNNING");
      await stopWorkspacePreview(preview);

      codeReasoning=await runCodeReasoningRepairLoop(workspace.root,{
        command,
        blueprint:project.blueprint.projectBlueprint,
        generation:project.generation,
        workspaceTests,
        browserVerification:browser,
        interactions,
        engineeringIntelligence,
        maxAttempts:maxRepairAttempts,
        runTests:runWorkspaceTests,
        readFile:readWorkspaceFile
      });

      workspaceTests=codeReasoning.tests||await runWorkspaceTests(workspace.root);
      stage(state,"code-reasoning",codeReasoning.status,{
        repaired:codeReasoning.repaired,
        attempts:codeReasoning.attempts,
        strategy:codeReasoning.plan?.strategy||null,
        patches:codeReasoning.history?.filter(x=>x.applied?.applied).length||0
      });

      if(codeReasoning.repaired){
        preview=await startWorkspacePreview(workspace.root);
        if(preview.status!=="PREVIEW_RUNNING"){
          throw new Error("preview restart after source repair failed: "+(preview.health?.error||"server did not become healthy"));
        }
        browser=await verifyWorkspacePreview(preview.url);
        if(browser.status!=="BROWSER_VERIFIED"){
          stage(state,"browser-verification","FAILED",{after:"code-reasoning",reason:browser.reason||browser.error});
        }
        if(browser.status==="BROWSER_VERIFIED"){
          interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
        }else{
          interactions={status:"INTERACTION_FAILED",verified:false,error:"browser verification failed after source repair",checks:[]};
        }
        verification={
          ...verification,
          status:workspaceTests.passed?"REPAIRED":"FAILED",
          final:workspaceTests
        };
        if(interactions.status==="INTERACTION_VERIFIED"){
          engineeringIntelligence=runEngineeringIntelligence({
            command,
            blueprint:project.blueprint.projectBlueprint,
            generation:project.generation,
            workspaceTests,
            browserVerification:browser,
            interactions
          });
          await persistEngineeringReport(workspace.root,engineeringIntelligence);
        }
      }else{
        preview=await startWorkspacePreview(workspace.root);
        if(preview.status!=="PREVIEW_RUNNING") throw new Error("preview restart failed after rejected source repair");
        browser=await verifyWorkspacePreview(preview.url);
        if(browser.status!=="BROWSER_VERIFIED") throw new Error("browser verification failed after source reasoning");
        interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
      }
    }

    if(interactions.status==="INTERACTION_FAILED" && engineeringIntelligence.diagnosis.repairMode==="source-targeted" && codeUnderstanding.report.reasoning.scope==="multi-file"){
      stage(state,"architecture-reasoning","RUNNING");
      await stopWorkspacePreview(preview);
      architectureReasoning=await runArchitectureReasoningLoop(workspace.root,{
        command,
        blueprint:project.blueprint.projectBlueprint,
        generation:project.generation,
        workspaceTests,
        browserVerification:browser,
        interactions,
        engineeringIntelligence,
        codeUnderstanding,
        runTests:runWorkspaceTests
      });
      stage(state,"architecture-reasoning",architectureReasoning.status,{
        repaired:architectureReasoning.repaired,
        attempts:architectureReasoning.attempts,
        scope:architectureReasoning.scope,
        patches:architectureReasoning.plan?.patches?.length||0,
        rollback:architectureReasoning.transaction?.rollback?.length||0
      });
      preview=await startWorkspacePreview(workspace.root);
      if(preview.status!=="PREVIEW_RUNNING") throw new Error("preview restart after architecture reasoning failed");
      browser=await verifyWorkspacePreview(preview.url);
      if(browser.status==="BROWSER_VERIFIED"){
        interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
      }else{
        interactions={status:"INTERACTION_FAILED",verified:false,error:"browser verification failed after architecture reasoning",checks:[]};
      }
      workspaceTests=await runWorkspaceTests(workspace.root);
    }

    if(interactions.status==="INTERACTION_FAILED"){
      stage(state,"browser-repair","RUNNING");
      browserRepair=await runBrowserRepairLoop(workspace.root,scenarioPlan,{
        preview,
        maxAttempts:maxRepairAttempts,
        runTests:runWorkspaceTests,
        readFile:readWorkspaceFile,
        startPreview:startWorkspacePreview,
        stopPreview:stopWorkspacePreview,
        initialInteractions:interactions,
        engineeringIntelligence,
        codeReasoning,
        codeUnderstanding
      });
      interactions=browserRepair.interactions;
      browser=browserRepair.browser;
      stage(state,"browser-repair",browserRepair.status,{
        repaired:browserRepair.repaired,
        attempts:browserRepair.attempts,
        patches:browserRepair.history?.reduce((n,item)=>n+(item.applied?.filter(x=>x.applied).length||0),0)||0
      });
      if(browserRepair.status!=="BROWSER_REPAIRED"){
        await stopWorkspacePreview(browserRepair.preview||preview);
        throw new Error("browser self-healing failed: "+
          (interactions.error||
          interactions.checks?.find(x=>!x.passed)?.error||
          browserRepair.history?.at(-1)?.plan?.diagnosis?.failures?.[0]?.error||
          "functional UI checks did not pass"));
      }
      preview=browserRepair.preview;
    }

    stage(state,"interaction-testing","COMPLETED",{
      verified:interactions.verified,
      checks:interactions.checks?.length||0,
      repaired:Boolean(browserRepair?.repaired||codeReasoning?.repaired)
    });

    stage(state,"preview-promotion","RUNNING");
    const delivery=previewAndPromote(verification.generation,{...verification,browserVerification:browser,interactionTesting:interactions,browserRepair,codeReasoning,codeUnderstanding,architectureReasoning},{});

    delivery.preview.live=true;
    delivery.preview.url=preview.url;
    delivery.preview.health=preview.health;
    await stopWorkspacePreview(preview);
    stage(state,"preview-promotion",delivery.promotion.status,{preview:delivery.preview.status,url:preview.url});

    state.status=delivery.result.status==="PROMOTED"?"PROMOTED":"NOT_PROMOTED";
    state.workspace=workspace;
    state.preview={url:preview.url,health:preview.health,status:preview.status,browser,scenarioPlan,interactions,browserRepair,codeReasoning,codeUnderstanding,architectureReasoning,engineeringIntelligence};
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
