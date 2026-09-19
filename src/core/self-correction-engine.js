export class SelfCorrectionEngine {
  constructor(){this.version="1.57.0";}
  correct({verification,assignments=[]}={}){
    const failures=verification?.failedTaskIds||[];
    const corrections=failures.map(id=>{const t=assignments.find(x=>x.id===id);return{taskId:id,action:"RETRY_WITH_DIAGNOSIS",attempt:1,reason:"verification failure",specialist:t?.assignment?.specialist||t?.specialist||"full-stack-engineer"};});
    return {accepted:true,status:corrections.length?"CORRECTIONS_PLANNED":"NO_CORRECTIONS_REQUIRED",version:this.version,corrections};
  }
}
