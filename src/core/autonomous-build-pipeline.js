export class AutonomousBuildPipeline {
  constructor({projectBuilder,testRunner,evaluator,securityCouncil=null,benchmarkStore=null}={}) {
    if(!projectBuilder||!testRunner||!evaluator) throw new Error("projectBuilder, testRunner and evaluator are required");
    this.projectBuilder=projectBuilder; this.testRunner=testRunner; this.evaluator=evaluator;
    this.securityCouncil=securityCouncil; this.benchmarkStore=benchmarkStore;
  }
  async executeProject({request,specification}) {
    const result=await this.projectBuilder.build({command:request.command,specification,context:request.context});
    return {...result,status:"SUCCEEDED"};
  }
  async evaluateProject({request,specification,result}) {
    // The browser request context does not carry the internal workspace path.\n    // The generated project is written through the same WorkspaceRepository, so\n    // use its root as the authoritative test working directory. Keep an explicit\n    // request workspace as an override for callers that intentionally provide one.\n    const workspace=request.context?.workspace ?? this.projectBuilder.repository?.root;\n    const tests=await this.testRunner({cwd:workspace});
    const security=this.securityCouncil
      ? await this.securityCouncil.review({command:request.command,context:request.context,project:result})
      : {passed:true,reports:[]};
    const evaluation=this.evaluator.evaluate({
      testsPassed:tests.ok,
      securityPassed:security.passed,
      benchmarkScore:tests.ok&&security.passed?1:0,
      qualityScore:tests.ok&&security.passed?1:0
    });
    const report={...evaluation,tests,security,productionReady:evaluation.passed};
    this.benchmarkStore?.record(report);
    return report;
  }
}
