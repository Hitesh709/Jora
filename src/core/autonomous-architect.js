function clone(value){return structuredClone(value);}
function normalizeList(value){return Array.isArray(value)?value.filter(Boolean):[];}

export class AutonomousArchitect {
  constructor({
    modelGateway=null,
    knowledgeRetriever=null,
    learningMemory=null,
    policyEngine=null,
    observability=null,
    architectureStore=null,
    taskDAGOptimizer=null,
    taskContractEngine=null,
    experiencePlanner=null,
    maxAlternatives=3
  }={}) {
    this.modelGateway=modelGateway;
    this.knowledgeRetriever=knowledgeRetriever;
    this.learningMemory=learningMemory;
    this.policyEngine=policyEngine;
    this.observability=observability;
    this.architectureStore=architectureStore;
    this.taskDAGOptimizer=taskDAGOptimizer;
    this.taskContractEngine=taskContractEngine;
    this.experiencePlanner=experiencePlanner;
    this.maxAlternatives=Math.max(2,Math.min(5,maxAlternatives));
    this.contractVersion=1;
  }

  async _modelJSON(prompt,fallback){
    if(!this.modelGateway?.complete) return clone(fallback);
    try{
      const response=await this.modelGateway.complete({
        messages:[
          {role:"system",content:"You are Jora's autonomous architecture engine. Return ONLY valid JSON. Never invent unavailable repository facts. Prefer explicit assumptions and measurable acceptance criteria."},
          {role:"user",content:prompt}
        ]
      });
      const raw=response?.content??response?.output??"";
      const match=String(raw).match(/\{[\s\S]*\}/);
      if(!match) return clone(fallback);
      return JSON.parse(match[0]);
    }catch{return clone(fallback);}
  }

  async interpretRequirements({objective,context={}}={}){
    if(!objective?.trim()) throw new Error("objective is required");
    const fallback={
      objective:objective.trim(),
      functional:[objective.trim()],
      nonFunctional:["security","reliability","testability","maintainability"],
      constraints:normalizeList(context.constraints),
      risks:[],
      acceptanceCriteria:["implementation is tested","security gates pass","deployment health passes when enabled"],
      assumptions:[],
      evidenceRequired:["tests","security","evaluation"]
    };
    const result=await this._modelJSON(
      `Interpret this software goal into requirements. Context: ${JSON.stringify(context).slice(0,12000)}\nGoal: ${objective}`,
      fallback
    );
    return {...fallback,...result,objective:objective.trim(),functional:normalizeList(result.functional??fallback.functional),acceptanceCriteria:normalizeList(result.acceptanceCriteria??fallback.acceptanceCriteria)};
  }

  async designAlternatives(requirements,{currentArchitecture=null}={}){
    const baseComponents=[
      {id:"api",type:"interface",responsibility:"accept commands and expose status"},
      {id:"orchestrator",type:"control",responsibility:"plan and coordinate work"},
      {id:"agents",type:"compute",responsibility:"specialized reasoning and implementation"},
      {id:"memory",type:"state",responsibility:"persistent knowledge and execution history"},
      {id:"sandbox",type:"security",responsibility:"isolated execution"},
      {id:"evaluation",type:"quality",responsibility:"tests, security, benchmarks and regression"},
      {id:"deployment",type:"operations",responsibility:"staging, production, health and rollback"}
    ];
    const fallback=[
      {id:"balanced",name:"Governed modular architecture",components:baseComponents,tradeoffs:{cost:0.7,reliability:0.85,security:0.9,maintainability:0.9,latency:0.75}},
      {id:"resilient",name:"Resilience-first architecture",components:[...baseComponents,{id:"recovery",type:"reliability",responsibility:"automated recovery and incident handling"}],tradeoffs:{cost:0.6,reliability:0.95,security:0.9,maintainability:0.8,latency:0.65}},
      {id:"lean",name:"Lean architecture",components:baseComponents.slice(0,5),tradeoffs:{cost:0.95,reliability:0.7,security:0.8,maintainability:0.75,latency:0.9}}
    ];
    const result=await this._modelJSON(
      `Create up to ${this.maxAlternatives} architecture alternatives for these requirements. Each must contain id,name,components[{id,type,responsibility}],tradeoffs with numeric 0..1 cost,reliability,security,maintainability,latency. Requirements: ${JSON.stringify(requirements).slice(0,14000)}`,
      {alternatives:fallback}
    );
    const alternatives=Array.isArray(result)?result:(result.alternatives??fallback);
    return alternatives.slice(0,this.maxAlternatives).map((x,i)=>({
      ...fallback[i%fallback.length],
      ...x,
      id:x.id??`architecture-${i+1}`,
      components:normalizeList(x.components).length?x.components:fallback[i%fallback.length].components,
      tradeoffs:{...fallback[i%fallback.length].tradeoffs,...(x.tradeoffs??{})}
    }));
  }

  decide(requirements,alternatives,{weights={cost:.1,reliability:.25,security:.25,maintainability:.2,latency:.2}}={}){
    const scored=alternatives.map(a=>{
      const t=a.tradeoffs??{};
      const score=Object.entries(weights).reduce((sum,[key,w])=>sum+Number(t[key]??0)*w,0);
      return {...a,decisionScore:Number(score.toFixed(6))};
    }).sort((a,b)=>b.decisionScore-a.decisionScore);
    const chosen=scored[0];
    if(!chosen) throw new Error("No architecture alternatives");
    return {selected:clone(chosen),alternatives:clone(scored),weights,reason:"explicit weighted trade-off decision",requirements:clone(requirements)};
  }

  buildContract({requirements,decision,context={}}={}){
    const selected=decision?.selected;
    if(!selected) throw new Error("architecture decision is required");
    const components=normalizeList(selected.components).map(c=>({...c,id:String(c.id),dependsOn:normalizeList(c.dependsOn)}));
    return {
      contractVersion:this.contractVersion,
      id:`arch-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      createdAt:new Date().toISOString(),
      objective:requirements.objective,
      requirements:clone(requirements),
      decision:{selectedId:selected.id,score:selected.decisionScore,weights:decision.weights},
      components,
      interfaces:components.map(c=>({component:c.id,inputs:[],outputs:[]})),
      security:{leastPrivilege:true,isolationRequired:true,networkPolicy:"deny-by-default"},
      reliability:{healthChecks:true,rollbackRequired:true,recoveryAllowed:true},
      deployment:{stagingGate:true,productionHealthGate:true},
      acceptanceCriteria:clone(requirements.acceptanceCriteria),
      context:clone(context),
      parentArchitectureId:context.parentArchitectureId??null
    };
  }

  validateContract(contract){
    const errors=[];
    if(!contract?.id) errors.push("missing architecture id");
    if(!contract?.objective) errors.push("missing objective");
    const components=normalizeList(contract?.components);
    if(!components.length) errors.push("architecture has no components");
    const ids=new Set();
    for(const c of components){
      if(!c.id) errors.push("component without id");
      if(ids.has(c.id)) errors.push(`duplicate component: ${c.id}`);
      ids.add(c.id);
    }
    const edges=components.flatMap(c=>normalizeList(c.dependsOn).map(d=>[c.id,d]));
    for(const [,d] of edges) if(!ids.has(d)) errors.push(`unknown dependency: ${d}`);
    const visiting=new Set(),visited=new Set();
    const graph=new Map(components.map(c=>[c.id,normalizeList(c.dependsOn)]));
    const dfs=id=>{
      if(visiting.has(id)) return true;
      if(visited.has(id)) return false;
      visiting.add(id);
      for(const d of graph.get(id)??[]) if(dfs(d)) return true;
      visiting.delete(id);visited.add(id);return false;
    };
    for(const id of ids) if(dfs(id)) {errors.push("architecture dependency cycle detected");break;}
    if(contract?.security?.networkPolicy!=="deny-by-default") errors.push("security network policy must be deny-by-default");
    return {passed:errors.length===0,errors};
  }

  compileTaskDAG(contract){
    const validation=this.validateContract(contract);
    if(!validation.passed) throw new Error(`Invalid architecture: ${validation.errors.join("; ")}`);
    return contract.components.map((c,i)=>({
      id:`ARCH-${contract.id}-${c.id}`,
      title:`Implement ${c.id}`,
      description:c.responsibility,
      priority:100-i,
      dependencies:normalizeList(c.dependsOn).map(d=>`ARCH-${contract.id}-${d}`),
      acceptanceCriteria:contract.acceptanceCriteria,
      risk:this.estimateRisk({component:c,contract}),
      architectureId:contract.id
    }));
  }

  compileAgentTeam(contract){
    const roles=new Map([
      ["security","security-engineer"],["quality","verification-engineer"],["compute","implementation-engineer"],
      ["control","systems-architect"],["state","data-engineer"],["interface","integration-engineer"],["operations","sre-engineer"]
    ]);
    return contract.components.map(c=>({
      component:c.id,
      role:roles.get(c.type)??"generalist-engineer",
      capabilities:[c.type,c.responsibility],
      architectureId:contract.id
    }));
  }

  estimateRisk({component,contract}={}){
    let score=0.2;
    if(component?.type==="security") score+=0.3;
    if(component?.type==="compute") score+=0.1;
    if(normalizeList(component?.dependsOn).length>2) score+=0.15;
    if(contract?.deployment?.productionHealthGate) score+=0.05;
    return {score:Math.min(1,Number(score.toFixed(3))),level:score>=0.7?"HIGH":score>=0.4?"MEDIUM":"LOW"};
  }

  conformance(contract,{implementation={},architecture=null}={}){
    const expected=new Set((contract?.components??[]).map(c=>c.id));
    const actual=new Set(normalizeList(implementation.components).map(c=>typeof c==="string"?c:c.id));
    const missing=[...expected].filter(x=>!actual.has(x));
    const unexpected=[...actual].filter(x=>!expected.has(x));
    return {passed:missing.length===0,missing,unexpected,architectureId:architecture?.id??contract?.id};
  }

  checkpoint(state,checkpointStore){
    if(!checkpointStore?.write) return clone(state);
    return checkpointStore.write({version:1,updatedAt:new Date().toISOString(),state:clone(state)});
  }

  async plan({objective,context={},currentArchitecture=null}={}){
    const requirements=await this.interpretRequirements({objective,context});
    const alternatives=await this.designAlternatives(requirements,{currentArchitecture});
    const decision=this.decide(requirements,alternatives);
    const contract=this.buildContract({requirements,decision,context});
    const validation=this.validateContract(contract);
    if(!validation.passed) throw new Error(validation.errors.join("; "));
    let taskDAG=this.compileTaskDAG(contract);
    if(this.taskDAGOptimizer) taskDAG=this.taskDAGOptimizer.optimize(taskDAG).tasks;
    if(this.taskContractEngine) taskDAG=taskDAG.map(task=>this.taskContractEngine.compile(task,{evidenceRequired:["tests","security","evaluation"]}));
    if(this.experiencePlanner) { const planned=[]; for(const task of taskDAG) planned.push(await this.experiencePlanner.plan(task)); taskDAG=planned; }
    const agentTeam=this.compileAgentTeam(contract);
    const plan={version:"1.50",requirements,alternatives,decision,contract,validation,taskDAG,agentTeam};
    const persisted=await this.architectureStore?.saveContract?.(contract,{decision,parentArchitectureId:context.parentArchitectureId});
    if(persisted) plan.contract=persisted;
    await this.observability?.append?.({type:"ARCHITECTURE_PLAN_CREATED",architectureId:contract.id,objective,at:new Date().toISOString()});
    return plan;
  }
}
