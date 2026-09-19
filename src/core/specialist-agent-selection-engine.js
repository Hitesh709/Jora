export class SpecialistAgentSelectionEngine {
  constructor(){this.version="1.54.0";this.roles={
    "product-manager":["requirements","ambiguity","acceptance"],
    architect:["architecture","contracts","design"],
    "full-stack-engineer":["implementation","api","frontend","backend"],
    "qa-engineer":["test","verification","acceptance"],
    "sre-engineer":["observability","reliability","monitoring"],
    "devops-engineer":["deployment","release","infrastructure"]
  };}
  select({dag}={}){
    if(!dag?.nodes?.length) throw new Error("dag.nodes is required");
    const assignments=dag.nodes.map(t=>{
      const specialist=t.specialist||this._infer(t);
      return {...t,assignment:{specialist,capabilities:this.roles[specialist]||["general-software-engineering"],reason:"task requirements and component role",agentContract:{input:t.inputs,output:t.outputs,verificationRequired:true}}};
    });
    return {accepted:true,status:"SPECIALISTS_SELECTED",version:this.version,assignments,parallelGroups:dag.levels||[],policy:{maxAgents:4,leastPrivilege:true,verificationRequired:true}};
  }
  _infer(t){const text=(t.title+" "+t.description).toLowerCase(); if(text.includes("test")||text.includes("verify"))return"qa-engineer"; if(text.includes("deploy")||text.includes("release"))return"devops-engineer"; if(text.includes("observ"))return"sre-engineer"; if(text.includes("architect"))return"architect"; return"full-stack-engineer";}
}
