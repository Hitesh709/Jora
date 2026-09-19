import {randomUUID} from "node:crypto";

async function storeWrite(store,value){if(store?.write) await store.write(value); else if(store?.save) await store.save(value);}

export class CustomerTenantRegistry {
  constructor({store=null}={}) { this.store=store; this.tenants=new Map(); }
  async load(){const rows=await this.store?.read?.([])||[];for(const t of rows)this.tenants.set(t.id,t);return this.list();}
  async create({name,plan="standard",metadata={}}={}) {
    if(!name?.trim()) throw new Error("tenant name is required");
    const id="tenant_"+randomUUID(); const tenant={id,name:name.trim(),plan,status:"ACTIVE",metadata,createdAt:new Date().toISOString()};
    this.tenants.set(id,tenant); await this.persist(); return tenant;
  }
  async get(id){return this.tenants.get(id)||null;}
  async suspend(id,reason="operator action"){const t=await this.get(id);if(!t)return null;t.status="SUSPENDED";t.reason=reason;t.updatedAt=new Date().toISOString();await this.persist();return t;}
  async persist(){await storeWrite(this.store,[...this.tenants.values()]);}
  list(){return [...this.tenants.values()];}
}

export class ProjectRegistry {
  constructor({store=null}={}){this.store=store;this.projects=new Map();}
  async load(){const rows=await this.store?.read?.([])||[];for(const p of rows)this.projects.set(p.id,p);return this.list();}
  create({tenantId,name,repository=null,environment="production",workspace=null,metadata={}}={}) {
    if(!tenantId||!name?.trim()) throw new Error("tenantId and project name are required");
    const id="project_"+randomUUID(); const project={id,tenantId,name:name.trim(),repository,environment,workspace,metadata,status:"ACTIVE",createdAt:new Date().toISOString()};
    this.projects.set(id,project); this.persist(); return project;
  }
  get(id){return this.projects.get(id)||null;}
  list(tenantId){return [...this.projects.values()].filter(p=>!tenantId||p.tenantId===tenantId);}
  async persist(){await storeWrite(this.store,[...this.projects.values()]);}
}

export class UsageMeter {
  constructor({store=null}={}){this.store=store;this.events=[];}
  async load(){this.events=await this.store?.read?.([])||[];return this.events;}
  record({tenantId,projectId,metric,quantity=1,unit="unit",metadata={}}={}) {
    const event={id:"usage_"+randomUUID(),tenantId,projectId,metric,quantity:Number(quantity)||0,unit,metadata,at:new Date().toISOString()};
    this.events.push(event); this.persist(); return event;
  }
  summarize({tenantId,projectId}={}) {return this.events.filter(e=>(!tenantId||e.tenantId===tenantId)&&(!projectId||e.projectId===projectId)).reduce((a,e)=>(a[e.metric]=(a[e.metric]||0)+e.quantity,a),{});}
  list({tenantId,limit=100}={}){return this.events.filter(e=>!tenantId||e.tenantId===tenantId).slice(-limit).reverse();}
  async persist(){await storeWrite(this.store,this.events);}
}

export class QuotaGuard {
  constructor({limits={},plans={}}={}){this.limits=limits;this.plans=plans;}
  limitsFor({tenant,metric}={}) {
    return this.limits[metric]!==undefined ? this.limits : (this.plans[tenant?.plan]?.quotas||{});
  }
  evaluate({tenantId,tenant,metric,current=0,requested=1}={}) {
    const limits=this.limitsFor({tenant,metric}); const limit=limits[metric];
    if(limit===undefined) return {allowed:true,status:"NO_QUOTA",metric,current,requested};
    const allowed=Number(current)+Number(requested)<=Number(limit);
    return {allowed,status:allowed?"WITHIN_QUOTA":"QUOTA_EXCEEDED",metric,limit,current,requested};
  }
}

export class CustomerMissionManager {
  constructor({store=null}={}){this.store=store;this.missions=new Map();}
  async load(){const rows=await this.store?.read?.([])||[];for(const m of rows)this.missions.set(m.id,m);return this.list();}
  create({tenantId,projectId,objective,constraints={}}={}) {
    if(!tenantId||!projectId||!objective?.trim()) throw new Error("tenantId, projectId and objective are required");
    const mission={id:"mission_"+randomUUID(),tenantId,projectId,objective:objective.trim(),constraints,status:"QUEUED",createdAt:new Date().toISOString()};
    this.missions.set(mission.id,mission); this.persist(); return mission;
  }
  transition(id,status,result=null){const mission=this.missions.get(id);if(!mission)return null;mission.status=status;mission.result=result;mission.updatedAt=new Date().toISOString();this.persist();return mission;}
  get(id){return this.missions.get(id)||null;}
  list(tenantId){return [...this.missions.values()].filter(m=>!tenantId||m.tenantId===tenantId);}
  async persist(){await storeWrite(this.store,[...this.missions.values()]);}
}

export class CustomerWorkspaceRegistry {
  constructor({store=null}={}){this.store=store;this.workspaces=new Map();}
  async load(){const rows=await this.store?.read?.([])||[];for(const w of rows)this.workspaces.set(w.id,w);return this.list();}
  async ensure({tenantId,projectId,path,environment="production",repository=null}={}) {
    let workspace=this.list().find(w=>w.tenantId===tenantId&&w.projectId===projectId&&w.environment===environment);
    if(workspace)return workspace;
    workspace={id:"workspace_"+randomUUID(),tenantId,projectId,path,environment,repository,status:"READY",createdAt:new Date().toISOString()};
    this.workspaces.set(workspace.id,workspace); await this.persist(); return workspace;
  }
  list({tenantId,projectId}={}){return [...this.workspaces.values()].filter(w=>(!tenantId||w.tenantId===tenantId)&&(!projectId||w.projectId===projectId));}
  async persist(){await storeWrite(this.store,[...this.workspaces.values()]);}
}

export class CustomerVersionRegistry {
  constructor(){this.versions=[];}
  record({tenantId,projectId,missionId,revision,status="CREATED",metadata={}}={}) {
    const version={id:"version_"+randomUUID(),tenantId,projectId,missionId,revision,status,metadata,createdAt:new Date().toISOString()};this.versions.push(version);return version;
  }
  list({tenantId,projectId,limit=100}={}){return this.versions.filter(v=>(!tenantId||v.tenantId===tenantId)&&(!projectId||v.projectId===projectId)).slice(-limit).reverse();}
}

export class CustomerRepositoryFactory {
  constructor({github=null,organization=null,privateRepositories=true}={}) { this.github=github; this.organization=organization; this.privateRepositories=privateRepositories; }
  async provision({tenantId,projectId,name,description="",repositoryName=null}={}) {
    if(!this.github?.provisionRepository) return {accepted:false,status:"GITHUB_REPOSITORY_PROVISIONER_NOT_CONFIGURED"};
    const repo=await this.github.provisionRepository({name:repositoryName||name,description,private:this.privateRepositories,organization:this.organization});
    return {accepted:true,status:"REPOSITORY_PROVISIONED",tenantId,projectId,repository:{owner:repo.owner?.login||repo.organization?.login||this.organization,name:repo.name,fullName:repo.full_name,cloneUrl:repo.clone_url,htmlUrl:repo.html_url,defaultBranch:repo.default_branch}};
  }
}

export class CustomerExecutionRouter {
  constructor({tenantRegistry,projectRegistry,missionManager,quotaGuard,meter,executionPlatform,workspaceRegistry=null,versionRegistry=null,repositoryFactory=null}={}) {Object.assign(this,{tenantRegistry,projectRegistry,missionManager,quotaGuard,meter,executionPlatform,workspaceRegistry,versionRegistry});}
  async submit({tenantId,projectId,objective,constraints={},metric="missions",quotaCurrent=null,workspacePath=null}={}) {
    const tenant=await this.tenantRegistry.get(tenantId); if(!tenant)return {accepted:false,status:"TENANT_NOT_FOUND"};
    if(tenant.status!=="ACTIVE")return {accepted:false,status:"TENANT_NOT_ACTIVE",tenantId};
    const project=this.projectRegistry.get(projectId); if(!project||project.tenantId!==tenantId)return {accepted:false,status:"PROJECT_ACCESS_DENIED"};
    const current=quotaCurrent===null?this.meter.summarize({tenantId})[metric]||0:quotaCurrent;
    const quota=this.quotaGuard.evaluate({tenantId,tenant,metric,current,requested:1}); if(!quota.allowed)return {accepted:false,status:"QUOTA_EXCEEDED",quota};
    const workspace=this.workspaceRegistry?await this.workspaceRegistry.ensure({tenantId,projectId,path:workspacePath||project.workspace||null,environment:project.environment,repository:project.repository}):null;
    const mission=this.missionManager.create({tenantId,projectId,objective,constraints});
    this.meter.record({tenantId,projectId,metric,quantity:1,metadata:{missionId:mission.id}});
    return {accepted:true,status:"MISSION_ACCEPTED",mission,quota,workspace};
  }
}

export class CustomerControlPlaneV2 {
  constructor({tenantRegistry=null,projects=null,missions=null,quota=null,meter=null,router=null,workspaceRegistry=null,versionRegistry=null}={}) {
    this.version="3.20.0";
    this.tenants=tenantRegistry??new CustomerTenantRegistry(); this.projects=projects??new ProjectRegistry(); this.missions=missions??new CustomerMissionManager();
    this.quota=quota??new QuotaGuard(); this.meter=meter??new UsageMeter(); this.workspaces=workspaceRegistry??new CustomerWorkspaceRegistry(); this.versions=versionRegistry??new CustomerVersionRegistry(); this.repositoryFactory=repositoryFactory??null;
    this.router=router??new CustomerExecutionRouter({tenantRegistry:this.tenants,projectRegistry:this.projects,missionManager:this.missions,quotaGuard:this.quota,meter:this.meter,workspaceRegistry:this.workspaces,versionRegistry:this.versions});
  }
  async load(){await Promise.all([this.tenants.load(),this.projects.load(),this.missions.load(),this.meter.load(),this.workspaces.load()]);}
  status(){return {version:this.version,capabilities:{tenantLifecycle:true,projectIsolation:true,usageMetering:true,quotaEnforcement:true,customerMissions:true,executionRouting:true,durableCustomerState:Boolean(this.tenants.store||this.projects.store||this.missions.store||this.meter.store),workspaces:true,projectVersions:true,planQuotas:true,customerIsolation:true,repositoryProvisioning:Boolean(this.repositoryFactory)}};}
}
