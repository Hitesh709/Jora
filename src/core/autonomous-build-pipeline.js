export class AutonomousBuildPipeline {
  constructor({projectBuilder,testRunner,evaluator,runtimeVerifier=null,securityCouncil=null,benchmarkStore=null,maxRepairCycles=2}={}) {
    if(!projectBuilder||!testRunner||!evaluator) throw new Error("projectBuilder, testRunner and evaluator are required");
    this.projectBuilder=projectBuilder; this.testRunner=testRunner; this.evaluator=evaluator;
    this.runtimeVerifier=runtimeVerifier; this.securityCouncil=securityCouncil; this.benchmarkStore=benchmarkStore;
    this.maxRepairCycles=Math.max(0,Number(maxRepairCycles)||0);
  }

  async executeProject({request,specification,progress=null}) {
    progress?.({phase:"CODING",status:"RUNNING",message:"Generating project files"});
    const result=await this.projectBuilder.build({command:request.command,specification,context:request.context,progress});
    return {...result,status:"SUCCEEDED"};
  }

  async evaluateProject({request,specification,result,progress=null}) {
    // The browser request does not carry the internal workspace path.
    // Use the WorkspaceRepository root as the authoritative test directory.
    // Keep an explicit request workspace as an override for trusted callers.
    const workspace=request.context?.workspace ?? this.projectBuilder.repository?.root;
    if(!workspace) throw new Error("Generated project workspace is not available");

    let current=result;
    let tests=null;
    let repairHistory=[];
    const repairLimit=Number.isFinite(Number(request.context?.maxRepairCycles))
      ? Math.max(0,Number(request.context.maxRepairCycles))
      : this.maxRepairCycles;

    for(let cycle=0;;cycle++){
      progress?.({phase:"TESTING",status:"RUNNING",message:cycle===0?"Running generated project tests":"Running tests after repair",cycle});
      tests=await this.testRunner({cwd:workspace});

      if(tests?.ok) break;

      const existingProject=this.projectBuilder.repository?.snapshot
        ? {files:await this.projectBuilder.repository.snapshot()}
        : null;
      const failure={
        cycle,
        code:tests?.code??null,
        files:Array.isArray(tests?.files)?tests.files:[],
        stderr:String(tests?.stderr??"").slice(-12000),
        stdout:String(tests?.stdout??"").slice(-12000)
      };
      repairHistory.push(failure);

      if(cycle>=repairLimit || typeof this.projectBuilder.build!=="function"){
        progress?.({phase:"REPAIR_OR_PROMOTION",status:"REPAIR_LIMIT_REACHED",message:`Tests still failing after ${cycle} repair cycle(s)`});
        break;
      }

      progress?.({phase:"TESTING",status:"TEST_FAILED",message:"Generated project tests failed; preparing an autonomous repair",cycle});
      const diagnosis={
        diagnosis:"Generated project test suite failed",
        hypothesis:"The generated project contains an implementation or test/runtime defect exposed by the reported test output.",
        evidence:failure
      };
      progress?.({phase:"REPAIR_OR_PROMOTION",status:"REPAIR_RUNNING",message:`Repair cycle ${cycle+1} of ${repairLimit}`,cycle:cycle+1});

      current=await this.projectBuilder.build({
        command:request.command,
        specification,
        context:{
          ...(request.context||{}),
          cycle:cycle+2,
          repairFeedback:diagnosis,
          repairHistory
        },
        progress
      });
      progress?.({phase:"TESTING",status:"RETRY",message:"Repair written; rerunning generated project tests",cycle:cycle+1});
    }

    let runtime=null;
    if(tests?.ok && this.runtimeVerifier){
      progress?.({phase:"TESTING",status:"RUNTIME_RUNNING",message:"Starting the generated application for runtime verification"});
      runtime=await this.runtimeVerifier({cwd:workspace});
      if(!runtime?.ok){
        progress?.({phase:"TESTING",status:"RUNTIME_FAILED",message:"Generated application failed runtime verification"});
        if(repairHistory.length<repairLimit){
          const existingProject=this.projectBuilder.repository?.snapshot
            ? {files:await this.projectBuilder.repository.snapshot()}
            : null;
          progress?.({phase:"REPAIR_OR_PROMOTION",status:"REPAIR_RUNNING",message:`Repairing runtime failure (cycle ${repairHistory.length+1} of ${repairLimit})`});
          current=await this.projectBuilder.build({
            command:request.command,
            specification,
            context:{
              ...(request.context||{}),
              cycle:repairHistory.length+2,
              repairFeedback:{
                diagnosis:"Generated application failed runtime verification",
                hypothesis:"The application starts incorrectly, crashes during startup, or does not return a successful response at the expected root endpoint.",
                failingFiles:[],
                evidence:runtime
              },
              existingProject,
              repairHistory
            },
            progress
          });
          tests=await this.testRunner({cwd:workspace});
          if(tests?.ok) runtime=await this.runtimeVerifier({cwd:workspace});
        }
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
    const report={
      ...evaluation,
      tests,
      security,
      productionReady:evaluation.passed && (!this.runtimeVerifier || Boolean(runtime?.ok)),
      repairCycles:repairHistory.length,
      repairHistory,
      finalProject:current,\n      runtime
    };
    this.benchmarkStore?.record(report);
    progress?.({
      phase:"REPAIR_OR_PROMOTION",
      status:evaluation.passed && (!this.runtimeVerifier || Boolean(runtime?.ok))?"VERIFIED":"FAILED",
      message:evaluation.passed && (!this.runtimeVerifier || Boolean(runtime?.ok))
        ? `Project verified after ${repairHistory.length} repair cycle(s)`
        : `Project verification failed after ${repairHistory.length} repair cycle(s)`
    });
    return report;
  }
}
