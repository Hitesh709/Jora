export class ArchitecturePlanningEngine {
  constructor({modelGateway=null,productUnderstanding=null}={}) {
    this.modelGateway=modelGateway;
    this.productUnderstanding=productUnderstanding;
    this.version="1.52.0";
  }

  _slug(value="") {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
  }

  async plan({specification,input,context={}}={}) {
    let spec=specification;
    if(!spec) {
      if(!this.productUnderstanding) throw new Error("specification or productUnderstanding is required");
      spec=await this.productUnderstanding.understand({input,context});
    }
    const goals=spec.goals??[];
    const functional=spec.requirements?.functional??[];
    const constraints=spec.requirements?.constraints??[];
    const actors=spec.requirements?.actors??[];
    const features=spec.requirements?.features??[];
    const entities=spec.requirements?.entities??[];
    const workflows=spec.requirements?.workflows??[];
    const platform=spec.requirements?.platform??"web";
    const components=[];
    const add=(name,responsibility)=>components.push({id:"COMP-"+String(components.length+1).padStart(3,"0"),name,responsibility});
    add("Product Interface","Capture user requests, show status and present results");
    add("Product Understanding","Convert requests into structured requirements");
    add("Architecture Planner","Produce architecture, components, dependencies and implementation decisions");
    add("Execution Orchestrator","Coordinate executable tasks and specialist agents");
    add("Verification Layer","Run tests, quality gates and acceptance checks");
    add("Observability","Record execution, failures, metrics and recovery signals");
    const dataModel=[
      {entity:"ProductSpecification",fields:["id","version","intent","goals","requirements","constraints","acceptanceCriteria"]},
      {entity:"ArchitecturePlan",fields:["id","version","components","interfaces","dependencies","decisions","risks"]},
      {entity:"ExecutionTask",fields:["id","title","description","dependencies","status","owner"]}
    ];
    const interfaces=[
      {name:"POST /v1/understand",purpose:"Create a structured product specification"},
      {name:"POST /v1/architecture/plan",purpose:"Create an architecture plan from a specification"},
      {name:"POST /v1/mission/start",purpose:"Start execution from a product objective"}
    ];
    const dependencies=components.slice(1).map((c,i)=>({from:components[i].id,to:c.id,type:"required"}));
    const decisions=[
      {id:"ADR-001",decision:"Use modular services with explicit contracts",reason:"Allows specialist agents and future task-DAG execution"},
      {id:"ADR-002",decision:"Keep verification and observability as first-class layers",reason:"Supports controlled autonomous execution"},
      {id:"ADR-003",decision:"Preserve requirements traceability",reason:"Every implementation task must map back to a product requirement"}
    ];
    if(features.includes("payments")) add("Payment Integration","Process and verify payment or billing workflows");
    if(features.includes("authentication")) add("Identity and Access","Handle authentication and protected user workflows");
    if(features.includes("realtime")) add("Realtime Transport","Support live state synchronization and events");
    if(features.includes("messaging")) add("Messaging","Handle conversations and message delivery");
    if(features.includes("maps")) add("Location Services","Handle maps, routes, location and tracking workflows");
    if(features.includes("multiplayer")) add("Multiplayer Session","Coordinate player state and game sessions");
    const risks=[];
    if((spec.ambiguities??[]).some(x=>x.severity==="high")) risks.push({severity:"high",risk:"High-severity product ambiguity remains",mitigation:"Resolve ambiguity before autonomous execution"});
    if(!constraints.length) risks.push({severity:"medium",risk:"No explicit technical constraints supplied",mitigation:"Allow architecture defaults but record assumptions"});
    const plan={
      id:"ARCH-"+Date.now()+"-"+this._slug(spec.intent?.summary||goals[0]||"product"),
      version:this.version,
      sourceSpecificationVersion:spec.version??"unknown",
      objective:spec.intent?.summary||goals[0]||"Product build",
      architectureStyle:"modular-agentic-production-system",
      components,
      dataModel,
      interfaces,
      dependencies,
      decisions,
      assumptions:["Existing Jora runtime, API, observability and agent infrastructure are reusable"],
      risks,
      traceability:functional.map((r,i)=>({requirementId:r.id,componentIds:[components[Math.min(i+1,components.length-1)].id]})),
      implementationSequence:[
        "Finalize product requirements and resolve blocking ambiguity",
        "Instantiate architecture components and contracts",
        "Generate executable task DAG",
        "Assign specialist agents",
        "Implement requested workflows and product-specific behavior",
        "Implement and verify",
        "Deploy and observe"
      ],
      readiness:risks.some(x=>x.severity==="high")?"BLOCKED_BY_REQUIREMENTS":"READY_FOR_TASK_DAG",
      contextKeys:Object.keys(context??{}),
      generatedAt:new Date().toISOString()
    };
    return {accepted:true,status:"ARCHITECTURE_PLANNED",plan};
  }
}
