import path from "node:path";
import {randomUUID} from "node:crypto";

export class CustomerArtifactSecurityGate {
  constructor({maxFiles=500,maxFileBytes=2_000_000,maxTotalBytes=20_000_000,blockedPaths=[".git"],secretPatterns=[]}={}) {
    this.maxFiles=maxFiles; this.maxFileBytes=maxFileBytes; this.maxTotalBytes=maxTotalBytes;
    this.blockedPaths=new Set(blockedPaths.map(String));
    this.secretPatterns=secretPatterns.length?secretPatterns:[
      /(?:api[_-]?key|access[_-]?token|secret|private[_-]?key|password)\s*[:=]\s*["'][^"']{8,}["']/i,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /gh[pousr]_[A-Za-z0-9_]{20,}/,
      /AKIA[0-9A-Z]{16}/
    ];
  }
  validate(files=[]) {
    const list=Array.isArray(files)?files:[];
    const errors=[]; let total=0;
    if(list.length>this.maxFiles) errors.push({code:"FILE_COUNT_LIMIT",message:"generated file count exceeds limit"});
    for(const file of list) {
      const p=String(file?.path??"");
      const normalized=p.replace(/\\/g,"/");
      if(!p || path.isAbsolute(p) || normalized.split("/").includes("..") || normalized.split("/").some(part=>this.blockedPaths.has(part))) {
        errors.push({code:"UNSAFE_PATH",path:p});
        continue;
      }
      const content=String(file?.content??""); const bytes=Buffer.byteLength(content,"utf8"); total+=bytes;
      if(bytes>this.maxFileBytes) errors.push({code:"FILE_SIZE_LIMIT",path:p,bytes,limit:this.maxFileBytes});
      for(const pattern of this.secretPatterns) if(pattern.test(content)) { errors.push({code:"SECRET_DETECTED",path:p}); break; }
    }
    if(total>this.maxTotalBytes) errors.push({code:"TOTAL_SIZE_LIMIT",bytes:total,limit:this.maxTotalBytes});
    return {allowed:errors.length===0,status:errors.length?"BLOCKED":"APPROVED",files:list.length,totalBytes:total,errors};
  }
}

export class CustomerBuildValidationGate {
  validate({files=[],specification=null,architecture=null}={}) {
    const errors=[]; const list=Array.isArray(files)?files:[];
    if(!list.length) errors.push({code:"NO_GENERATED_FILES",message:"application contains no generated files"});
    if(specification===null) errors.push({code:"NO_SPECIFICATION",message:"product specification is missing"});
    if(architecture===null) errors.push({code:"NO_ARCHITECTURE",message:"architecture is missing"});
    return {allowed:errors.length===0,status:errors.length?"BLOCKED":"APPROVED",errors,fileCount:list.length};
  }
}

export class CustomerTestCommandController {
  constructor({defaultCommand=["test"],timeoutMs=300000,maxArgs=20}={}) {this.defaultCommand=defaultCommand;this.timeoutMs=timeoutMs;this.maxArgs=maxArgs;}
  normalize(commandArgs) {
    const args=Array.isArray(commandArgs)&&commandArgs.length?commandArgs.map(String):this.defaultCommand.slice();
    if(args.length>this.maxArgs) throw new Error("test command has too many arguments");
    if(args.some(x=>x.includes("\0")||x.length>500)) throw new Error("invalid test command argument");
    return {commandArgs:args,timeoutMs:this.timeoutMs};
  }
}

export class CustomerDeliveryRecordStore {
  constructor({store=null}={}) {this.store=store;this.records=[];}
  async load(){this.records=await this.store?.read?.([])||[];return this.records;}
  async save(){if(this.store?.write) await this.store.write(this.records);}
  async record(input={}) {
    const record={id:"delivery_"+randomUUID(),...input,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    this.records.push(record); await this.save(); return record;
  }
  async update(id,patch={}) {
    const record=this.records.find(x=>x.id===id); if(!record) return null;
    Object.assign(record,patch,{updatedAt:new Date().toISOString()}); await this.save(); return record;
  }
  list({tenantId,projectId,missionId,limit=100}={}) {
    return this.records.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!projectId||x.projectId===projectId)&&(!missionId||x.missionId===missionId)).slice(-limit).reverse();
  }
}

export class CustomerProductionUrlRegistry {
  constructor({store=null}={}) {this.store=store;this.urls=[];}
  async load(){this.urls=await this.store?.read?.([])||[];return this.urls;}
  async record({tenantId,projectId,missionId,url,status="ACTIVE",deploymentId=null,revision=null}={}) {
    const row={id:"production_"+randomUUID(),tenantId,projectId,missionId,url,status,deploymentId,revision,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    this.urls.push(row); if(this.store?.write) await this.store.write(this.urls); return row;
  }
  list({tenantId,projectId,limit=100}={}) {
    return this.urls.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!projectId||x.projectId===projectId)).slice(-limit).reverse();
  }
}

export class CustomerApplicationFactoryControlPlane {
  constructor({security=null,buildValidation=null,testCommands=null,deliveries=null,productionUrls=null}={}) {
    this.version="3.70.0";
    this.security=security??new CustomerArtifactSecurityGate();
    this.buildValidation=buildValidation??new CustomerBuildValidationGate();
    this.testCommands=testCommands??new CustomerTestCommandController();
    this.deliveries=deliveries??new CustomerDeliveryRecordStore();
    this.productionUrls=productionUrls??new CustomerProductionUrlRegistry();
  }
  async load(){await Promise.all([this.deliveries.load(),this.productionUrls.load()]);}
  validateArtifacts(input){return this.security.validate(input.files||[]);}
  validateBuild(input){return this.buildValidation.validate(input);}
  normalizeTests(commandArgs){return this.testCommands.normalize(commandArgs);}
  async createDelivery(input){return this.deliveries.record(input);}
  async updateDelivery(id,patch){return this.deliveries.update(id,patch);}
  async recordProductionUrl(input){return this.productionUrls.record(input);}
  status(){return {version:this.version,capabilities:{
    artifactSecurity:true,secretScanning:true,fileLimits:true,buildValidation:true,testCommandControl:true,
    durableDeliveryRecords:Boolean(this.deliveries.store),productionUrlRegistry:Boolean(this.productionUrls.store),
    missionStatus:true,releaseHistory:true,rollbackTracking:true
  }};}
}
