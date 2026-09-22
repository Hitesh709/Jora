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
import {runArchitectureGenerationLoop,persistArchitectureGenerationReport} from "./architecture-generation-engine.js";
import {runFeatureEvolutionLoop,persistFeatureEvolutionReport} from "./feature-evolution-engine.js";
import {runFeatureImplementationLoop,persistFeatureImplementationReport} from "./feature-implementation-engine.js";
import {runFeatureIntegrationLoop,persistFeatureIntegrationReport} from "./feature-integration-engine.js";
import {runExistingProjectModificationLoop} from "./existing-project-modification-engine.js";
import {initializeProjectLifecycle,transitionProjectLifecycle} from "./project-lifecycle-engine.js";
import {initializeMissionManager,startNextMission,completeMission,failMission,loadMissionState} from "./mission-manager-engine.js";

export function createOrchestrationState(command){
  return {version:"3.9",command,status:"READY",stage:"idle",history:[],startedAt:null,finishedAt:null};
}

function stage(state,name,status,details={}){
  state.stage=name;
  state.history.push({stage:name,status,at:new Date().toISOString(),...details});
}

export async function runAutonomousProject(command,{maxRepairAttempts=3}={}){
  if(!String(command||"").trim()) throw new Error("command is required");
  const state=createOrchestrationState(command);
  state.status="RUNNING";state.startedAt=new Date().toISOString();
  let lifecycleRoot=null;
  let lifecycleContract=null;
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
    lifecycleRoot=workspace.root;
    lifecycleContract={...project.blueprint.projectBlueprint,entrypoints:["src/index.js","src/index.html"]};
    await initializeProjectLifecycle(workspace.root,{contract:lifecycleContract,command,projectName:project.blueprint.name||project.blueprint.projectBlueprint?.product?.name||"jora-project"});
    await initializeMissionManager(workspace.root,{command,contract:lifecycleContract,features:project.blueprint.projectBlueprint.features||[]});
    await transitionProjectLifecycle(workspace.root,"active",{command,contract:lifecycleContract,phase:"generation",status:"ACTIVE",summary:"Generated project workspace is active."});
    let workspaceTests=await runWorkspaceTests(workspace.root);
    await startNextMission(workspace.root);
    await completeMission(workspace.root,"M001",{summary:"Requirements and initial project workspace are ready."});
    await startNextMission(workspace.root);
    await completeMission(workspace.root,"M002",{summary:"Initial project architecture and contracts are established."});
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
    let architectureGeneration=null;
    let featureEvolution=null;
    let featureImplementation=null;
    let featureIntegration=null;

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

    stage(state,"feature-evolution","RUNNING");
    featureEvolution=await runFeatureEvolutionLoop(workspace.root,{
      command,
      blueprint:project.blueprint.projectBlueprint,
      desiredFeatures:project.blueprint.projectBlueprint.features||[],
      existingFeatures:project.blueprint.projectBlueprint.features||[],
      runTests:runWorkspaceTests
    });
    await persistFeatureEvolutionReport(workspace.root,featureEvolution);
    stage(state,"feature-evolution",featureEvolution.status,{
      expanded:featureEvolution.expanded,
      added:featureEvolution.inspection?.delta?.added?.length||0,
      created:featureEvolution.result?.created?.length||0
    });

    stage(state,"feature-implementation","RUNNING");
    await stopWorkspacePreview(preview);
    featureImplementation=await runFeatureImplementationLoop(workspace.root,{
      command,
      blueprint:project.blueprint.projectBlueprint,
      desiredFeatures:project.blueprint.projectBlueprint.features||[],
      runTests:runWorkspaceTests
    });
    await persistFeatureImplementationReport(workspace.root,featureImplementation);
    stage(state,"feature-implementation",featureImplementation.status,{
      implemented:featureImplementation.implemented,
      features:featureImplementation.result?.features||featureImplementation.plan?.tests||[],
      patched:featureImplementation.result?.patched||false
    });
    if(featureImplementation.status==="ROLLED_BACK"||featureImplementation.status==="REJECTED"){
      throw new Error("feature implementation failed: "+(featureImplementation.result?.error||"implementation was rejected"));
    }
    if(featureImplementation.implemented){
      workspaceTests=await runWorkspaceTests(workspace.root);
      if(!workspaceTests.passed)throw new Error("workspace tests failed after feature implementation: "+workspaceTests.stderr);
      preview=await startWorkspacePreview(workspace.root);
      if(preview.status!=="PREVIEW_RUNNING")throw new Error("preview restart after feature implementation failed");
      browser=await verifyWorkspacePreview(preview.url);
      if(browser.status!=="BROWSER_VERIFIED")throw new Error("browser verification failed after feature implementation: "+(browser.reason||browser.error||"verification failed"));
      interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});
      if(interactions.status==="BROWSER_UNAVAILABLE")throw new Error("interaction testing unavailable after feature implementation");
    }else{
      preview=await startWorkspacePreview(workspace.root);
      if(preview.status!=="PREVIEW_RUNNING")throw new Error("preview restart after feature analysis failed");
    }

    stage(state,"feature-integration","RUNNING");
    await stopWorkspacePreview(preview);
    featureIntegration=await runFeatureIntegrationLoop(workspace.root,{
      command,
      blueprint:project.blueprint.projectBlueprint,
      desiredFeatures:project.blueprint.projectBlueprint.features||[],
      runTests:runWorkspaceTests
    });
    await persistFeatureIntegrationReport(workspace.root,featureIntegration);
    stage(state,"feature-integration",featureIntegration.status,{
      integrated:featureIntegration.integrated,
      features:featureIntegration.inspection?.features||[],
      patched:featureIntegration.result?.patched?.length||0,
      created:featureIntegration.result?.created?.length||0
    });
    if(featureIntegration.status==="ROLLED_BACK"||featureIntegration.status==="REJECTED"){
      throw new Error("feature integration failed: "+(featureIntegration.result?.error||"integration was rejected"));
    }
    if(featureIntegration.integrated){
      workspaceTests=await runWorkspaceTests(workspace.root);
      if(!workspaceTests.passed)throw new Error("workspace tests failed after feature integration: "+workspaceTests.stderr);
    }
    preview=await startWorkspacePreview(workspace.root);
    if(preview.status!=="PREVIEW_RUNNING")throw new Error("preview restart after feature integration failed");
    browser=await verifyWorkspacePreview(preview.url);
    if(browser.status!=="BROWSER_VERIFIED")throw new Error("browser verification failed after feature integration: "+(browser.reason||browser.error||"verification failed"));
    interactions=await runInteractionTests(preview.url,{tests:scenarioPlan.scenarios});

    stage(state,"architecture-generation","RUNNING");
    architectureGeneration=await runArchitectureGenerationLoop(workspace.root,{
      blueprint:project.blueprint.projectBlueprint,
      runTests:runWorkspaceTests
    });
    await persistArchitectureGenerationReport(workspace.root,architectureGeneration);
    const missionStateAfterArchitecture=await loadMissionState(workspace.root);
    const coreMission=missionStateAfterArchitecture?.missions?.find(m=>m.kind==="implementation"&&m.id==="M003");
    if(coreMission&&coreMission.status!=="completed") await completeMission(workspace.root,coreMission.id,{summary:"Core product implementation completed."});
    stage(state,"architecture-generation",architectureGeneration.status,{
      generated:architectureGeneration.generated,
      created:architectureGeneration.result?.created?.length||0,
      refactorCandidates:architectureGeneration.plan?.refactors?.length||0
    });

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
    const missionStateAfterFeatures=await loadMissionState(workspace.root);
    for(const mission of (missionStateAfterFeatures?.missions||[]).filter(m=>m.kind==="feature"&&m.status!=="completed")) await completeMission(workspace.root,mission.id,{summary:"Feature implementation and integration completed."});

    stage(state,"preview-promotion","RUNNING");
    const missionStateBeforeVerification=await loadMissionState(workspace.root);
    const verificationMission=missionStateBeforeVerification?.missions?.find(m=>m.kind==="verification"&&m.status!=="completed");
    if(verificationMission){
      await startNextMission(workspace.root,{missionId:verificationMission.id});
      await completeMission(workspace.root,verificationMission.id,{summary:"Workspace, browser, interaction, and repair verification completed."});
    }
    await transitionProjectLifecycle(workspace.root,"verifying",{command,contract:lifecycleContract,phase:"promotion",status:"VERIFYING",summary:"All engineering stages completed; promotion gates are being evaluated."});
    const delivery=previewAndPromote(verification.generation,{...verification,browserVerification:browser,interactionTesting:interactions,browserRepair,codeReasoning,codeUnderstanding,architectureReasoning,architectureGeneration,featureEvolution,featureImplementation,featureIntegration},{});

    delivery.preview.live=true;
    delivery.preview.url=preview.url;
    delivery.preview.health=preview.health;
    await stopWorkspacePreview(preview);
    stage(state,"preview-promotion",delivery.promotion.status,{preview:delivery.preview.status,url:preview.url});

    state.status=delivery.result.status==="PROMOTED"?"PROMOTED":"NOT_PROMOTED";
    const missionStateBeforeDelivery=await loadMissionState(workspace.root);
    const deliveryMission=missionStateBeforeDelivery?.missions?.find(m=>m.kind==="delivery"&&m.status!=="completed");
    if(deliveryMission&&delivery.result.status==="PROMOTED"){
      await startNextMission(workspace.root,{missionId:deliveryMission.id});
      await completeMission(workspace.root,deliveryMission.id,{summary:"Promotion gate completed successfully."});
    }
    await transitionProjectLifecycle(workspace.root,delivery.result.status==="PROMOTED"?"promoted":"failed",{command,contract:lifecycleContract,phase:"delivery",status:delivery.result.status,summary:delivery.result.status==="PROMOTED"?"Project passed promotion and was promoted.":"Project did not pass promotion gates.",changes:[delivery.result.status]});
    state.workspace=workspace;
    state.preview={url:preview.url,health:preview.health,status:preview.status,browser,scenarioPlan,interactions,browserRepair,codeReasoning,codeUnderstanding,architectureReasoning,architectureGeneration,featureEvolution,featureImplementation,featureIntegration,engineeringIntelligence};
    state.stage="complete";state.finishedAt=new Date().toISOString();
    return {state,project,execution,verification,delivery};
  }catch(error){
    state.status="FAILED";state.error=error.message;
    if(lifecycleRoot){
      try{await transitionProjectLifecycle(lifecycleRoot,"failed",{command,contract:lifecycleContract,phase:state.stage||"failure",status:"FAILED",summary:error.message,changes:[state.stage||"unknown"]});}catch{}
      try{const ms=await loadMissionState(lifecycleRoot);if(ms?.currentMissionId)await failMission(lifecycleRoot,ms.currentMissionId,{error:error.message,retryable:true});}catch{}
    }
    state.finishedAt=new Date().toISOString();
    return {state};
  }
}

export function summarizeOrchestration(result){
  const s=result?.state;
  return {status:s?.status||"UNKNOWN",stage:s?.stage||"unknown",stages:s?.history?.map(x=>({stage:x.stage,status:x.status}))||[],projectName:result?.project?.name||null,previewUrl:s?.preview?.url||null};
}


export async function runAutonomousExistingProject(root,command,{runTests=runWorkspaceTests}={}) {
  if(!String(root||"").trim()) throw new Error("root is required");
  if(!String(command||"").trim()) throw new Error("command is required");
  return runExistingProjectModificationLoop(root,{command,runTests});
}
