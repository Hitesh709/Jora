import {randomUUID} from "node:crypto";

export class CustomerAccessGovernance {
  constructor(){this.roles=new Map();this.audit=[];}
  grant({tenantId,userId,role="member",projectId=null}={}) {
    if(!tenantId||!userId) throw new Error("tenantId and userId are required");
    const key=[tenantId,userId,projectId||"*"].join(":"); const record={id:"grant_"+randomUUID(),tenantId,userId,projectId,role,createdAt:new Date().toISOString()};
    this.roles.set(key,record); this.audit.push({type:"ROLE_GRANTED",record}); return record;
  }
  authorize({tenantId,userId,projectId=null,requiredRole="member"}={}) {
    const hierarchy={viewer:1,member:2,operator:3,admin:4,owner:5};
    const record=this.roles.get([tenantId,userId,projectId||"*"].join(":"))||this.roles.get([tenantId,userId,"*"].join(":"));
    const allowed=Boolean(record)&&((hierarchy[record.role]||0)>=(hierarchy[requiredRole]||1));
    this.audit.push({type:"AUTHORIZATION",tenantId,userId,projectId,requiredRole,allowed,at:new Date().toISOString()});
    return {allowed,status:allowed?"AUTHORIZED":"FORBIDDEN",role:record?.role||null};
  }
  list({tenantId}={}){return [...this.roles.values()].filter(x=>!tenantId||x.tenantId===tenantId);}
}

export class CustomerEntitlementEngine {
  constructor({plans={free:{missions:10,projects:2},pro:{missions:100,projects:20},enterprise:{missions:10000,projects:1000}}}={}){this.plans=plans;}
  evaluate({plan="free",metric,value=0}={}) {
    const limit=this.plans[plan]?.[metric];
    return {allowed:limit===undefined||Number(value)<Number(limit),plan,metric,value,limit:limit??null};
  }
}

export class CustomerSLAEngine {
  constructor({targets={availability:0.99,responseMs:2000}}={}){this.targets=targets;this.samples=[];}
  record({tenantId,projectId,availability=null,responseMs=null,status="OK"}={}) {
    const sample={id:"sla_"+randomUUID(),tenantId,projectId,availability,responseMs,status,at:new Date().toISOString()};
    this.samples.push(sample); return sample;
  }
  evaluate({tenantId,projectId}={}) {
    const rows=this.samples.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!projectId||x.projectId===projectId));
    const availability=rows.length?rows.filter(x=>x.availability==null||x.availability>=this.targets.availability).length/rows.length:1;
    const latency=rows.filter(x=>x.responseMs==null||x.responseMs<=this.targets.responseMs).length/(rows.length||1);
    return {tenantId,projectId,targets:this.targets,measured:{availability,latencyCompliance:latency},withinSLA:availability>=this.targets.availability&&latency>=0.99,samples:rows.length};
  }
}

export class CustomerAuditLedger {
  constructor(){this.events=[];}
  append(event={}){const row={id:"audit_"+randomUUID(),at:new Date().toISOString(),...event};this.events.push(row);return row;}
  list({tenantId,limit=100}={}){return this.events.filter(x=>!tenantId||x.tenantId===tenantId).slice(-limit).reverse();}
}

export class CustomerGovernanceEngine {
  constructor({access,entitlements,sla,audit}={}){this.access=access;this.entitlements=entitlements;this.sla=sla;this.audit=audit;}
  evaluate({tenantId,userId,projectId,requiredRole="member",plan="free",metric,value=0}={}) {
    const auth=this.access.authorize({tenantId,userId,projectId,requiredRole});
    const entitlement=this.entitlements.evaluate({plan,metric,value});
    const result={authorized:auth.allowed&&entitlement.allowed,auth,entitlement};
    this.audit.append({tenantId,userId,projectId,type:"GOVERNANCE_DECISION",result});
    return result;
  }
  status(){return {rbac:true,entitlements:true,sla:true,audit:true,governance:true};}
}

export class CustomerPlatformV4 {
  constructor({access=null,entitlements=null,sla=null,audit=null}={}) {
    this.version="4.0.0";
    this.access=access??new CustomerAccessGovernance();
    this.entitlements=entitlements??new CustomerEntitlementEngine();
    this.sla=sla??new CustomerSLAEngine();
    this.audit=audit??new CustomerAuditLedger();
    this.governance=new CustomerGovernanceEngine({access:this.access,entitlements:this.entitlements,sla:this.sla,audit:this.audit});
  }
  status(){return {version:this.version,capabilities:{customerRBAC:true,planEntitlements:true,slaManagement:true,auditLedger:true,governance:true,selfServiceControls:true,enterpriseIsolation:true}};}
}
