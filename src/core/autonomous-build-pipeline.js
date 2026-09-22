export class AutonomousBuildPipeline {
  constructor({projectBuilder,testRunner,evaluator,runtimeVerifier=null,interactionVerifier=null,securityCouncil=null,benchmarkStore=null,maxRepairCycles=2}={}) {
    if(!projectBuilder||!testRunner||!evaluator) throw new Error("projectBuilder, testRunner and evaluator are required");
    this.projectBuilder=projectBuilder; this.testRunner=testRunner; this.evaluator=evaluator;
    this.runtimeVerifier=runtimeVerifier; this.interactionVerifier=interactionVerifier;
    this.securityCouncil=securityCouncil; this.benchmarkStore=benchmarkStore;
    this.maxRepairCycles=Math.max(0,Number(maxRepairCycles)||0);
  }

  async executeProject({request,specification,progress=null}) {
    progress?.({phase:"CODING",status:"RUNNING",message:"Generating project files"});
    const result=await this.projectBuilder.build({command:request.command,specification,context:request.context,progress});
    return {...result,status:"SUCCEEDED"};
  }

  async evaluateProject({request,specification,result,progress=null}) {
    const workspace=request.context?.workspace
      ?? this.projectBuilder.repository?.root
      ?? process.cwd();

    let current=result;
    let tests=null;
    let runtime=null;
    let interaction=null;
    let repairHistory=[];
    const repairLimit=Number.isFinite(Number(request.context?.maxRepairCycles))
      ? Math.max(0,Number(request.context.maxRepairCycles))
      : this.maxRepairCycles;

    const repair=async({diagnosis,hypothesis,evidence,failingFiles=[]}={})=>{
      const existingProject=this.projectBuilder.repository?.snapshot
        ? {files:await this.projectBuilder.repository.snapshot()}
        : null;
      const cycle=repairHistory.length+1;
      progress?.({phase:"REPAIR_OR_PROMOTION",status:"REPAIR_RUNNING",message:`Repair cycle ${cycle} of ${repairLimit}`,cycle});
      repairHistory.push({cycle,diagnosis,hypothesis,evidence,failingFiles});
      current=await this.projectBuilder.build({
        command:request.command,
        specification,
        context:{
          ...(request.context||{}),
          cycle:cycle+1,
          repairFeedback:{diagnosis,hypothesis,evidence,failingFiles},
          repairHistory,
          existingProject
        },
        progress
      });
    };

    for(let cycle=0;;cycle++){
      progress?.({phase:"TESTING",status:"RUNNING",message:cycle===0?"Running generated project tests":"Running tests after repair",cycle});
      tests=await this.testRunner({cwd:workspace});
      if(tests?.ok) break;

      const failure={
        cycle,
        code:tests?.code??null,
        files:Array.isArray(tests?.files)?tests.files:[],
        stderr:String(tests?.stderr??"").slice(-12000),
        stdout:String(tests?.stdout??"").slice(-12000)
      };

      if(repairHistory.length>=repairLimit){
        progress?.({phase:"REPAIR_OR_PROMOTION",status:"REPAIR_LIMIT_REACHED",message:`Tests still failing after ${repairHistory.length} repair cycle(s)`});
        break;
      }

      progress?.({phase:"TESTING",status:"TEST_FAILED",message:"Generated project tests failed; preparing an autonomous repair",cycle});
      await repair({
        diagnosis:"Generated project test suite failed",
        hypothesis:"The generated project contains an implementation or test/runtime defect exposed by the reported test output.",
        evidence:failure,
        failingFiles:failure.files
      });
      progress?.({phase:"TESTING",status:"RETRY",message:"Repair written; rerunning generated project tests",cycle:cycle+1});
    }

    if(tests?.ok && this.runtimeVerifier){
      progress?.({phase:"TESTING",status:"RUNTIME_RUNNING",message:"Starting the generated application for runtime verification"});
      runtime=await this.runtimeVerifier({cwd:workspace});
      if(!runtime?.ok && repairHistory.length<repairLimit){
        progress?.({phase:"TESTING",status:"RUNTIME_FAILED",message:"Generated application failed runtime verification"});
        await repair({
          diagnosis:"Generated application failed runtime verification",
          hypothesis:"The application starts incorrectly, crashes during startup, or does not return a successful response at the expected root endpoint.",
          evidence:runtime
        });
        tests=await this.testRunner({cwd:workspace});
        if(tests?.ok) runtime=await this.runtimeVerifier({cwd:workspace});
      }
    }

    if(tests?.ok && runtime?.ok && this.interactionVerifier){
      progress?.({phase:"TESTING",status:"INTERACTION_RUNNING",message:"Checking the generated application's interactive surface"});
      interaction=await this.interactionVerifier({cwd:workspace,command:request.command,specification});
      if(!interaction?.ok){
        progress?.({phase:"TESTING",status:"INTERACTION_FAILED",message:"Interactive verification found a product-surface defect"});
        if(repairHistory.length<repairLimit){
          await repair({
            diagnosis:"Generated application failed interactive verification",
            hypothesis:"The live application does not expose the interactive controls or game surface expected for the requested product.",
            evidence:interaction
          });
          tests=await this.testRunner({cwd:workspace});
          if(tests?.ok && this.runtimeVerifier) runtime=await this.runtimeVerifier({cwd:workspace});
          if(tests?.ok && runtime?.ok) interaction=await this.interactionVerifier({cwd:workspace,command:request.command,specification});
        }
      } else {
        progress?.({phase:"TESTING",status:"INTERACTION_VERIFIED",message:"Interactive application surface verified"});
      }
    }

    const security=this.securityCouncil
      ? await this.securityCouncil.review({command:request.command,context:request.context,project:current})
      : {passed:true,reports:[]};

    const evaluation=this.evaluator.evaluate({
      testsPassed:Boolean(tests?.ok),
      securityPassed:Boolean(security?.passed),
      benchmarkScore:tests?.ok&&security?.passed?1:0,
      qualityScore:tests?.ok&&security?.passed?1:0
    });

    const verifiedRuntime=!this.runtimeVerifier || Boolean(runtime?.ok);
    const verifiedInteraction=!this.interactionVerifier || Boolean(interaction?.ok);
    const passed=evaluation.passed&&verifiedRuntime&&verifiedInteraction;

    const report={
      ...evaluation,
      passed,
      tests,
      security,
      runtime,
      interaction,
      productionReady:passed,
      repairCycles:repairHistory.length,
      repairHistory,
      finalProject:current
    };

    this.benchmarkStore?.record(report);
    progress?.({
      phase:"REPAIR_OR_PROMOTION",
      status:passed?"VERIFIED":"FAILED",
      message:passed
        ? `Project verified after ${repairHistory.length} repair cycle(s)`
        : `Project verification failed after ${repairHistory.length} repair cycle(s)`
    });
    return report;
  }
}
