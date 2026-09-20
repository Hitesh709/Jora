import http from "node:http";
import {randomUUID} from "node:crypto";
import {URL} from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import {AccessController} from "./access-controller.js";
import {WebSearchProvider} from "./web-search-provider.js";
import {withModelSelection} from "./multi-model-gateway.js";

function json(res,status,payload,headers={}) {
  const body=JSON.stringify(payload);
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, OPTIONS",...headers});
  res.end(body);
}

async function readBody(req,maxBytes=1_000_000) {
  let size=0;
  const chunks=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>maxBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  const raw=Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); }
  catch { throw new Error("invalid JSON body"); }
}

function safeExecution(execution) {
  if(!execution) return null;
  return {
    id:execution.id,
    taskId:execution.taskId,
    agentId:execution.agentId,
    status:execution.status,
    createdAt:execution.createdAt,
    updatedAt:execution.updatedAt,
    result:execution.result??null,
    trace:execution.trace??[],
    tenantId:execution.input?.tenantId??execution.tenantId??"default"
  };
}

export class OperatorApi {
  constructor({
    runtime,
    executionStore,
    observability=null,
    metrics=null,
    worker=null,
    queue=null,
    host="127.0.0.1",
    port=8787,
    authToken=null,
    maxBodyBytes=1_000_000,
    dashboardPath=null,
    healthMonitor=null,
    incidentManager=null,
    programManager=null,
    rateLimitPerMinute=120,
    accessController=null,
    auditLog=null,
    productUnderstanding=null,
    architecturePlanner=null,
    taskDAGGenerator=null,
    autonomousProductBuilder=null,
    autonomousCodingOrchestrator=null,
    autonomousEngineeringLoop=null,
    selfImprovingEngineeringCore=null,
    autonomousSoftwareFactory=null,
    executionPlatform=null,
    searchProvider=null,
    modelGateway=null
  }={}) {
    if(!runtime) throw new Error("runtime is required");
    this.runtime=runtime;
    this.executionStore=executionStore;
    this.observability=observability;
    this.metrics=metrics;
    this.worker=worker;
    this.queue=queue;
    this.host=host;
    this.port=port;
    this.authToken=authToken;
    this.maxBodyBytes=maxBodyBytes;
    this.dashboardPath=dashboardPath;
    this.healthMonitor=healthMonitor;
    this.incidentManager=incidentManager;
    this.programManager=programManager;
    this.rateLimitPerMinute=Math.max(1,Number(rateLimitPerMinute)||120);
    this.rateBuckets=new Map();
    this.accessController=accessController;
    this.auditLog=auditLog;
    this.productUnderstanding=productUnderstanding;
    this.architecturePlanner=architecturePlanner;
    this.taskDAGGenerator=taskDAGGenerator;
    this.autonomousProductBuilder=autonomousProductBuilder;
    this.autonomousCodingOrchestrator=autonomousCodingOrchestrator;
    this.autonomousEngineeringLoop=autonomousEngineeringLoop;
    this.selfImprovingEngineeringCore=selfImprovingEngineeringCore;
    this.autonomousSoftwareFactory=autonomousSoftwareFactory;
    this.executionPlatform=executionPlatform;
    this.searchProvider=searchProvider||new WebSearchProvider();
    this.modelGateway=modelGateway;
    const localOnly=["127.0.0.1","localhost","::1"].includes(this.host);
    if(!localOnly && !this.authToken && !this.accessController) throw new Error("authToken or accessController is required when operator api is not bound to localhost");
    this.server=null;
    this.startedAt=null;
  }

  _rateLimited(req) {
    const now=Date.now(); const key=req.socket?.remoteAddress||"unknown";
    const bucket=this.rateBuckets.get(key);
    if(!bucket || now-bucket.startedAt>=60000){ this.rateBuckets.set(key,{startedAt:now,count:1}); return false; }
    bucket.count++;
    return bucket.count>this.rateLimitPerMinute;
  }

  _principal(req) {
    const header=req.headers.authorization??"";
    if(!header) {
      if(!this.authToken) return {id:"local",tenantId:"default",roles:["admin"]};
      return null;
    }
    const token=header.startsWith("Bearer ")?header.slice(7):null;
    if(this.authToken && token===this.authToken) return {id:"legacy",tenantId:"default",roles:["admin"]};
    return this.accessController?.authenticate(token)??null;
  }

  _authorized(req,action="read") {
    const principal=this._principal(req);
    if(this.accessController && principal?.id!=="legacy" && principal?.id!=="local") return this.accessController.authorize(principal,action);
    if(principal?.id==="legacy" || principal?.id==="local") return true;
    return false;
  }

  _customerPrincipal(req) {
    const header=req.headers.authorization??"";
    if(!header?.startsWith("Bearer ")) return null;
    const token=header.slice(7).trim();
    return this.executionPlatform?.customerSaaS?.apiKeys?.authenticate?.(token)??null;
  }

  _customerKeyAllowed(method,path) {
    const allowed=new Set([
      "GET /v3/customer/dashboard","GET /v3/customer/billing","GET /v3/customer/projects",
      "GET /v3/customer/lineage","GET /v3/customer/workspaces","GET /v3/customer/versions",
      "POST /v3/customer/execute","GET /v3/customer/operations","POST /v3/customer/operations/observe",
      "GET /v3/customer/incidents","GET /v3/customer/health","POST /v3/customer/learning",
      "GET /v3/customer/optimization"
    ]);
    return allowed.has(method+" "+path);
  }

  _customerScope(principal,body={}) {
    if(!principal?.apiKey) return body;
    if(body.tenantId && body.tenantId!==principal.tenantId) throw new Error("tenant scope mismatch");
    if(principal.projectId && body.projectId && body.projectId!==principal.projectId) throw new Error("project scope mismatch");
    const scoped={...body,tenantId:principal.tenantId};
    if(principal.projectId) scoped.projectId=principal.projectId;
    return scoped;
  }


  async _status() {
    const worker=this.worker?.status ? await this.worker.status() : null;
    const executions=this.executionStore?.list ? await this.executionStore.list() : [];
    const recent=executions.slice(-20).map(safeExecution);
    return {
      service:"jora",
      status:"OK",
      uptimeMs:this.startedAt ? Date.now()-this.startedAt : 0,
      worker,
      executions:{total:executions.length,recent},
      timestamp:new Date().toISOString()
    };
  }

  async _route(req,res) {
    const url=new URL(req.url??"/",`http://${this.host}`);
    const method=req.method??"GET";
    const path=url.pathname;

    if(method==="OPTIONS") {
      res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-headers":"Authorization, Content-Type","access-control-allow-methods":"GET, POST, OPTIONS"});
      res.end(); return;
    }

    if(method==="GET" && path==="/health") {
      return json(res,200,{status:"ok",service:"jora",timestamp:new Date().toISOString()});
    }

    if(this._rateLimited(req)) return json(res,429,{error:"rate_limit_exceeded",retryAfterSeconds:60});

    // Public browser API: these endpoints are intentionally callable from the Vercel UI
    // without exposing a permanent server secret to end users. Rate limiting still applies.
    const publicApiPaths=new Set(["/v1/chat","/v1/search","/v1/execute","/v1/providers","/v1/platform","/v1/agent"]);
    const isPublicApi=method==="POST" && publicApiPaths.has(path) || method==="GET" && path==="/v1/providers";
    const customerPrincipal=path.startsWith("/v3/customer/")?this._customerPrincipal(req):null;
    const principal=customerPrincipal||this._principal(req);
    const tenantId=customerPrincipal?.tenantId||this.accessController?.tenant(principal)||"default";
    const actorId=customerPrincipal?.id||principal?.id||"public";
    const action=method==="GET"?"read":(path==="/v1/execute"||path==="/v1/chat"||path==="/v1/jobs"||path.startsWith("/v1/worker")?"execute":"operate");
    const customerKeyRequest=Boolean(customerPrincipal?.apiKey);
    if(customerKeyRequest && !this._customerKeyAllowed(method,path)) {
      return json(res,403,{error:"customer_api_key_scope_forbidden"});
    }
    if(!isPublicApi && !customerKeyRequest && !this._authorized(req,action)) {
      await this.auditLog?.record({action:"AUTH_DENIED",actorId,tenantId,resource:path,metadata:{method}});
      return json(res,401,{error:"unauthorized"});
    }

    if(method==="GET" && (path==="/" || path==="/dashboard")) {
      if(!this.dashboardPath) return json(res,404,{error:"dashboard_not_configured"});
      try {
        const body=await fs.readFile(this.dashboardPath,"utf8");
        res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
        res.end(body); return;
      } catch { return json(res,404,{error:"dashboard_not_found"}); }
    }

    await this.auditLog?.record({action:"API_ACCESS",actorId,tenantId,resource:path,metadata:{method}});

    if(method==="GET" && path==="/v1/incidents") {
      if(!this.incidentManager) return json(res,503,{error:"incident_manager_not_configured"});
      return json(res,200,{incidents:this.incidentManager.list({status:url.searchParams.get("status")||undefined,limit:url.searchParams.get("limit")||100})});
    }
    const incidentMatch=path.match(/^\/v1\/incidents\/([^/]+)$/);
    if(method==="GET" && incidentMatch) {
      const incident=this.incidentManager?.get(incidentMatch[1]);
      if(!incident) return json(res,404,{error:"incident_not_found"});
      return json(res,200,{incident});
    }

    if(method==="GET" && path==="/v1/platform") {
      if(!this.executionPlatform?.status) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{accepted:true,status:"PLATFORM_READY",version:"4.0",engine:"jora",platform:this.executionPlatform.status()});
    }

    if(method==="POST" && path==="/v1/agent") {
      if(!this.runtime?.execute && !this.executionPlatform?.agentExecute) return json(res,503,{error:"agent_runtime_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.task && !body.command) return json(res,400,{error:"task is required"});
      try {
        const task={...(body.task&&typeof body.task==="object"?body.task:{}),id:body.id||body.taskId,command:body.command||body.task?.command||body.task?.description||""};
        task.capability=task.capability||"coding";
        if(this.runtime?.execute) {
          const result=await this.runtime.execute({
            command:task.command,
            constraints:body.constraints||{},
            context:{...(body.context||{}),taskId:task.id||"agent-task",agentId:"jora-core",tenantId,source:"jora-agent"}
          });
          return json(res,200,{accepted:true,status:"AGENT_COMPLETED",agentId:"jora-core",result});
        }
        return json(res,200,await this.executionPlatform.agentExecute(task));
      } catch(error) {
        return json(res,400,{accepted:false,status:"AGENT_FAILED",error:error.message});
      }
    }

    if(method==="GET" && path==="/v1/mission") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      return json(res,200,await this.programManager.status());
    }

    if(method==="POST" && path==="/v1/mission/start") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      const objective=typeof body.objective==="string"&&body.objective.trim()
        ? body.objective.trim()
        : "Complete Jora roadmap autonomously";
      const promise=this.programManager.run({objective,context:{...(body.context??{}),tenantId}});
      promise.catch(()=>{});
      return json(res,202,{accepted:true,status:"STARTED",objective});
    }

    if(method==="POST" && path==="/v1/mission/stop") {
      if(!this.programManager) return json(res,503,{error:"program_manager_not_configured"});
      this.programManager.stop();
      return json(res,200,{accepted:true,status:"STOP_REQUESTED"});
    }

    if(method==="GET" && path==="/v1/health") {
      const result=this.healthMonitor?.check ? await this.healthMonitor.check() : {healthy:true,alerts:[]};
      return json(res,result.healthy?200:503,result);
    }

    if(method==="GET" && path==="/v1/audit") {
      if(!this.auditLog) return json(res,503,{error:"audit_log_not_configured"});
      return json(res,200,{entries:this.auditLog.list({tenantId,limit:url.searchParams.get("limit")||100}),integrity:this.auditLog.verify()});
    }

    if(method==="GET" && path==="/v1/metrics") {
      return json(res,200,this.metrics?.snapshot ? this.metrics.snapshot() : {counters:{},histograms:{}});
    }
    if(method==="POST" && path==="/v1/chat") {
      if(!this.modelGateway?.complete) return json(res,503,{error:"model_gateway_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.message!=="string" || !body.message.trim()) return json(res,400,{error:"message is required"});
      const selectedProvider=typeof body.context?.provider==="string" ? body.context.provider.trim() : "";
      // "jora" (and an empty provider) means: use the backend's resilient default/fallback chain.
      // Never pin the request to a missing configured model such as "openai".
      const gatewayStatus=this.modelGateway?.status?.()||{};
      const useDefault=!selectedProvider || selectedProvider==="jora";
      const requestedProvider=useDefault ? "" : selectedProvider;
      if(!useDefault && !gatewayStatus.models?.includes(selectedProvider)) {
        return json(res,400,{accepted:false,status:"PROVIDER_NOT_AVAILABLE",error:"Selected AI provider is not available on this Jora backend",provider:selectedProvider,availableProviders:gatewayStatus.models||[]});
      }
      try {
        const complete=()=>this.modelGateway.complete({
          messages:[
            {role:"system",content:"You are Jora, an AI engineering agent. Answer the user's question directly and concisely. If the user asks to build, modify, test, or deploy software, explain that Jora can perform the engineering work and ask only for information that is genuinely required."},
            {role:"user",content:body.message.trim()}
          ]
        });
        const response=useDefault ? await complete() : await withModelSelection(requestedProvider,complete);
        return json(res,200,{
          accepted:true,
          status:"CHAT_COMPLETED",
          message:String(response?.text??response?.content??response?.output??""),
          model:response?.model??(requestedProvider||null),
          provider:useDefault ? (response?.model??gatewayStatus.defaultModel??null) : selectedProvider
        });
      } catch(error) {
        return json(res,502,{accepted:false,status:"CHAT_FAILED",error:error.message,provider:selectedProvider||null});
      }
    }


    if(method==="POST" && path==="/v1/understand") {
      if(!this.productUnderstanding) return json(res,503,{error:"product_understanding_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.input!=="string" || !body.input.trim()) return json(res,400,{error:"input is required"});
      try {
        const specification=await this.productUnderstanding.understand({
          input:body.input.trim(),
          context:{...(body.context??{}),tenantId}
        });
        return json(res,200,{accepted:true,status:"UNDERSTOOD",specification});
      } catch(error) {
        return json(res,400,{accepted:false,status:"FAILED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/architecture/plan") {
      if(!this.architecturePlanner) return json(res,503,{error:"architecture_planner_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const result=await this.architecturePlanner.plan({
          specification:body.specification,
          input:body.input,
          context:{...(body.context??{}),tenantId}
        });
        return json(res,200,result);
      } catch(error) {
        return json(res,400,{accepted:false,status:"FAILED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/tasks/dag") {
      if(!this.taskDAGGenerator) return json(res,503,{error:"task_dag_generator_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.architecture) return json(res,400,{error:"architecture is required"});
      try {
        return json(res,200,this.taskDAGGenerator.generate({
          specification:body.specification,
          architecture:body.architecture
        }));
      } catch(error) {
        return json(res,400,{accepted:false,status:"FAILED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/build") {
      if(!this.autonomousProductBuilder) return json(res,503,{error:"autonomous_product_builder_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.input) return json(res,400,{error:"input is required"});
      try { return json(res,200,await this.autonomousProductBuilder.build({input:body.input,context:body.context||{}})); }
      catch(error){ return json(res,400,{accepted:false,status:"FAILED",error:error.message}); }
    }

    if(method==="POST" && path==="/v1/code/plan") {
      if(!this.autonomousCodingOrchestrator) return json(res,503,{error:"autonomous_coding_orchestrator_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.task) return json(res,400,{error:"task is required"});
      try{return json(res,200,this.autonomousCodingOrchestrator.build({task:body.task,repository:body.repository||{}}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="POST" && path==="/v1/engineering/run") {
      if(!this.autonomousEngineeringLoop) return json(res,503,{error:"autonomous_engineering_loop_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.repository || !body.task) return json(res,400,{error:"repository and task are required"});
      try{return json(res,200,await this.autonomousEngineeringLoop.run({repository:body.repository,task:body.task,changes:body.changes||[],testCommands:body.testCommands||[],deployment:body.deployment||{}}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="POST" && path==="/v1/engineering/learn") {
      if(!this.selfImprovingEngineeringCore) return json(res,503,{error:"self_improving_engineering_core_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,this.selfImprovingEngineeringCore.learn(body||{}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="POST" && path==="/v1/factory/run") {
      if(!this.autonomousSoftwareFactory) return json(res,503,{error:"autonomous_software_factory_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.autonomousSoftwareFactory.run(body||{}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="POST" && path==="/v3/customer/tenants") {
      if(!this.executionPlatform?.customerControl?.tenants) return json(res,503,{error:"customer_control_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const tenant=await this.executionPlatform.customerControl.tenants.create({name:body.name,plan:body.plan||"standard",metadata:body.metadata||{}});
        return json(res,201,{accepted:true,status:"TENANT_CREATED",tenant});
      } catch(error) { return json(res,400,{accepted:false,status:"TENANT_CREATE_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/tenants") {
      if(!this.executionPlatform?.customerControl?.tenants) return json(res,503,{error:"customer_control_not_configured"});
      return json(res,200,{tenants:this.executionPlatform.customerControl.tenants.list()});
    }
    if(method==="POST" && path==="/v3/customer/projects") {
      if(!this.executionPlatform?.customerControl?.projects) return json(res,503,{error:"customer_control_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const project=this.executionPlatform.customerControl.projects.create({
          tenantId:body.tenantId,name:body.name,repository:body.repository||null,
          environment:body.environment||"production",workspace:body.workspace||null,metadata:body.metadata||{}
        });
        return json(res,201,{accepted:true,status:"PROJECT_CREATED",project});
      } catch(error) { return json(res,400,{accepted:false,status:"PROJECT_CREATE_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/projects") {
      if(!this.executionPlatform?.customerControl?.projects) return json(res,503,{error:"customer_control_not_configured"});
      return json(res,200,{projects:this.executionPlatform.customerControl.projects.list(customerPrincipal?.tenantId||url.searchParams.get("tenantId")||undefined)});
    }
    if(method==="POST" && path==="/v3/customer/users") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.identity) return json(res,503,{error:"customer_identity_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const user=await saas.identity.create({tenantId:body.tenantId,email:body.email,role:body.role||"member",name:body.name||""});
        return json(res,201,{accepted:true,status:"CUSTOMER_USER_CREATED",user});
      } catch(error) { return json(res,400,{accepted:false,status:"CUSTOMER_USER_CREATE_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/users") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.identity) return json(res,503,{error:"customer_identity_not_configured"});
      return json(res,200,{users:saas.identity.list({tenantId:url.searchParams.get("tenantId")||undefined,limit:Number(url.searchParams.get("limit")||100)})});
    }
    if(method==="POST" && path==="/v3/customer/api-keys") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.apiKeys) return json(res,503,{error:"customer_api_keys_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const key=await saas.apiKeys.issue({tenantId:body.tenantId,projectId:body.projectId,name:body.name||"api-key"});
        return json(res,201,{accepted:true,status:"API_KEY_ISSUED",key});
      } catch(error) { return json(res,400,{accepted:false,status:"API_KEY_ISSUE_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/api-keys") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.apiKeys) return json(res,503,{error:"customer_api_keys_not_configured"});
      return json(res,200,{keys:saas.apiKeys.list({tenantId:customerPrincipal?.tenantId||url.searchParams.get("tenantId")||undefined,projectId:customerPrincipal?.projectId||url.searchParams.get("projectId")||undefined})});
    }
    const apiKeyMatch=path.match(/^\/v3\/customer\/api-keys\/([^/]+)$/);
    if(method==="POST" && apiKeyMatch) {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.apiKeys) return json(res,503,{error:"customer_api_keys_not_configured"});
      try {
        const key=await saas.apiKeys.revoke(apiKeyMatch[1]);
        if(!key) return json(res,404,{error:"api_key_not_found"});
        return json(res,200,{accepted:true,status:"API_KEY_REVOKED",key});
      } catch(error) { return json(res,400,{accepted:false,status:"API_KEY_REVOKE_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/billing") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.billing) return json(res,503,{error:"customer_billing_not_configured"});
      const tenantId=customerPrincipal?.tenantId||url.searchParams.get("tenantId")||undefined;
      return json(res,200,{tenantId,total:saas.billing.summary({tenantId}),plan:saas.billing.plan(customerPrincipal?.tenantPlan||url.searchParams.get("plan")||"standard")});
    }
    if(method==="POST" && path==="/v3/customer/billing/events") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.billing) return json(res,503,{error:"customer_billing_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try { return json(res,201,{accepted:true,status:"BILLING_EVENT_RECORDED",event:await saas.billing.record(body||{})}); }
      catch(error) { return json(res,400,{accepted:false,status:"BILLING_EVENT_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/dashboard") {
      const saas=this.executionPlatform?.customerSaaS;
      if(!saas?.dashboard) return json(res,503,{error:"customer_dashboard_not_configured"});
      return json(res,200,saas.dashboard.overview({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined}));
    }
    if(method==="POST" && path==="/v3/customer/repositories/provision") {
      const control=this.executionPlatform?.customerControl;
      if(!control?.repositoryFactory) return json(res,503,{error:"repository_provisioning_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try { return json(res,201,await control.repositoryFactory.provision({tenantId:body.tenantId,projectId:body.projectId,name:body.name,description:body.description||"",repositoryName:body.repositoryName||null})); }
      catch(error) { return json(res,400,{accepted:false,status:"REPOSITORY_PROVISION_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.customerProduction.status());
    }
    if(method==="POST" && path==="/v3/customer/execute") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,202,await this.executionPlatform.customerProduction.submit(this._customerScope(customerPrincipal,body||{})));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }
    if(method==="GET" && path==="/v3/customer/lineage") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{records:this.executionPlatform.customerProduction.lineage.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }
    if(method==="GET" && path==="/v3/customer/workspaces") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{workspaces:this.executionPlatform.customerControl.workspaces.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }
    if(method==="GET" && path==="/v3/customer/versions") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{versions:this.executionPlatform.customerControl.versions.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined,limit:Number(url.searchParams.get("limit")||100)})});
    }
    if(method==="POST" && path==="/v3/customer/execute") {
      if(!this.executionPlatform?.customerSubmit) return json(res,503,{error:"customer_production_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try {
        const result=await this.executionPlatform.customerSubmit(this._customerScope(customerPrincipal,body||{}));
        return json(res,result?.status==="MISSION_EXECUTED"?200:202,result);
      } catch(error) { return json(res,400,{accepted:false,status:"CUSTOMER_EXECUTION_FAILED",error:error.message}); }
    }
    if(method==="GET" && path==="/v3/customer/lineage") {
      if(!this.executionPlatform?.customerProduction?.lineage) return json(res,503,{error:"customer_lineage_not_configured"});
      return json(res,200,{records:this.executionPlatform.customerProduction.lineage.list({
        tenantId:url.searchParams.get("tenantId")||undefined,
        projectId:url.searchParams.get("projectId")||undefined
      })});
    }

    if(method==="GET" && path==="/v3/customer/operations") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      return json(res,200,this.executionPlatform.customerOperations.status());
    }
    if(method==="POST" && path==="/v3/customer/operations/observe") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.customerObserve(body||{}));}
      catch(error){return json(res,400,{accepted:false,status:"OBSERVATION_FAILED",error:error.message});}
    }
    if(method==="GET" && path==="/v3/customer/incidents") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      return json(res,200,{incidents:this.executionPlatform.customerOperations.incidents.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }
    if(method==="GET" && path==="/v3/customer/health") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      return json(res,200,{events:this.executionPlatform.customerOperations.monitor.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }
    if(method==="POST" && path==="/v3/customer/learning") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,201,await this.executionPlatform.customerLearn(body||{}));
    }
    if(method==="GET" && path==="/v3/customer/optimization") {
      if(!this.executionPlatform?.customerOperations) return json(res,503,{error:"customer_operations_not_configured"});
      return json(res,200,this.executionPlatform.customerOperations.optimization.recommend({
        tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined
      }));
    }

    if(method==="GET" && path==="/v4/missions/status") {
      if(!this.executionPlatform?.missionDirector) return json(res,503,{error:"mission_director_not_configured"});
      return json(res,200,this.executionPlatform.missionDirector.status());
    }
    if(method==="GET" && path==="/v4/missions") {
      if(!this.executionPlatform?.missionDirector) return json(res,503,{error:"mission_director_not_configured"});
      return json(res,200,{missions:this.executionPlatform.missionDirector.state.list({status:url.searchParams.get("status")||undefined,limit:url.searchParams.get("limit")||100})});
    }
    if(method==="GET" && path==="/v4/missions/events") {
      if(!this.executionPlatform?.missionDirector) return json(res,503,{error:"mission_director_not_configured"});
      return json(res,200,{events:this.executionPlatform.missionDirector.ledger.list({missionId:url.searchParams.get("missionId")||undefined,limit:url.searchParams.get("limit")||100})});
    }
    if(method==="POST" && path==="/v4/missions/run") {
      if(!this.executionPlatform?.missionDirector) return json(res,503,{error:"mission_director_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.mission) return json(res,400,{error:"mission is required"});
      try {
        const result=await this.executionPlatform.missionRun({...body,context:{...(body.context||{}),tenantId}});
        return json(res,result.status==="COMPLETED"?200:202,result);
      } catch(error) {
        return json(res,400,{accepted:false,status:"MISSION_FAILED",error:error.message});
      }
    }

    if(method==="GET" && path==="/v4/teams/status") return json(res,200,this.executionPlatform?.agentTeams?.status?.()||{});
    if(method==="GET" && path==="/v4/teams") return json(res,200,{teams:this.executionPlatform.agentTeams.registry.list()});
    if(method==="POST" && path==="/v4/teams") {
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,201,this.executionPlatform.createAgentTeam(body||{}));}catch(error){return json(res,400,{accepted:false,error:error.message});}
    }
    if(method==="POST" && path==="/v4/teams/execute") {
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.agentTeamExecute(body||{}));}catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }
    if(method==="GET" && path==="/v4/teams/memory") return json(res,200,{records:this.executionPlatform.agentTeams.memory.search({query:url.searchParams.get("query")||"",limit:Number(url.searchParams.get("limit")||20)})});
    if(method==="POST" && path==="/v4/teams/review") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.agentTeams.review.review(body||{}));
    }

    if(method==="GET" && path==="/v4/agents/status") return json(res,200,this.executionPlatform?.agentSwarm?.status?.()||{});
    if(method==="POST" && path==="/v4/agents/route") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.agentRoute(body||{}));
    }
    if(method==="POST" && path==="/v4/agents/execute") {
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.agentExecute(body||{}));}catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }
    if(method==="POST" && path==="/v4/agents/execute-many") {
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.agentExecuteMany(Array.isArray(body)?body:(body.tasks||[])));}catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }
    if(method==="POST" && path==="/v4/agents/review") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.agentReview(body||{}));
    }

    if(method==="GET" && path==="/v4/customer/platform") return json(res,200,this.executionPlatform?.customerPlatformV4?.status?.()||{});
    if(method==="POST" && path==="/v4/customer/roles") {
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,201,this.executionPlatform.customerGrantRole(body||{}));}catch(error){return json(res,400,{accepted:false,error:error.message});}
    }
    if(method==="POST" && path==="/v4/customer/govern") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.customerGovern(body||{}));
    }
    if(method==="GET" && path==="/v4/customer/roles") {
      return json(res,200,{roles:this.executionPlatform.customerPlatformV4.access.list({tenantId:url.searchParams.get("tenantId")||undefined})});
    }
    if(method==="POST" && path==="/v4/customer/sla/record") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,201,this.executionPlatform.customerRecordSLA(body||{}));
    }
    if(method==="GET" && path==="/v4/customer/sla") {
      return json(res,200,this.executionPlatform.customerSLA({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined}));
    }
    if(method==="GET" && path==="/v4/customer/audit") {
      return json(res,200,{events:this.executionPlatform.customerPlatformV4.audit.list({tenantId:url.searchParams.get("tenantId")||undefined})});
    }

    if(method==="GET" && path==="/v3/customer/saas") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      return json(res,200,this.executionPlatform.customerSaaS.status());
    }
    if(method==="GET" && path==="/v3/customer/dashboard") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      return json(res,200,this.executionPlatform.customerSaaS.dashboard.overview({
        tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined
      }));
    }
    if(method==="GET" && path==="/v3/customer/users") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      return json(res,200,{users:this.executionPlatform.customerSaaS.identity.list({tenantId:url.searchParams.get("tenantId")||undefined})});
    }
    if(method==="POST" && path==="/v3/customer/users") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      const body=await readBody(req,this.maxBodyBytes); return json(res,201,await this.executionPlatform.customerSaaS.identity.create(body||{}));
    }
    if(method==="GET" && path==="/v3/customer/api-keys") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      return json(res,200,{keys:this.executionPlatform.customerSaaS.apiKeys.list({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }
    if(method==="POST" && path==="/v3/customer/api-keys") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      const body=await readBody(req,this.maxBodyBytes); return json(res,201,await this.executionPlatform.customerSaaS.apiKeys.issue(body||{}));
    }
    if(method==="POST" && path.match(/^\/v3\/customer\/api-keys\/[^/]+\/revoke$/)) {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      const id=path.split("/")[4]; return json(res,200,await this.executionPlatform.customerSaaS.apiKeys.revoke(id));
    }
    if(method==="GET" && path==="/v3/customer/billing") {
      if(!this.executionPlatform?.customerSaaS) return json(res,503,{error:"customer_saas_not_configured"});
      return json(res,200,{tenantId:url.searchParams.get("tenantId")||undefined,amount:this.executionPlatform.customerSaaS.billing.summary({tenantId:url.searchParams.get("tenantId")||undefined})});
    }

    if(method==="GET" && path==="/v3/customer/factory") {
      if(!this.executionPlatform?.applicationFactory) return json(res,503,{error:"customer_factory_not_configured"});
      return json(res,200,this.executionPlatform.applicationFactory.status());
    }
    if(method==="GET" && path==="/v3/customer/deliveries") {
      if(!this.executionPlatform?.applicationFactory) return json(res,503,{error:"customer_factory_not_configured"});
      return json(res,200,{deliveries:this.executionPlatform.applicationFactory.deliveries.list({
        tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined,
        missionId:url.searchParams.get("missionId")||undefined,limit:Number(url.searchParams.get("limit")||100)
      })});
    }
    if(method==="GET" && path==="/v3/customer/production-urls") {
      if(!this.executionPlatform?.applicationFactory) return json(res,503,{error:"customer_factory_not_configured"});
      return json(res,200,{urls:this.executionPlatform.applicationFactory.productionUrls.list({
        tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined,limit:Number(url.searchParams.get("limit")||100)
      })});
    }
    if(method==="GET" && path==="/v3/customer/usage/detail") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{usage:this.executionPlatform.customerControl.meter.list({tenantId:url.searchParams.get("tenantId")||undefined,limit:Number(url.searchParams.get("limit")||100)})});
    }

    if(method==="GET" && path==="/v2/customer") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.customerControl.status());
    }
    if(method==="POST" && path==="/v2/customer/tenants") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,201,await this.executionPlatform.customerControl.tenants.create(body||{}));
    }
    if(method==="POST" && path==="/v2/customer/projects") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,201,this.executionPlatform.customerControl.projects.create(body||{}));
    }
    if(method==="POST" && path==="/v3/customer/repository") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      const control=this.executionPlatform.customerControl;
      try {
        const tenant=await control.tenants.get(body.tenantId);
        const project=control.projects.get(body.projectId);
        if(!tenant) return json(res,404,{accepted:false,status:"TENANT_NOT_FOUND"});
        if(!project||project.tenantId!==tenant.id) return json(res,403,{accepted:false,status:"PROJECT_ACCESS_DENIED"});
        const result=await control.repositoryFactory?.provision({tenantId:tenant.id,projectId:project.id,name:body.name||project.name,description:body.description||"",repositoryName:body.repositoryName});
        if(!result?.accepted) return json(res,503,result||{accepted:false,status:"REPOSITORY_PROVISIONER_NOT_CONFIGURED"});
        const updated=await control.projects.attachRepository(project.id,result.repository);
        return json(res,201,{...result,project:updated});
      } catch(error) { return json(res,400,{accepted:false,status:"REPOSITORY_PROVISION_FAILED",error:error.message}); }
    }
    if(method==="POST" && path==="/v2/customer/missions") {
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,202,await this.executionPlatform.customerSubmit(body||{}));
    }
    if(method==="GET" && path==="/v2/customer/missions") {
      return json(res,200,{missions:this.executionPlatform.customerControl.missions.list(url.searchParams.get("tenantId")||undefined)});
    }
    if(method==="GET" && path==="/v2/customer/usage") {
      return json(res,200,{usage:this.executionPlatform.customerControl.meter.summarize({tenantId:url.searchParams.get("tenantId")||undefined,projectId:url.searchParams.get("projectId")||undefined})});
    }

    if(method==="GET" && path==="/v2/external") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.externalExecution.status());
    }

    if(method==="POST" && path==="/v2/external/execute") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.externalExecute(body||{}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="POST" && path==="/v2/external/end-to-end") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.externalEndToEnd(body||{}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="GET" && path==="/v2/external/evidence") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{records:this.executionPlatform.externalExecution.evidence.list({limit:url.searchParams.get("limit")||100})});
    }

    if(method==="GET" && path==="/v2/control/events") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{events:await this.executionPlatform.ledger.list({limit:url.searchParams.get("limit")||100,operation:url.searchParams.get("operation")||undefined})});
    }

    if(method==="POST" && path==="/v2/control/evaluate") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,await this.executionPlatform.control({...body,context:{...(body.context||{}),tenantId}}));
    }

    if(method==="POST" && path==="/v2/control/idempotent") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.operation || typeof body.result!=="undefined") {
        if(!body.operation) return json(res,400,{error:"operation is required"});
      }
      const key=body.idempotencyKey||req.headers["idempotency-key"];
      if(!key) return json(res,400,{error:"idempotencyKey is required"});
      return json(res,200,await this.executionPlatform.executeIdempotent({key,operation:body.operation,execute:async()=>body.result??{accepted:true,operation:body.operation}}));
    }

    if(method==="POST" && path==="/v2/control/verify-deployment") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,await this.executionPlatform.verifyDeployment(body||{}));
    }

    if(method==="POST" && path==="/v2/control/recover") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,await this.executionPlatform.recover(body||{}));
    }

    if(method==="POST" && path==="/v2/control/manifest") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.root) return json(res,400,{error:"root is required"});
      return json(res,200,await this.executionPlatform.manifest(body));
    }

    if(method==="POST" && path==="/v2/reliability/preflight") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      try{return json(res,200,await this.executionPlatform.reliabilityPreflight({...body,tenantId:body.tenantId||tenantId}));}
      catch(error){return json(res,400,{accepted:false,status:"FAILED",error:error.message});}
    }

    if(method==="GET" && path==="/v2/reliability/health-events") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{events:this.executionPlatform.reliability.eventBus.list(url.searchParams.get("limit")||100)});
    }

    if(method==="POST" && path==="/v2/resilience/evaluate") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.resilienceEvaluate(body||{}));
    }

    if(method==="GET" && path==="/v2/resilience/incidents") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{incidents:this.executionPlatform.resilience.incidents.list()});
    }

    if(method==="POST" && path==="/v2/resilience/feature-flags") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.name) return json(res,400,{error:"name is required"});
      return json(res,200,this.executionPlatform.resilience.flags.set(body.name,body));
    }

    if(method==="GET" && path==="/v2/release") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.releaseStatus());
    }
    if(method==="POST" && path==="/v2/release/promotion") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.evaluatePromotion(body||{}));
    }
    if(method==="POST" && path==="/v2/release/canary") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.evaluateCanary(body||{}));
    }
    if(method==="POST" && path==="/v2/release/verify") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.verifyRelease(body||{}));
    }

    if(method==="GET" && path==="/v2/delivery") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.deliveryStatus());
    }

    if(method==="POST" && path==="/v2/delivery/review") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.evaluateDeliveryReview(body||{}));
    }

    if(method==="POST" && path==="/v2/delivery/team-optimize") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.optimizeDeliveryTeam(body||{}));
    }

    if(method==="GET" && path==="/v2/platform") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,this.executionPlatform.status());
    }

    if(method==="GET" && path==="/v2/infrastructure") {
      if(!this.executionPlatform?.infrastructure) return json(res,503,{error:"infrastructure_control_plane_not_configured"});
      return json(res,200,this.executionPlatform.infrastructure.status());
    }
    if(method==="GET" && path==="/v2/infrastructure/live") {
      if(!this.executionPlatform?.infrastructure) return json(res,503,{error:"infrastructure_control_plane_not_configured"});
      return json(res,200,this.executionPlatform.infrastructure.live());
    }
    if(method==="GET" && path==="/v2/infrastructure/ready") {
      if(!this.executionPlatform?.infrastructure) return json(res,503,{error:"infrastructure_control_plane_not_configured"});
      const result=await this.executionPlatform.infrastructure.ready({tenantId});
      return json(res,result.ready?200:503,result);
    }

    if(method==="GET" && path==="/v2/approvals") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{approvals:this.executionPlatform.approvalGate.list()});
    }

    if(method==="POST" && path==="/v2/approvals") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,this.executionPlatform.requestApproval(body||{}));
    }

    const approvalMatch=path.match(/^\/v2\/approvals\/([^/]+)\/(approve|reject)$/);
    if(method==="POST" && approvalMatch) {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,200,approvalMatch[2]==="approve"
        ? this.executionPlatform.approve(approvalMatch[1])
        : this.executionPlatform.reject(approvalMatch[1],body.reason));
    }

    if(method==="POST" && path==="/v2/tests/run") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.cwd) return json(res,400,{error:"cwd is required"});
      return json(res,200,await this.executionPlatform.runTests({cwd:body.cwd,commandArgs:body.commandArgs||["test"]}));
    }

    if(method==="POST" && path==="/v2/github") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.operation) return json(res,400,{error:"operation is required"});
      return json(res,200,await this.executionPlatform.executeGitHub({operation:body.operation,payload:body.payload||{}}));
    }

    if(method==="POST" && path==="/v2/deploy") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(!body.provider) return json(res,400,{error:"provider is required"});
      const approval=this.executionPlatform.requestApproval({operation:"deploy:"+body.provider,risk:body.risk||"high",evidence:body.evidence||[]});
      if(!approval.approved) return json(res,202,{accepted:false,status:"APPROVAL_REQUIRED",approval});
      return json(res,200,await this.executionPlatform.deploy({provider:body.provider,target:body.target,payload:body.payload||{}}));
    }

    if(method==="GET" && path==="/v2/jobs") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      return json(res,200,{jobs:await this.executionPlatform.queue.list({limit:url.searchParams.get("limit")||50,status:url.searchParams.get("status")||undefined})});
    }

    if(method==="POST" && path==="/v2/jobs") {
      if(!this.executionPlatform) return json(res,503,{error:"execution_platform_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      return json(res,202,{accepted:true,status:"QUEUED",job:await this.executionPlatform.queue.enqueue({command:body.command,constraints:body.constraints||{},context:{...(body.context||{}),tenantId}})});
    }

    if(method==="GET" && path==="/v1/status") {
      return json(res,200,await this._status());
    }

    if(method==="GET" && path==="/v1/executions") {
      const executions=this.executionStore?.list ? await this.executionStore.list() : [];
      const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||20)));
      return json(res,200,{executions:executions.filter(e=>(e.input?.tenantId??e.tenantId??"default")===tenantId).slice(-limit).map(safeExecution)});
    }

    const executionMatch=path.match(/^\/v1\/executions\/([^/]+)$/);
    if(method==="GET" && executionMatch) {
      const execution=this.executionStore?.get ? await this.executionStore.get(executionMatch[1]) : null;
      if(!execution) return json(res,404,{error:"execution_not_found"});
      if((execution.input?.tenantId??execution.tenantId??"default")!==tenantId) return json(res,404,{error:"execution_not_found"});
      return json(res,200,{execution:safeExecution(execution)});
    }

    if(method==="GET" && path==="/v1/jobs") {
      if(!this.queue?.list) return json(res,503,{error:"queue_not_configured"});
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      const status=url.searchParams.get("status")||undefined;
      const jobs=await this.queue.list({limit,status});
      return json(res,200,{jobs:jobs.filter(job=>(job.context?.tenantId??"default")===tenantId)});
    }

    const jobMatch=path.match(/^\/v1\/jobs\/([^/]+)$/);
    if(method==="GET" && jobMatch) {
      if(!this.queue?.get) return json(res,503,{error:"queue_not_configured"});
      const job=await this.queue.get(jobMatch[1]);
      if(!job || (job.context?.tenantId??"default")!==tenantId) return json(res,404,{error:"job_not_found"});
      return json(res,200,{job});
    }

    if(method==="POST" && path==="/v1/jobs") {
      if(!this.queue?.enqueue) return json(res,503,{error:"queue_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.command!=="string" || !body.command.trim()) return json(res,400,{error:"command is required"});
      const job=await this.queue.enqueue({
        command:body.command.trim(),
        constraints:body.constraints??{},
        context:{...(body.context??{}),tenantId}
      });
      return json(res,202,{accepted:true,status:"QUEUED",job});
    }

    if(method==="GET" && path==="/v1/observability") {
      const events=this.observability?.list ? await this.observability.list() : [];
      const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||50)));
      return json(res,200,{events:events.filter(e=>!e.tenantId||e.tenantId===tenantId).slice(-limit)});
    }

    if((method==="GET" || method==="POST") && path==="/v1/search") {
      const body=method==="POST" ? await readBody(req,this.maxBodyBytes) : {};
      const query=String(method==="GET" ? (url.searchParams.get("q")||url.searchParams.get("query")||"") : (body.query||body.q||"")).trim();
      if(!query) return json(res,400,{error:"query is required"});
      if(!this.searchProvider?.search) return json(res,503,{error:"search_provider_not_configured"});
      try {
        const result=await this.searchProvider.search({
          query,
          maxResults:method==="GET" ? Number(url.searchParams.get("limit")||8) : Number(body.maxResults||body.limit||8),
          topic:method==="GET" ? (url.searchParams.get("topic")||"general") : (body.topic||"general")
        });
        return json(res,200,{accepted:true,status:"SEARCH_COMPLETED",...result});
      } catch(error) {
        const status=error.code==="SEARCH_NOT_CONFIGURED" ? 503 : (error.status>=400&&error.status<500 ? 502 : 502);
        return json(res,status,{accepted:false,status:error.code==="SEARCH_NOT_CONFIGURED"?"SEARCH_NOT_CONFIGURED":"SEARCH_FAILED",error:error.message});
      }
    }

    if(method==="GET" && path==="/v1/providers") {
      const status=this.modelGateway?.status?.()||{models:[]};
      const configured=status.models?.includes("jora");
      const providers=[{
        id:"jora",
        available:configured,
        free:false,
        label:"Jora AI",
        role:"primary"
      }];
      return json(res,200,{providers,defaultModel:"jora",liveCheck:configured,checkedAt:new Date().toISOString()});
    }

    if(method==="POST" && path==="/v1/execute") {
      const body=await readBody(req,this.maxBodyBytes);
      if(typeof body.command!=="string" || !body.command.trim()) {
        return json(res,400,{error:"command is required"});
      }
      const requestId=randomUUID();
      const selectedProvider=typeof body.context?.provider==="string" ? body.context.provider.trim() : "jora";
      if(selectedProvider && selectedProvider!=="jora") {
        return json(res,400,{requestId,accepted:false,status:"PROVIDER_NOT_AVAILABLE",error:"Jora is the only supported AI interface",provider:selectedProvider});
      }
      const gatewayStatus=this.modelGateway?.status?.()||{};
      if(this.modelGateway && !gatewayStatus.models?.includes("jora")) {
        return json(res,503,{requestId,accepted:false,status:"JORA_ENGINE_NOT_CONFIGURED",error:"Jora AI engine is not configured on the backend"});
      }
      try {
        const execute=()=>this.runtime.execute({
          command:body.command.trim(),
          constraints:body.constraints??{},
          context:{...(body.context??{}),apiRequestId:requestId,tenantId,provider:"jora"}
        });
        const result=await execute();
        return json(res,200,{requestId,accepted:true,status:result.status,result,provider:"jora",model:"jora"});
      } catch(error) {
        return json(res,500,{requestId,accepted:false,status:"FAILED",error:error.message,provider:"jora",model:"jora"});
      }
    }

    if(method==="POST" && path==="/v1/worker/start") {
      if(!this.worker?.run) return json(res,503,{error:"worker_not_configured"});
      const body=await readBody(req,this.maxBodyBytes);
      const command=typeof body.command==="string" && body.command.trim()
        ? body.command.trim()
        : "Improve Jora continuously";
      try {
        if(this.queue) {
          await this.queue.enqueue({command,context:{...(body.context??{}),tenantId}});
          if(!this.worker.running) {
            const promise=this.worker.run({context:body.context??{}});
            promise.catch(()=>{});
          }
          return json(res,202,{accepted:true,command,status:"QUEUED"});
        }
        const promise=this.worker.run({command,context:body.context??{}});
        promise.catch(()=>{});
        return json(res,202,{accepted:true,command,status:"STARTED"});
      } catch(error) {
        return json(res,409,{accepted:false,status:"REJECTED",error:error.message});
      }
    }

    if(method==="POST" && path==="/v1/worker/stop") {
      if(!this.worker?.stop) return json(res,503,{error:"worker_not_configured"});
      this.worker.stop();
      return json(res,200,{accepted:true,status:"STOP_REQUESTED"});
    }

    return json(res,404,{error:"not_found"});
  }

  async start() {
    if(this.server) return this.address();
    this.server=http.createServer((req,res)=>{
      this._route(req,res).catch(error=>{
        if(!res.headersSent) json(res,500,{error:error.message});
        else res.destroy();
      });
    });
    await new Promise((resolve,reject)=>{
      const onError=error=>{this.server?.off("error",onError);reject(error);};
      this.server.once("error",onError);
      this.server.listen(this.port,this.host,()=>{
        this.server?.off("error",onError);
        this.startedAt=Date.now();
        resolve();
      });
    });
    return this.address();
  }

  address() {
    const address=this.server?.address();
    return typeof address==="string"
      ? {address}
      : {host:address?.address??this.host,port:address?.port??this.port};
  }

  async stop() {
    if(!this.server) return;
    const server=this.server;
    this.server=null;
    await new Promise((resolve,reject)=>{
      server.close(error=>error?reject(error):resolve());
    });
  }
}
