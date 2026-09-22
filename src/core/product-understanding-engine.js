export class ProductUnderstandingEngine {
  constructor({modelGateway=null}={}) {
    this.modelGateway=modelGateway;
    this.version="1.51.0";
  }

  _clean(value="") {
    return String(value??"").replace(/\s+/g," ").trim();
  }

  _extractConstraints(input) {
    const text=this._clean(input);
    const constraints=[];
    const patterns=[
      [/\b(?:within|in|under|below)\s+(\d+\s*(?:days?|weeks?|months?))/i,"deadline"],
      [/\b(?:under|below|less than)\s+([^,.!?]+)/i,"budget"],
      [/\b(?:must|should)\s+(?:use|run on|support)\s+([^,.!?]+)/i,"technology"],
      [/\b(?:for|targeting)\s+([^,.!?]+?)\s+(?:users?|customers?|people)\b/i,"audience"]
    ];
    for(const [pattern,type] of patterns) {
      const match=text.match(pattern);
      if(match) constraints.push({type,value:this._clean(match[1]),source:"user_text"});
    }
    if(/\bmobile\b/i.test(text)) constraints.push({type:"platform",value:"mobile",source:"user_text"});
    if(/\bweb\b|\bwebsite\b/i.test(text)) constraints.push({type:"platform",value:"web",source:"user_text"});
    return constraints;
  }

  _goals(input) {
    const text=this._clean(input);
    const goals=[];
    const sentences=text.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean);
    for(const sentence of sentences) {
      const m=sentence.match(/^(?:build|create|make|develop|design|launch|automate|generate|add|implement)\s+(.+)/i);
      if(m) goals.push(this._clean(m[1]));
    }
    if(!goals.length && text) goals.push(text);
    return goals.slice(0,10);
  }

  _ambiguities(input,goals=[]) {
    const text=this._clean(input);
    const checks=[
      ["target_users",/\b(?:for|target(?:ing)?)\b/i],
      ["platform",/\b(?:web|website|mobile|android|ios|desktop|pc|game|app)\b/i],
      ["success_criteria",/\b(?:success|metric|kpi|acceptance|goal|working|playable|runnable|production-ready)\b/i],
      ["deadline",/\b(?:today|tomorrow|day|week|month|deadline|by)\b/i],
      ["integrations",/\b(?:api|integrat|connect|github|stripe|google|slack|database)\b/i]
    ];
    // A concrete build request is executable even when the user has not
    // specified business metadata such as target users or a deadline. Those
    // are implementation assumptions, not blockers for the coding engine.
    const concreteGoal=goals.length>0 && goals[0].length>=4;
    return checks.filter(([,pattern])=>!pattern.test(text)).map(([field])=>({
      field,
      severity:concreteGoal?"medium":(field==="target_users"||field==="success_criteria"?"high":"medium"),
      question:{
        target_users:"Who are the primary users or customers?",
        platform:"Which platforms must be supported?",
        success_criteria:"What measurable outcome defines success?",
        deadline:"Is there a required delivery deadline?",
        integrations:"Which external systems or integrations are required?"
      }[field],
      blocking:!concreteGoal && (field==="target_users"||field==="success_criteria")
    }));
  }

  _extractActors(input) {
    const text=this._clean(input);
    const actors=new Set();
    const patterns=[
      /\b(?:for|targeting|used by)\s+([^,.!?]+?)(?:\s+users?|\s+customers?|\s+people)\b/ig,
      /\b(customer|customers|user|users|admin|administrator|manager|operator|driver|player|student|teacher|doctor|patient|seller|buyer|developer|visitor|guest)\b/ig
    ];
    for(const pattern of patterns) for(const match of text.matchAll(pattern)){
      const value=this._clean(match[1]);
      if(value&&value.length<60) actors.add(value.toLowerCase());
    }
    return [...actors].slice(0,12);
  }

  _extractFeatures(input) {
    const text=this._clean(input).toLowerCase();
    const dictionary={
      authentication:/\b(login|sign[ -]?in|signup|sign[ -]?up|register|authentication|auth)\b/,
      search:/\b(search|filter|sort|lookup|find)\b/,
      payments:/\b(payment|payments|stripe|checkout|billing|subscription)\b/,
      notifications:/\b(notification|notifications|email|sms|push)\b/,
      realtime:/\b(real[ -]?time|live|websocket|socket)\b/,
      persistence:/\b(database|persist|storage|save|records|crud)\b/,
      analytics:/\b(analytics|metrics|report|reports|dashboard|kpi)\b/,
      file_uploads:/\b(upload|file|document|image|photo|attachment)\b/,
      messaging:/\b(chat|message|messaging|conversation|inbox)\b/,
      maps:/\b(map|maps|location|gps|tracking|route)\b/,
      multiplayer:/\b(multiplayer|two player|2 player|online players)\b/,
      mobile:/\b(mobile|android|ios|touch|responsive)\b/,
      api:/\b(api|backend|server|rest|graphql|webhook|endpoint)\b/
    };
    return Object.entries(dictionary).filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
  }

  _extractEntities(input) {
    const text=this._clean(input).toLowerCase();
    const dictionary=["users","customers","products","orders","bookings","appointments","tasks","projects","invoices","payments","messages","players","enemies","scores","cards","vehicles","restaurants","drivers","patients","students","employees"];
    return dictionary.filter(name=>new RegExp("\\b"+name+"\\b").test(text)).slice(0,20);
  }

  _extractWorkflows(input) {
    const text=this._clean(input);
    const workflows=[];
    const patterns=[
      /\b(?:user|customer|admin|player|driver|manager)\s+(?:can|should|needs to)\s+([^.!?]+)/ig,
      /\b(?:allow|lets?|enable)\s+([^.!?]+)/ig,
      /\b(?:create|add|edit|update|delete|remove|search|filter|book|buy|pay|login|register|start|restart|score|match|track)\s+([^.!?]+)/ig
    ];
    for(const pattern of patterns) for(const match of text.matchAll(pattern)){
      const value=this._clean(match[0]);
      if(value.length>=8&&value.length<=180) workflows.push(value);
    }
    return [...new Set(workflows)].slice(0,15);
  }

  _extractPlatform(input) {
    const text=this._clean(input).toLowerCase();
    if(/\b(android|ios|mobile app)\b/.test(text)) return "mobile";
    if(/\bdesktop|windows|macos|linux\b/.test(text)) return "desktop";
    if(/\b(game|arcade|racing|snake|chess|pong|tetris)\b/.test(text)) return "game";
    if(/\bweb|website|browser|saas\b/.test(text)) return "web";
    return "web";
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
    const ambiguities=this._ambiguities(request,goals);
    const actors=this._extractActors(request);
    const features=this._extractFeatures(request);
    const entities=this._extractEntities(request);
    const workflows=this._extractWorkflows(request);
    const platform=this._extractPlatform(request);
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
      intent:{type:"product_build",summary:goals[0]||request,confidence:goals.length?0.90:0.55},
      goals,
      requirements,
      ambiguities,
      riskFlags,
      // Specific product requests such as "build a pc mini game" can proceed
      // with sensible engineering defaults; clarification remains available
      // as metadata but no longer prevents file generation.
      executionReadiness:goals.length ? "READY_FOR_ARCHITECTURE" : "NEEDS_CLARIFICATION",
      assumptions:[
        "Unspecified implementation details should use practical dependency-light defaults",
        "The requested workflows take precedence over generic starter behavior",
        "Existing project behavior is preserved only when the request is explicitly a modification"
      ],
      contextKeys:Object.keys(context??{}),
      generatedAt:new Date().toISOString()
    };
  }
}
