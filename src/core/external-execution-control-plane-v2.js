import {randomUUID} from "node:crypto";

export class GitHubExecutionAdapter {
  constructor({repository=null}={}) { this.repository=repository; }
  async mutate({branch,files=[],message="Jora autonomous change",targetBranch}={}) {
    if(!this.repository) return {accepted:false,status:"GITHUB_NOT_CONNECTED"};
    if(!branch) throw new Error("branch is required");
    const result=await this.repository.publishCandidate({branch,files,message,targetBranch});
    return {accepted:true,status:"GITHUB_MUTATION_COMPLETED",...result};
  }
  async pullRequest({title,body="",head,base,draft=false}={}) {
    if(!this.repository) return {accepted:false,status:"GITHUB_NOT_CONNECTED"};
    const result=await this.repository.createPullRequest({title,body,head,base,draft});
    return {accepted:true,status:"PULL_REQUEST_CREATED",pullRequest:result};
  }
  async rollback({ref,targetBranch}={}) {
    if(!this.repository) return {accepted:false,status:"GITHUB_NOT_CONNECTED"};
    return this.repository.rollback(ref,targetBranch);
  }
  async waitForCI({branch,headSha,timeoutMs,pollMs}={}) {
    if(!this.repository) return {passed:false,status:"GITHUB_NOT_CONNECTED"};
    return this.repository.waitForWorkflow({branch,headSha,timeoutMs,pollMs});
  }
}

export class RealTestExecutionAdapter {
  constructor({runner=null}={}) { this.runner=runner; }
  async run({cwd,commandArgs=["test"],timeoutMs}={}) {
    if(!this.runner) return {accepted:false,status:"TEST_RUNNER_NOT_CONNECTED"};
    const startedAt=new Date().toISOString();
    try {
      const result=await this.runner({cwd,commandArgs,timeoutMs});
      return {accepted:true,status:result?.status??"TESTS_COMPLETED",startedAt,finishedAt:new Date().toISOString(),result};
    } catch(error) {
      return {accepted:true,status:"TESTS_FAILED",startedAt,finishedAt:new Date().toISOString(),error:error.message};
    }
  }
}

export class DeploymentProviderAdapter {
  constructor({client=null,name="unknown"}={}) { this.client=client; this.name=name; }
  async deploy({target,payload={}}={}) {
    if(!this.client) return {accepted:false,status:"DEPLOYMENT_NOT_CONFIGURED",provider:this.name,target};
    return this.client.deploy({target,payload});
  }
}

export class DeploymentStatusPoller {
  constructor({statusReader=null,intervalMs=5000,timeoutMs=300000}={}) {
    this.statusReader=statusReader; this.intervalMs=intervalMs; this.timeoutMs=timeoutMs;
  }
  async wait({deploymentId,target}={}) {
    if(!this.statusReader) return {status:"STATUS_POLLING_NOT_CONFIGURED",deploymentId,target};
    const deadline=Date.now()+this.timeoutMs;
    while(Date.now()<=deadline) {
      const state=await this.statusReader({deploymentId,target});
      if(state?.terminal) return state;
      await new Promise(resolve=>setTimeout(resolve,this.intervalMs));
    }
    return {status:"TIMEOUT",deploymentId,target};
  }
}

export class ProductionHealthVerifier {
  constructor({healthVerifier=null}={}) { this.healthVerifier=healthVerifier; }
  async verify({url,headers,timeoutMs}={}) {
    if(this.healthVerifier?.verify) return this.healthVerifier.verify({url,headers,timeoutMs});
    if(!url) return {healthy:false,status:"HEALTH_URL_REQUIRED"};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs??10000);
    try {
      const response=await fetch(url,{headers,signal:controller.signal});
      return {healthy:response.ok,status:response.ok?"HEALTHY":"UNHEALTHY",httpStatus:response.status};
    } catch(error) {
      return {healthy:false,status:"UNHEALTHY",error:error.message};
    } finally { clearTimeout(timer); }
  }
}

export class AutomaticRollbackExecutor {
  constructor({rollback=null}={}) { this.rollback=rollback; }
  async execute({target,ref,payload={}}={}) {
    if(!this.rollback) return {rolledBack:false,status:"ROLLBACK_NOT_CONFIGURED",target};
    return this.rollback({target,ref,payload});
  }
}

export class ExecutionEvidenceStore {
  constructor({ledger=null}={}) { this.ledger=ledger; this.records=[]; }
  async record(event={}) {
    const record={id:"evidence_"+randomUUID(),at:new Date().toISOString(),...event};
    this.records.push(record);
    if(this.ledger?.append) await this.ledger.append({operation:"external-execution-evidence",status:record.status??"RECORDED",result:record});
    return record;
  }
  list({limit=100}={}) { return this.records.slice(-Math.max(1,Math.min(500,Number(limit)||100))).reverse(); }
}

export class ExternalExecutionControlPlaneV2 {
  constructor({github=null,tests=null,deployments={},deploymentStatus=null,health=null,rollback=null,evidence=null}={}) {
    this.version="2.80.0";
    this.github=github;
    this.tests=tests;
    this.deployments=deployments;
    this.deploymentStatus=deploymentStatus;
    this.health=health;
    this.rollback=rollback;
    this.evidence=evidence??new ExecutionEvidenceStore();
  }
  status() {
    return {
      version:this.version,
      capabilities:{
        githubMutation:Boolean(this.github),
        realTests:Boolean(this.tests),
        deploymentAdapters:Object.keys(this.deployments),
        deploymentPolling:Boolean(this.deploymentStatus),
        productionHealth:Boolean(this.health),
        automaticRollback:Boolean(this.rollback),
        executionEvidence:Boolean(this.evidence)
      }
    };
  }
  async execute({operation,payload={}}={}) {
    let result;
    if(operation==="github.mutate") result=await this.github?.mutate(payload);
    else if(operation==="github.pullRequest") result=await this.github?.pullRequest(payload);
    else if(operation==="github.ci") result=await this.github?.waitForCI(payload);
    else if(operation==="tests.run") result=await this.tests?.run(payload);
    else if(operation==="deploy") {
      const adapter=this.deployments[payload.provider];
      result=adapter?await adapter.deploy(payload):{accepted:false,status:"DEPLOYMENT_NOT_CONFIGURED",provider:payload.provider};
    } else if(operation==="deployment.status") result=await this.deploymentStatus?.wait(payload);
    else if(operation==="health.verify") result=await this.health?.verify(payload);
    else if(operation==="rollback") result=await this.rollback?.execute(payload);
    else throw new Error("unsupported external execution operation: "+operation);
    return this.evidence.record({operation,status:result?.status??"COMPLETED",result});
  }
  async endToEnd({branch,files=[],message,title="Jora autonomous delivery",base,target,provider,payload={},healthUrl}={}) {
    const mutation=await this.execute({operation:"github.mutate",payload:{branch,files,message,targetBranch:base}});
    if(!mutation.result?.commit && mutation.status!=="GITHUB_MUTATION_COMPLETED") return {status:"MUTATION_FAILED",mutation};
    const sha=mutation.result.commit;
    const ci=await this.execute({operation:"github.ci",payload:{branch,headSha:sha}});
    if(!ci.result?.passed) return {status:"CI_FAILED",mutation,ci};
    const pr=await this.execute({operation:"github.pullRequest",payload:{title,head:branch,base}});
    if(pr.result?.accepted===false) return {status:"PR_FAILED",mutation,ci,pr};
    const deployment=await this.execute({operation:"deploy",payload:{provider,target,payload:{...payload,commit:sha}}});
    if(!deployment.result?.accepted) return {status:"DEPLOYMENT_FAILED",mutation,ci,pr,deployment};
    let deploymentStatus=null;
    const deploymentId=deployment.result?.result?.deploymentId||deployment.result?.result?.id||deployment.result?.deploymentId;
    if(deploymentId && this.deploymentStatus) {
      deploymentStatus=await this.execute({operation:"deployment.status",payload:{deploymentId,target}});
      if(["FAILED","CANCELLED","TIMEOUT"].includes(String(deploymentStatus.result?.status||"").toUpperCase())) {
        return {status:"DEPLOYMENT_FAILED",mutation,ci,pr,deployment,deploymentStatus};
      }
    }
    const resolvedHealthUrl=healthUrl||deployment.result?.result?.url||deployment.result?.result?.productionUrl||deployment.result?.result?.deploymentUrl||null;
    let health=null;
    if(resolvedHealthUrl) {
      health=await this.execute({operation:"health.verify",payload:{url:resolvedHealthUrl}});
      if(!health.result?.healthy) {
        const rollback=await this.execute({operation:"rollback",payload:{target,ref:base,payload}});
        return {status:"ROLLED_BACK",mutation,ci,pr,deployment,deploymentStatus,health,rollback,productionUrl:resolvedHealthUrl};
      }
    }
    return {status:"DELIVERED",mutation,ci,pr,deployment,deploymentStatus,health,productionUrl:resolvedHealthUrl};
  }
}
