export class ProductUnderstandingEngine {
  constructor({modelGateway=null}={}) {
    this.modelGateway=modelGateway;
    this.version="1.51.0";
  }

  _clean(value="") {
    return String(value??"").replace(/\\s+/g," ").trim();
  }

  _extractConstraints(input) {
    const text=this._clean(input);
    const constraints=[];
    const patterns=[
      [/\\b(?:under|below|less than)\\s+([^,.!?]+)/i,"budget"],
      [/\\b(?:within|in)\\s+(\\d+\\s*(?:days?|weeks?|months?))/i,"deadline"],
      [/\\b(?:must|should)\\s+(?:use|run on|support)\\s+([^,.!?]+)/i,"technology"],
      [/\\b(?:for|targeting)\\s+([^,.!?]+?)\\s+(?:users?|customers?|people)\\b/i,"audience"]
    ];
    for(const [pattern,type] of patterns) {
      const match=text.match(pattern);
      if(match) constraints.push({type,value:this._clean(match[1]),source:"user_text"});
    }
    if(/\\bmobile\\b/i.test(text)) constraints.push({type:"platform",value:"mobile",source:"user_text"});
    if(/\\bweb\\b|\\bwebsite\\b/i.test(text)) constraints.push({type:"platform",value:"web",source:"user_text"});
    return constraints;
  }

  _goals(input) {
    const text=this._clean(input);
    const goals=[];
    const sentences=text.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean);
    for(const sentence of sentences) {
      const m=sentence.match(/^(?:build|create|make|develop|design|launch|automate|generate|add|implement)\\s+(.+)/i);
      if(m) goals.push(this._clean(m[1]));
    }
    if(!goals.length && text) goals.push(text);
    return goals.slice(0,10);
  }

  _ambiguities(input) {
    const text=this._clean(input);
    const checks=[
      ["target_users",/\\b(?:for|target(?:ing)?)\\b/i],
      ["platform",/\\b(?:web|website|mobile|android|ios|desktop)\\b/i],
      ["success_criteria",/\\b(?:success|metric|kpi|acceptance|goal)\\b/i],
      ["deadline",/\\b(?:today|tomorrow|day|week|month|deadline|by)\\b/i],
      ["integrations",/\\b(?:api|integrat|connect|github|stripe|google|slack|database)\\b/i]
    ];
    return checks.filter(([,pattern])=>!pattern.test(text)).map(([field])=>({
      field,
      severity:field==="target_users"||field==="success_criteria"?"high":"medium",
      question:{
        target_users:"Who are the primary users or customers?",
        platform:"Which platforms must be supported?",
        success_criteria:"What measurable outcome defines success?",
        deadline:"Is there a required delivery deadline?",
        integrations:"Which external systems or integrations are required?"
      }[field]
    }));
  }

  _acceptance(goals,constraints) {
    const criteria=["Requirements are explicit and traceable to the user's request","All high-severity ambiguities are resolved before execution","Architecture and implementation tasks can be generated from this specification"];
    if(goals.length) criteria.push("Primary goal is represented as an executable product objective");
    if(constraints.length) criteria.push("Explicit constraints are preserved as implementation constraints");
    return criteria;
  }

  async understand({input,context={}}={}) {
    const request=this._clean(input);
    if(!request) throw new Error("input is required");
    const constraints=this._extractConstraints(request);
    const goals=this._goals(request);
    const ambiguities=this._ambiguities(request);
    const requirements={
      functional:goals.map((goal,index)=>({id:"FR-"+String(index+1).padStart(3,"0"),statement:goal,priority:index===0?"high":"medium"})),
      nonFunctional:["Observable execution status","Verifiable acceptance criteria","Safe failure and recovery behavior"],
      constraints,
      acceptanceCriteria:this._acceptance(goals,constraints)
    };
    const riskFlags=[];
    if(ambiguities.some(x=>x.severity==="high")) riskFlags.push("HIGH_AMBIGUITY");
    if(!constraints.length) riskFlags.push("NO_EXPLICIT_CONSTRAINTS");
    return {
      version:this.version,
      request,
      intent:{type:"product_build",summary:goals[0]||request,confidence:goals.length?0.82:0.55},
      goals,
      requirements,
      ambiguities,
      riskFlags,
      executionReadiness:ambiguities.some(x=>x.severity==="high")?"NEEDS_CLARIFICATION":"READY_FOR_ARCHITECTURE",
      contextKeys:Object.keys(context??{}),
      generatedAt:new Date().toISOString()
    };
  }
}
