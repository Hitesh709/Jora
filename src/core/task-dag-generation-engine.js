export class TaskDAGGenerationEngine {
  constructor({modelGateway=null}={}) {
    this.modelGateway=modelGateway;
    this.version="1.53.0";
  }

  generate({specification,architecture}={}) {
    if(!architecture) throw new Error("architecture is required");
    const requirements=specification?.requirements?.functional??[];
    const components=architecture.components??[];
    const workflows=specification?.requirements?.workflows??[];
    const features=specification?.requirements?.features??[];
    const tasks=[];
    const add=(title,description,componentIds=[],dependencies=[],specialist="software-engineer",acceptance=[])=>{
      const id="TASK-"+String(tasks.length+1).padStart(3,"0");
      tasks.push({id,title,description,componentIds,dependencies,specialist,inputs:["architecture-plan","product-specification"],outputs:["implementation-artifact"],acceptanceCriteria:acceptance,verification:{required:true,checks:["tests","lint_or_static_validation","acceptance_criteria"]},retryPolicy:{maxAttempts:3,strategy:"diagnose-correct-retry"}});
      return id;
    };
    const understand=add("Finalize requirements","Validate product requirements and resolve blocking ambiguity",[components[1]?.id].filter(Boolean),[],"product-manager",["Requirements are explicit","Blocking ambiguities are resolved"]);
    const architectureTask=add("Implement architecture contracts","Define component boundaries, interfaces and data contracts",[components[2]?.id].filter(Boolean),[understand],"architect",["Interfaces are documented","Dependencies are traceable"]);
    const implementation=add("Implement core product","Implement the primary product functionality represented by the requirements",components.slice(0,4).map(x=>x.id),[architectureTask],"full-stack-engineer",requirements.length?requirements.map(x=>x.statement):["Primary product behavior is implemented"]);
    const workflowTask=add("Implement product workflows","Implement and connect the concrete user workflows extracted from the request",[components[0]?.id].filter(Boolean),[implementation],"full-stack-engineer",workflows.length?workflows.map(x=>"Workflow implemented: "+x):["Primary user workflows are implemented"]);
    const capabilityTask=add("Implement requested capabilities","Verify requested capabilities such as "+(features.join(", ")||"core functionality"),components.slice(0,4).map(x=>x.id),[workflowTask],"specialist-engineer",features.length?features.map(x=>"Capability implemented: "+x):["Core capability behavior is implemented"]);
    const verification=add("Verify product","Execute tests and acceptance checks against the implementation",[components[4]?.id].filter(Boolean),[capabilityTask],"qa-engineer",["Automated tests pass","Acceptance criteria pass"]);
    const observability=add("Enable production observability","Connect metrics, execution traces, failures and recovery signals",[components[5]?.id].filter(Boolean),[verification],"sre-engineer",["Health and observability signals are available"]);
    const deploy=add("Prepare deployment","Prepare a verified release for deployment",[components[5]?.id].filter(Boolean),[observability],"devops-engineer",["Release is reproducible","Deployment healthcheck is defined"]);
    const taskDAG=tasks.map(task=>({...task}));
    const levels=[];
    const remaining=new Map(tasks.map(t=>[t.id,t]));
    let level=0;
    while(remaining.size){
      const ready=[...remaining.values()].filter(t=>t.dependencies.every(d=>!remaining.has(d)));
      if(!ready.length) throw new Error("task dependency cycle detected");
      levels.push({level,tasks:ready.map(t=>t.id)});
      ready.forEach(t=>remaining.delete(t.id));
      level++;
    }
    return {
      accepted:true,
      status:"TASK_DAG_GENERATED",
      dag:{
        id:"DAG-"+Date.now(),
        version:this.version,
        nodes:taskDAG,
        levels,
        entryTask:tasks[0]?.id??null,
        terminalTasks:[deploy],
        criticalPath:tasks.map(t=>t.id),
      productContext:{workflows,features},
        parallelizableLevels:levels.filter(x=>x.tasks.length>1).map(x=>x.level),
        policy:{maxParallelism:4,requireVerification:true,requireAcceptanceCriteria:true},
        generatedAt:new Date().toISOString()
      }
    };
  }
}
