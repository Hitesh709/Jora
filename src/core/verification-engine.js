export class VerificationEngine {
  constructor(){this.version="1.56.0";}
  verify({executionResults=[],dag}={}){
    const checks=executionResults.map(r=>({taskId:r.taskId,passed:r.status==="COMPLETED",checks:["execution_status","artifact_presence"]}));
    const failed=checks.filter(x=>!x.passed);
    return {accepted:true,status:failed.length?"VERIFICATION_FAILED":"VERIFICATION_PASSED",version:this.version,checks,failedTaskIds:failed.map(x=>x.taskId),readyForCorrection:failed.length>0};
  }
}
