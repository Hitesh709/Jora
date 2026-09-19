import {randomUUID} from "node:crypto";

export class CustomerTenantRegistry {
  constructor({store=null}={}) { this.store=store; this.tenants=new Map(); }
  async create({name,plan="standard",metadata={}}={}) {
    if(!name?.trim()) throw new Error("tenant name is required");
    const id="tenant_"+randomUUID();
    const tenant={id,name:name.trim(),plan,status:"ACTIVE",metadata,createdAt:new Date().toISOString()};
    this.tenants.set(id,tenant); await this.persist(); return tenant;
  }
  async get(id){return this.tenants.get(id)||null;}
  async suspend(id,reason="operator action"){const t=await this.get(id);if(!t)return null;t.status="SUSPENDED";t.reason=reason;t.updatedAt=new Date().toISOString();await this.persist();return t;}
  async persist(){if(this.store?.save)await this.store.save([...this.tenants.values()]);}
  list(){return [...this.tenants.values()];}
}

export class ProjectRegistry {
  constructor(){this.projects=new Map();}
  create({tenantId,name,repository=null,environment="production"}={}) {
    if(!tenantId||!name?.trim()) throw new Error("tenantId and project name are required");
    const id="project_"+randomUUID();
    const project={id,tenantId,name:name.trim(),repository,environment,status:"ACTIVE",createdAt:new Date().toISOString()};
    this.projects.set(id,project); return project;
  }
  get(id){return this.projects.get(id)||null;}
  list(tenantId){return [...this.projects.values()].filter(p=>!tenantId||p.tenantId===tenantId);}
}

export class UsageMeter {
  constructor(){this.events=[];}
  record({tenantId,projectId,metric,quantity=1,unit="unit",metadata={}}={}) {
    const event={id:"usage_"+randomUUID(),tenantId,projectId,metric,quantity:Number(quantity)||0,unit,metadata,at:new Date().toISOString()};
    this.events.push(event); return event;
  }
  summarize({tenantId,projectId}={}) {
    const rows=this.events.filter(e=>(!tenantId||e.tenantId===tenantId)&&(!projectId||e.projectId===projectId));
    return rows.reduce((acc,e)=>{acc[e.metric]=(acc[e.metric]||0)+e.quantity;return acc;},{});
  }
  list({tenantId,limit=100}={}){return this.events.filter(e=>!tenantId||e.tenantId===tenantId).slice(-limit).reverse();}
}

export class QuotaGuard {
  constructor({limits={}}={}){this.limits=limits;}
  evaluate({tenantId,metric,current=0,requested=1}={}) {
    const limit=this.limits[metric];
    if(limit===undefined) return {allowed:true,status:"NO_QUOTA"};
    const allowed=Number(current)+Number(requested)<=Number(limit);
    return {allowed,status:allowed?"WITHIN_QUOTA":"QUOTA_EXCEEDED",metric,limit,current,requested};
  }
}

export class CustomerMissionManager {
  constructor(){this.missions=new Map();}
  create({tenantId,projectId,objective,constraints={}}={}) {
    if(!tenantId||!projectId||!objective?.trim()) throw new Error("tenantId, projectId and objective are required");
    const mission={id:"mission_"+randomUUID(),tenantId,projectId,objective:objective.trim(),constraints,status:"QUEUED",createdAt:new Date().toISOString()};
    this.missions.set(mission.id,mission); return mission;
  }
  transition(id,status,result=null){
    const mission=this.missions.get(id); if(!mission) return null;
    mission.status=status; mission.result=result; mission.updatedAt=new Date().toISOString(); return mission;
  }
  get(id){return this.missions.get(id)||null;}
  list(tenantId){return [...this.missions.values()].filter(m=>!tenantId||m.tenantId===tenantId);}
}

export class CustomerExecutionRouter {
  constructor({tenantRegistry,projectRegistry,missionManager,quotaGuard,meter,executionPlatform}={}) {
    Object.assign(this,{tenantRegistry,projectRegistry,missionManager,quotaGuard,meter,executionPlatform});
  }
  async submit({tenantId,projectId,objective,constraints={},metric="missions",quotaCurrent=0}={}) {
    const tenant=await this.tenantRegistry.get(tenantId);
    if(!tenant) return {accepted:false,status:"TENANT_NOT_FOUND"};
    if(tenant.status!=="ACTIVE") return {accepted:false,status:"TENANT_NOT_ACTIVE",tenantId};
    const project=this.projectRegistry.get(projectId);
    if(!project||project.tenantId!==tenantId) return {accepted:false,status:"PROJECT_ACCESS_DENIED"};
    const quota=this.quotaGuard.evaluate({tenantId,metric,current:quotaCurrent,requested:1});
    if(!quota.allowed) return {accepted:false,status:"QUOTA_EXCEEDED",quota};
    const mission=this.missionManager.create({tenantId,projectId,objective,constraints});
    this.meter.record({tenantId,projectId,metric,quantity:1,metadata:{missionId:mission.id}});
    return {accepted:true,status:"MISSION_ACCEPTED",mission,quota};
  }
}

export class CustomerControlPlaneV2 {
  constructor({tenantRegistry=null,projects=null,missions=null,quota=null,meter=null,router=null}={}) {
    this.version="2.90.0";
    this.tenants=tenantRegistry??new CustomerTenantRegistry();
    this.projects=projects??new ProjectRegistry();
    this.missions=missions??new CustomerMissionManager();
    this.quota=quota??new QuotaGuard();
    this.meter=meter??new UsageMeter();
    this.router=router??new CustomerExecutionRouter({tenantRegistry:this.tenants,projectRegistry:this.projects,missionManager:this.missions,quotaGuard:this.quota,meter:this.meter});
  }
  status(){return {version:this.version,capabilities:{tenantLifecycle:true,projectIsolation:true,usageMetering:true,quotaEnforcement:true,customerMissions:true,executionRouting:true}};}
}
