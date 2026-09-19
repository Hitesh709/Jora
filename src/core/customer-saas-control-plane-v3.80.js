import {randomUUID} from "node:crypto";

export class CustomerIdentityDirectory {
  constructor({store=null}={}){this.store=store;this.users=[];}
  async load(){this.users=await this.store?.read?.([])||[];return this.users;}
  async save(){if(this.store?.write) await this.store.write(this.users);}
  async create({tenantId,email,role="member",name=""}={}) {
    if(!tenantId||!email?.trim()) throw new Error("tenantId and email are required");
    const user={id:"customer_user_"+randomUUID(),tenantId,email:email.trim().toLowerCase(),name,role,status:"ACTIVE",createdAt:new Date().toISOString()};
    this.users.push(user);await this.save();return user;
  }
  list({tenantId,limit=100}={}){return this.users.filter(x=>!tenantId||x.tenantId===tenantId).slice(-limit).reverse();}
}

export class CustomerApiKeyManager {
  constructor({store=null}={}){this.store=store;this.keys=[];}
  async load(){this.keys=await this.store?.read?.([])||[];return this.keys;}
  async save(){if(this.store?.write) await this.store.write(this.keys);}
  async issue({tenantId,projectId,name="api-key"}={}) {
    const secret="jora_"+randomUUID().replaceAll("-","");
    const key={id:"key_"+randomUUID(),tenantId,projectId,name,status:"ACTIVE",createdAt:new Date().toISOString(),secretHash:Buffer.from(secret).toString("base64")};
    this.keys.push(key);await this.save();return {...key,secret};
  }
  async revoke(id){const key=this.keys.find(x=>x.id===id);if(!key)return null;key.status="REVOKED";key.revokedAt=new Date().toISOString();await this.save();return key;}
  list({tenantId,projectId}={}){return this.keys.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!projectId||x.projectId===projectId)).map(({secretHash,...safe})=>safe);}
}

export class CustomerPlanBillingController {
  constructor({plans={},store=null}={}){this.plans=plans;this.store=store;this.events=[];}
  async load(){this.events=await this.store?.read?.([])||[];}
  async record({tenantId,metric,quantity=1,unitPrice=0,metadata={}}={}) {
    const event={id:"billing_"+randomUUID(),tenantId,metric,quantity:Number(quantity)||0,unitPrice:Number(unitPrice)||0,amount:(Number(quantity)||0)*(Number(unitPrice)||0),metadata,createdAt:new Date().toISOString()};
    this.events.push(event);if(this.store?.write)await this.store.write(this.events);return event;
  }
  summary({tenantId}={}){return this.events.filter(x=>!tenantId||x.tenantId===tenantId).reduce((a,x)=>a+x.amount,0);}
  plan(name="standard"){return this.plans[name]||null;}
}

export class CustomerDashboardService {
  constructor({customerControl,applicationFactory}={}){this.customerControl=customerControl;this.applicationFactory=applicationFactory;}
  overview({tenantId,projectId}={}) {
    const missions=this.customerControl.missions.list(tenantId).filter(x=>!projectId||x.projectId===projectId);
    const usage=this.customerControl.meter.summarize({tenantId,projectId});
    const versions=this.customerControl.versions.list({tenantId,projectId,limit:10});
    const deliveries=this.applicationFactory?.deliveries?.list({tenantId,projectId,limit:10})||[];
    const urls=this.applicationFactory?.productionUrls?.list({tenantId,projectId,limit:10})||[];
    return {tenantId,projectId,missions,usage,versions,deliveries,productionUrls:urls};
  }
}

export class CustomerSaaSControlPlaneV3 {
  constructor({customerControl,applicationFactory,identity=null,apiKeys=null,billing=null}={}) {
    this.version="3.80.0";this.customerControl=customerControl;this.applicationFactory=applicationFactory;
    this.identity=identity??new CustomerIdentityDirectory();this.apiKeys=apiKeys??new CustomerApiKeyManager();this.billing=billing??new CustomerPlanBillingController();
    this.dashboard=new CustomerDashboardService({customerControl,applicationFactory});
  }
  async load(){await Promise.all([this.identity.load(),this.apiKeys.load(),this.billing.load()]);}
  status(){return {version:this.version,capabilities:{customerIdentity:true,customerDashboard:true,apiKeys:true,planManagement:true,billingMetering:true,projectControls:true,usageControls:true,releaseHistory:true,productionUrls:true}};}
}
