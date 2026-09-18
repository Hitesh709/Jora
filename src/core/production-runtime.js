import {AgentSpecPlanner} from "./agent-spec-planner.js";
import {ProjectFactory} from "./project-factory.js";
import {AgentFactory} from "./agent-factory.js";
import {EvolutionEngine} from "./evolution.js";
import {Evaluator} from "./evaluator.js";
import {ModelProjectBuilder} from "./model-project-builder.js";
import {AutonomousBuildPipeline} from "./autonomous-build-pipeline.js";
import {DockerSandbox} from "./docker-sandbox.js";
import {createProjectTestRunner} from "./project-test-runner.js";
import {ProductionAgentBuilder} from "./production-agent-builder.js";
import {AutonomousDelivery} from "./autonomous-delivery.js";
import {AutonomousController} from "./autonomous-controller.js";
import {PromotionController} from "./promotion-controller.js";
import {WorkspaceRepository} from "./workspace-repository.js";
import {GitHubRestRepository} from "./github-rest-repository.js";
import {GitHubCIGate} from "./github-ci-gate.js";
import {createWorkspaceSecurityCouncil} from "./security-checks.js";
import {JoraRuntime} from "./jora-runtime.js";
import {JsonStore} from "./json-store.js";
import {PersistentExecutionStore} from "./persistent-execution-store.js";
import {BenchmarkStore} from "./benchmark-store.js";
import {ChampionStore} from "./champion-store.js";
import {DurableWorker} from "./durable-worker.js";
import {DeploymentController} from "./deployment-controller.js";
import {StagedDeploymentController} from "./staged-deployment-controller.js";
import {HttpDeploymentAdapter} from "./http-deployment-adapter.js";
import {HttpHealthCheck} from "./http-health-check.js";
import {HealthCheck} from "./health-check.js";
import {ObservabilityStore} from "./observability-store.js";
import {OperatorApi} from "./operator-api.js";
import {createPostgresLeaseStore} from "./postgres-lease-store.js";
import {createPostgresTaskQueue} from "./postgres-task-queue.js";
import {createPostgresExecutionStore} from "./postgres-execution-store.js";
import {MetricsCollector} from "./metrics-collector.js";
import path from "node:path";
import {OperationalHealthMonitor} from "./operational-health-monitor.js";
import {RecoveryOrchestrator} from "./recovery-orchestrator.js";
import {IncidentManager} from "./incident-manager.js";
import {AccessController} from "./access-controller.js";
import {AuditLog} from "./audit-log.js";
import {PolicyEngine} from "./policy-engine.js";
import {GovernanceStateMachine} from "./governance-state-machine.js";

class CandidateEvaluator {
  async evaluate({candidate,champion,security,benchmarkScore,qualityScore}={}) {
    const evaluation=candidate?.evaluation??{};
    const candidateBenchmark=benchmarkScore??evaluation.benchmarkScore??0;
    const candidateQuality=qualityScore??evaluation.qualityScore??0;
    const championBenchmark=champion?.evaluation?.benchmarkScore??-Infinity;
    const championQuality=champion?.evaluation?.qualityScore??-Infinity;
    const passed=Boolean(
      evaluation.passed &&
      security?.passed &&
      candidateBenchmark>=0.8 &&
      candidateQuality>=0.8 &&
      (championBenchmark===-Infinity ||
        candidateBenchmark>=championBenchmark)
    );
    return {
      passed,
      benchmarkScore:candidateBenchmark,
      qualityScore:candidateQuality,
      comparedToChampion:championBenchmark===-Infinity
        ? "NO_CHAMPION"
        : {
            benchmarkDelta:candidateBenchmark-championBenchmark,
            qualityDelta:candidateQuality-championQuality
          },
      reasons:passed
        ? ["Candidate passed tests, security, quality and champion benchmark gates"]
        : ["Candidate failed a promotion gate or did not meet the champion benchmark"]
    };
  }
}

function createHealthGate(url,{attempts,intervalMs}={}) {
  if(!url) return null;
  const httpHealth=new HttpHealthCheck({url});
  return new HealthCheck({
    attempts,
    intervalMs,
    checkFn:input=>httpHealth.check(input)
  });
}

function createDeploymentController({
  webhookUrl,
  healthUrl,
  healthAttempts,
  healthIntervalMs,
  timeoutMs,
  observability
}) {
  if(!webhookUrl) return null;
  return new DeploymentController({
    adapter:new HttpDeploymentAdapter({
      deployUrl:webhookUrl,
      timeoutMs
    }),
    healthCheck:createHealthGate(healthUrl,{
      attempts:healthAttempts,
      intervalMs:healthIntervalMs
    }),
    store:observability
  });
}

export async function createProductionJoraRuntime({config,modelGateway}={}) {
  if(!config) throw new Error("config is required");
  if(!modelGateway) throw new Error("modelGateway is required");

  const remoteRepository=config.github?.token && config.github?.owner && config.github?.repo
    ? new GitHubRestRepository(config.github)
    : null;
  const repository=new WorkspaceRepository({
    root:config.workspace,
    remoteRepository
  });
  await repository.prepareCandidate("startup-"+Date.now());
  const benchmarkStore=new BenchmarkStore({store:new JsonStore({file:config.benchmarkStateFile||"./.jora/benchmarks.json"})});
  await benchmarkStore.load();
  const distributedConfig=config.distributed??{};
  const executionStore=distributedConfig.enabled
    ? await createPostgresExecutionStore({connectionString:distributedConfig.databaseUrl,namespace:distributedConfig.queueNamespace||"jora",maxConnections:distributedConfig.maxConnections})
    : new PersistentExecutionStore({store:new JsonStore({file:config.persistence})});
  const championStore=new ChampionStore({
    store:new JsonStore({file:config.championStateFile})
  });
  await championStore.load();
  const securityCouncil=createWorkspaceSecurityCouncil({repository});
  const sandbox=new DockerSandbox({image:config.docker.image,network:config.docker.network});
  const testRunner=createProjectTestRunner({sandbox});
  const evaluator=new Evaluator({minimumScore:0.8});
  const projectBuilder=new ModelProjectBuilder({modelGateway,repository});
  const buildPipeline=new AutonomousBuildPipeline({
    projectBuilder,testRunner,evaluator,securityCouncil,benchmarkStore
  });
  const factory=new ProjectFactory({
    pipeline:buildPipeline,
    evaluator:{evaluateProject:async args=>buildPipeline.evaluateProject(args)}
  });
  const planner=new AgentSpecPlanner();
  const agentFactory=new AgentFactory({planner,projectFactory:factory});
  const evolution=new EvolutionEngine({evaluator});
  const delivery=new AutonomousDelivery({agentFactory,evolution,maxRepairCycles:3});
  const builder=new ProductionAgentBuilder({planner,factory,delivery});
  const ciGate=remoteRepository
    ? new GitHubCIGate({
        repository:remoteRepository,
        timeoutMs:config.ci?.timeoutMs,
        pollMs:config.ci?.pollMs
      })
    : null;
  const policyRules=config.policy??{};
  const policyEngine=new PolicyEngine({rules:policyRules});

  const promotion=new PromotionController({
    evaluator:new CandidateEvaluator(),
    repository,
    targetBranch:repository.baseBranch??config.github?.branch??"main",
    ciGate,
    policyEngine
  });
  const controller=new AutonomousController({
    delivery,
    securityCouncil,
    promotion,
    championStore,
    maxCycles:config.autonomous?.maxCycles??4,
    policyEngine
  });

  const metrics=new MetricsCollector();
  const auditLog=new AuditLog({observability:null});

  const observability=new ObservabilityStore({
    store:new JsonStore({file:config.observabilityStateFile||"./.jora/observability.json"})
  });

  auditLog.observability=observability;
  policyEngine.auditLog=observability;
  const deploymentConfig=config.deployment??{};
  const productionConfig=deploymentConfig.production??deploymentConfig;
  const productionDeployment=deploymentConfig.enabled
    ? createDeploymentController({
        webhookUrl:productionConfig.webhookUrl,
        healthUrl:productionConfig.healthUrl,
        healthAttempts:productionConfig.healthAttempts,
        healthIntervalMs:productionConfig.healthIntervalMs,
        timeoutMs:deploymentConfig.timeoutMs,
        observability
      })
    : null;

  let deploymentController=productionDeployment;
  const stagingConfig=deploymentConfig.staging??{};
  if(deploymentConfig.enabled && stagingConfig.enabled) {
    if(!stagingConfig.webhookUrl) throw new Error("staging deployment is enabled but JORA_STAGING_DEPLOYMENT_WEBHOOK_URL is missing");
    if(!productionDeployment) throw new Error("staging deployment requires a production deployment webhook");
    const stagingDeployment=createDeploymentController({
      webhookUrl:stagingConfig.webhookUrl,
      healthUrl:stagingConfig.healthUrl,
      healthAttempts:stagingConfig.healthAttempts,
      healthIntervalMs:stagingConfig.healthIntervalMs,
      timeoutMs:deploymentConfig.timeoutMs,
      observability
    });
    deploymentController=new StagedDeploymentController({
      staging:stagingDeployment,
      production:productionDeployment,
      store:observability
    });
  }

  const queueStore=distributedConfig.enabled
    ? await createPostgresTaskQueue({
        connectionString:distributedConfig.databaseUrl,
        namespace:distributedConfig.queueNamespace||"jora",
        leaseMs:distributedConfig.leaseTtlMs,
        maxConnections:distributedConfig.maxConnections
      })
    : null;
  const leaseStore=distributedConfig.enabled
    ? await createPostgresLeaseStore({
        connectionString:distributedConfig.databaseUrl,
        namespace:distributedConfig.leaseNamespace,
        ttlMs:distributedConfig.leaseTtlMs,
        maxConnections:distributedConfig.maxConnections
      })
    : null;

  const governance=new GovernanceStateMachine({store:executionStore,auditLog});
  const runtime=new JoraRuntime({
    builder,
    controller,
    executionStore,
    repository,
    deploymentController,
    metrics,
    governance
  });
  const worker=new DurableWorker({
    store:new JsonStore({file:config.worker?.stateFile||"./.jora/worker.json"}),
    workerId:config.distributed?.owner||"jora-worker",
    leaseStore,
    queueStore,
    metrics,
    intervalMs:config.worker?.intervalMs??60000,
    heartbeatMs:config.worker?.heartbeatMs??10000,
    staleAfterMs:config.worker?.staleAfterMs??120000,
    maxCycles:config.worker?.maxCycles??Infinity,
    cycle:async ({cycle,command,context})=>runtime.execute({
      command:command??"Improve Jora",
      constraints:{},
      context:{
        ...context,
        cycle,
        modelGateway,
        benchmarkStore,
        championStore,
        workspace:config.workspace,
        sandbox,
        network:config.docker.network,
        securityConfig:config.security
      }
    })
  });
  runtime.continuousWorker=worker;
  const recoveryConfig=config.recovery??{};
  const recovery=new RecoveryOrchestrator({observability,worker,queue:queueStore,deploymentController,controller,policy:recoveryConfig.policy});
  const incidentManager=new IncidentManager({observability});
  const healthConfig=config.operationalHealth??{};
  const healthMonitor=healthConfig.enabled
    ? new OperationalHealthMonitor({metrics,observability,worker,queue:queueStore,thresholds:healthConfig.thresholds,onAlert:async alert=>{const incident=await incidentManager.open(alert); await incidentManager.startRecovery(incident.id,{action:recovery.policy[alert.alertType]}); const result=await recovery.handle(alert); if(String(result.status).includes("FAILED")) await incidentManager.failRecovery(incident.id,result.error); else await incidentManager.resolve(incident.id,result); return result;}})
    : null;
  let healthTimer=null;
  if(healthMonitor) {
    healthTimer=setInterval(()=>void healthMonitor.check().catch(()=>{}),healthConfig.intervalMs??30000);
    healthTimer.unref?.();
  }

  const accessTokens={};
  if(config.api?.accessTokens) { for(const entry of String(config.api.accessTokens).split(",").map(x=>x.trim()).filter(Boolean)) { const [token,tenantId="default",roles="admin"]=entry.split(":"); if(token) accessTokens[token]={id:token.slice(0,8),tenantId,roles:roles.split("+")}; } }
  const accessController=new AccessController({tokens:accessTokens});
  const api=config.api?.enabled
    ? new OperatorApi({
        runtime,
        executionStore,
        observability,
        metrics,
        worker,
        queue:queueStore,
        host:config.api.host,
        port:config.api.port,
        authToken:config.api.authToken,
        maxBodyBytes:config.api.maxBodyBytes,
        rateLimitPerMinute:config.api.rateLimitPerMinute,
        dashboardPath:path.resolve(process.cwd(),"src/operator/dashboard.html"),
        healthMonitor,
        incidentManager,
        accessController,
        auditLog
      })
    : null;
  return {
    runtime,repository,remoteRepository,ciGate,securityCouncil,sandbox,testRunner,benchmarkStore,
    executionStore,championStore,worker,leaseStore,queueStore,observability,metrics,auditLog,healthMonitor,healthTimer,recovery,incidentManager,deploymentController,api,modelGateway,config
  };
}
