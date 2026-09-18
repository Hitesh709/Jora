export class AutonomousBuildPipeline {
  constructor({projectBuilder,testRunner,evaluator}){if(!projectBuilder||!testRunner||!evaluator) throw new Error("projectBuilder, testRunner and evaluator are required"); this.projectBuilder=projectBuilder; this.testRunner=testRunner; this.evaluator=evaluator;}
  async executeProject({request,specification}) {
    const result=await this.projectBuilder.build({command:request.command,specification,context:request.context});
    return {...result,status:"SUCCEEDED"};
  }
  async evaluateProject({request,specification,result}) {
    const tests=await this.testRunner({cwd:request.context?.workspace});
    return this.evaluator.evaluate({testsPassed:tests.ok,securityPassed:true,benchmarkScore:tests.ok?1:0,qualityScore:tests.ok?1:0});
  }
}
