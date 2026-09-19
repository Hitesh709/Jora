import {AgentSpecPlanner} from "./agent-spec-planner.js";
import {AgentRegistry} from "./agent-registry.js";
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
import {RegressionAnalyzer} from "./regression-analyzer.js";
import {ChampionSelector} from "./champion-selector.js";
import {AutonomousEvolutionController} from "./autonomous-evolution-controller.js";
import {CandidatePopulation} from "./candidate-population.js";
import {LearningMemory} from "./learning-memory.js";
import {ExperimentEngine} from "./experiment-engine.js";
import {ParallelCandidateRunner} from "./parallel-candidate-runner.js";
import {MultiGenerationEngine} from "./multi-generation-engine.js";
import {CodebaseIndex} from "./codebase-index.js";
import {ArchitectureAnalyzer} from "./architecture-analyzer.js";
import {RefactorPlanner} from "./refactor-planner.js";
import {ChangeImpactAnalyzer} from "./change-impact-analyzer.js";
import {CodeMaster} from "./code-master.js";
import {LineageStore} from "./lineage-store.js";
import {AgentMemory} from "./agent-memory.js";
import {KnowledgeStore} from "./knowledge-store.js";
import {KnowledgeRetriever} from "./knowledge-retriever.js";
import {SharedTeamMemory} from "./shared-team-memory.js";
import {RoadmapEngine} from "./roadmap-engine.js";
import {MissionManager} from "./mission-manager.js";
import {AutonomousMissionRunner} from "./autonomous-mission-runner.js";
import {JORA_MASTER_ROADMAP} from "./jora-1.01-1.50-roadmap.js";
import {AutonomousProgramManager} from "./autonomous-program-manager.js";
import {AutonomousArchitect} from "./autonomous-architect.js";
import {SelfTaskGenerator} from "./task-generator.js";
import {AgentRuntime} from "./agent-runtime.js";
import {ToolRegistry} from "./tool-registry.js";
import {ArchitectureRegressionIntelligence,SystemDependencyIntelligence,AutonomousSecurityArchitect,PolicyDrivenAutonomy,AutonomousIncidentCommander,SLOAwareRecoveryController,ContinuousEvolutionController,AutonomousProgramDirector,AutonomousArchitectCore} from "./autonomous-architect-core.js";
import {ArchitectureStore,TaskDAGOptimizer,TaskContractEngine,AdaptiveExecutionPlanner,ResourceAwareScheduler,CheckpointStore,IdempotencyGuard,MissionTransactionManager} from "./autonomous-planning.js";
import {AgentCapabilityRegistry,AgentRoutingEngine,AgentNegotiationProtocol,ParallelSpecialistOrchestrator,SharedArtifactWorkspace,CollaborativeReviewGraph,AgentQualityGate,AgentLifecycleManager,AgentTeamOptimizer} from "./specialist-intelligence.js";
import {KnowledgeIngestionPipeline,KnowledgeIndex,EvidenceAwareRetriever,ProvenanceManager,KnowledgeConflictResolver,MemoryConsolidationEngine,FailurePatternLibrary,StrategyEffectivenessModel,ExperienceGuidedPlanner,ContinuousLearningLoop} from "./autonomous-knowledge.js";
import {MutationStrategyEngine} from "./mutation-strategy-engine.js";
import {EvolutionScheduler} from "./evolution-scheduler.js";
import {ResearchLoop} from "./research-loop.js";
import {ExecutionPlatformV2,PersistentLocalQueue,ApprovalGate,WorkerPool,WebhookDeploymentClient} from "./execution-platform-v2.js";
import {ExecutionLedger,IdempotencyGuard as V2IdempotencyGuard,PolicyEngine as ControlPolicyEngine,PreflightGate,ArtifactManifest,DeploymentHealthVerifier,RollbackCoordinator,RecoveryController,FactoryCheckpointStore,AutonomousControlLoop} from "./autonomous-control-plane-v2.js";
import {ProductUnderstandingEngine} from "./product-understanding-engine.js";
import {ArchitecturePlanningEngine} from "./architecture-planning-engine.js";
import {TaskDAGGenerationEngine} from "./task-dag-generation-engine.js";
import {AutonomousProductBuilder} from "./autonomous-product-builder.js";
import {AutonomousCodingOrchestrator} from "./autonomous-coding-orchestrator.js";
import {AutonomousEngineeringLoop} from "./autonomous-engineering-loop.js";
import {SelfImprovingEngineeringCore} from "./self-improving-engineering-core.js";
import {AutonomousSoftwareFactory} from "./autonomous-software-factory.js";
import {ProductionInfrastructureControlPlane,StartupConfigValidator,ReadinessProbe,GracefulShutdownCoordinator,DependencyHealthRegistry,DurableStateRecoveryScanner,RuntimeResourceGuard,RuntimeConfigSnapshot} from "./production-infrastructure-control-plane-v2.js";
import {GitHubExecutionAdapter,RealTestExecutionAdapter,DeploymentProviderAdapter,DeploymentStatusPoller,ProductionHealthVerifier,AutomaticRollbackExecutor,ExecutionEvidenceStore,ExternalExecutionControlPlaneV2} from "./external-execution-control-plane-v2.js";
import {CustomerControlPlaneV2,CustomerTenantRegistry,ProjectRegistry,CustomerMissionManager,QuotaGuard,UsageMeter,CustomerExecutionRouter,CustomerWorkspaceRegistry,CustomerVersionRegistry,CustomerRepositoryFactory} from "./customer-control-plane-v2.js";
import {CustomerApplicationFactoryControlPlane,CustomerArtifactSecurityGate,CustomerBuildValidationGate,CustomerTestCommandController,CustomerDeliveryRecordStore,CustomerProductionUrlRegistry} from "./customer-application-factory-v3.70.js";
import {CustomerSaaSControlPlaneV3,CustomerIdentityDirectory,CustomerApiKeyManager,CustomerPlanBillingController} from "./customer-saas-control-plane-v3.80.js";

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
  const infrastructureValidator=new StartupConfigValidator();
  const configValidation=infrastructureValidator.validate({config,required:["workspace"]});
  if(!configValidation.valid) throw new Error("invalid production configuration: missing "+configValidation.missing.join(", "));

  const observability=new ObservabilityStore({
    store:new JsonStore({file:config.observabilityStateFile||"./.jora/observability.json"})
  });

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
  const lineageStore=new LineageStore({store:new JsonStore({file:config.lineageStateFile||"./.jora/lineage.json"})});
  await lineageStore.load();
  const codeIndex=new CodebaseIndex({repository});
  const architectureAnalyzer=new ArchitectureAnalyzer();
  const refactorPlanner=new RefactorPlanner({architectureAnalyzer});
  const impactAnalyzer=new ChangeImpactAnalyzer();
  const codeMaster=new CodeMaster({repository,index:codeIndex,architecture:architectureAnalyzer,planner:refactorPlanner,impact:impactAnalyzer});
  const championStore=new ChampionStore({
    store:new JsonStore({file:config.championStateFile}),
    lineageStore
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
  const agentRegistry=new AgentRegistry();
  const agentMemory=new AgentMemory({store:new JsonStore({file:config.memory?.agentStateFile||"./.jora/agent-memory.json"}),maxRecords:config.memory?.maxRecords??5000});
  await agentMemory.load();
  const knowledgeStore=new KnowledgeStore({store:new JsonStore({file:config.memory?.knowledgeStateFile||"./.jora/knowledge.json"}),maxRecords:config.memory?.knowledgeRecords??10000});
  await knowledgeStore.load();
  const knowledgeRetriever=new KnowledgeRetriever({knowledgeStore,agentMemory});
  const knowledgeIngestion=new KnowledgeIngestionPipeline({knowledgeStore});
  const knowledgeIndex=new KnowledgeIndex({knowledgeStore});
  const evidenceRetriever=new EvidenceAwareRetriever({knowledgeStore,agentMemory});
  const provenanceManager=new ProvenanceManager();
  const conflictResolver=new KnowledgeConflictResolver();
  const sharedTeamMemory=new SharedTeamMemory({memory:agentMemory});
  const agentFactory=new AgentFactory({planner,projectFactory:factory,registry:agentRegistry});
  const capabilityRegistry=new AgentCapabilityRegistry({registry:agentRegistry});
  const agentRouter=new AgentRoutingEngine({registry:agentRegistry,capabilityRegistry});
  const negotiationProtocol=new AgentNegotiationProtocol();
  const agentToolRegistry=new ToolRegistry();
  const agentRuntime=new AgentRuntime({toolRegistry:agentToolRegistry,modelGateway,memory:agentMemory,retriever:knowledgeRetriever});
  const parallelSpecialists=new ParallelSpecialistOrchestrator({runtime:agentRuntime,concurrency:config.evolution?.agentConcurrency??4});
  const artifactWorkspace=new SharedArtifactWorkspace();
  const reviewGraph=new CollaborativeReviewGraph({registry:agentRegistry});
  const agentQualityGate=new AgentQualityGate();
  const agentLifecycle=new AgentLifecycleManager({registry:agentRegistry,factory:agentFactory});
  const teamOptimizer=new AgentTeamOptimizer({registry:agentRegistry});
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
  const regressionAnalyzer=new RegressionAnalyzer();
  const championSelector=new ChampionSelector({minimumScore:0.8,minimumDelta:0});
  const population=new CandidatePopulation({maxSize:config.evolution?.populationSize??8});
  const mutationStrategy=new MutationStrategyEngine();
  const evolutionScheduler=new EvolutionScheduler({maxGenerations:config.evolution?.maxGenerations??10});
  const researchLoop=new ResearchLoop({strategyEngine:mutationStrategy,scheduler:evolutionScheduler});
  const candidateRunner=new ParallelCandidateRunner({concurrency:config.evolution?.concurrency??4,runner:async candidate=>candidate});
  const experimentEngine=new ExperimentEngine({benchmarkStore});
  const learningMemory=new LearningMemory({maxRecords:config.evolution?.learningRecords??10000,store:new JsonStore({file:config.evolution?.learningStateFile||"./.jora/learning.json"})});
  await learningMemory.load();
  const memoryConsolidation=new MemoryConsolidationEngine({learningMemory,knowledgeStore});
  const failurePatterns=new FailurePatternLibrary({knowledgeStore});
  const strategyModel=new StrategyEffectivenessModel({learningMemory});
  const experiencePlanner=new ExperienceGuidedPlanner({strategyModel,learningMemory});
  const continuousLearning=new ContinuousLearningLoop({learningMemory,knowledgeStore,consolidator:memoryConsolidation,observability});
  const populationEngine=new MultiGenerationEngine({delivery,population,maxCandidates:config.evolution?.populationSize??8});
  const autonomousEvolution=new AutonomousEvolutionController({generationEngine:populationEngine,experimentEngine,learningMemory,scheduler:evolutionScheduler,selector:championSelector,maxGenerations:config.evolution?.maxGenerations??10});

  const promotion=new PromotionController({
    evaluator:new CandidateEvaluator(),
    repository,
    targetBranch:repository.baseBranch??config.github?.branch??"main",
    ciGate,
    policyEngine,
    regressionAnalyzer,
    benchmarkStore,
    championSelector
  });
  const controller=new AutonomousController({
    delivery,
    securityCouncil,
    promotion,
    championStore,
    population,
    researchLoop,
    maxCycles:config.autonomous?.maxCycles??4,
    policyEngine
  });

  const metrics=new MetricsCollector();
  const productUnderstanding=new ProductUnderstandingEngine({modelGateway});
  const architecturePlanner=new ArchitecturePlanningEngine({modelGateway,productUnderstanding});
  const taskDAGGenerator=new TaskDAGGenerationEngine({modelGateway});
  const autonomousProductBuilder=new AutonomousProductBuilder({runtime:null,modelGateway});
  const autonomousCodingOrchestrator=new AutonomousCodingOrchestrator();
  const autonomousEngineeringLoop=new AutonomousEngineeringLoop();
  const selfImprovingEngineeringCore=new SelfImprovingEngineeringCore();
  const autonomousSoftwareFactory=new AutonomousSoftwareFactory();
  let platformQueue=null;
  const approvalGate=new ApprovalGate({autoApproveLowRisk:config.executionPlatform?.autoApproveLowRisk!==false});
  const workerPool=new WorkerPool({concurrency:config.executionPlatform?.workerConcurrency??2});
  const railwayDeploymentClient=new WebhookDeploymentClient({webhookUrl:config.deployment?.railway?.webhookUrl,timeoutMs:config.deployment?.timeoutMs});
  const vercelDeploymentClient=new WebhookDeploymentClient({webhookUrl:config.deployment?.vercel?.webhookUrl,timeoutMs:config.deployment?.timeoutMs});
  const executionLedger=new ExecutionLedger({store:new JsonStore({file:config.executionPlatform?.ledgerFile||"./.jora/v2-execution-ledger.json"})});
  const controlPolicy=new ControlPolicyEngine();
  const controlPreflight=new PreflightGate({policyEngine:controlPolicy});
  const artifactManifest=new ArtifactManifest();
  const healthVerifier=new DeploymentHealthVerifier({timeoutMs:config.executionPlatform?.healthTimeoutMs||10000});
  const v2CheckpointStore=new FactoryCheckpointStore({file:config.executionPlatform?.checkpointFile||"./.jora/v2-checkpoints.json"});
  const rollbackCoordinator=new RollbackCoordinator({deploymentClient:async ({target,payload})=>{
    const client=target==="vercel"?vercelDeploymentClient:target==="railway"?railwayDeploymentClient:railwayDeploymentClient;
    return client.deploy({target,payload});
  },ledger:executionLedger});
  const recoveryController=new RecoveryController({healthVerifier,rollbackCoordinator,ledger:executionLedger});
  const controlLoop=new AutonomousControlLoop({ledger:executionLedger,policy:controlPolicy,preflight:controlPreflight,checkpoints:v2CheckpointStore});
  const infrastructureDependencies=new DependencyHealthRegistry();
  infrastructureDependencies.register("execution-store",async()=>true);
  infrastructureDependencies.register("model-gateway",async()=>Boolean(modelGateway),{critical:true});
  const infrastructureReadiness=new ReadinessProbe({checks:{runtime:async()=>true}});
  const infrastructureShutdown=new GracefulShutdownCoordinator({timeoutMs:config.executionPlatform?.shutdownTimeoutMs??30000});
  infrastructureShutdown.register("worker",async()=>worker?.stop?.());
  const infrastructureRecovery=new DurableStateRecoveryScanner({stores:[executionStore,lineageStore,championStore,learningMemory]});
  const infrastructure=new ProductionInfrastructureControlPlane({validator:infrastructureValidator,readiness:infrastructureReadiness,shutdown:infrastructureShutdown,dependencies:infrastructureDependencies,recovery:infrastructureRecovery,resources:new RuntimeResourceGuard({maxConcurrent:config.executionPlatform?.maxConcurrent??100,maxMemoryMb:config.executionPlatform?.maxMemoryMb??2048}),configSnapshot:new RuntimeConfigSnapshot({version:"2.70.0",config})});
  const externalEvidence=new ExecutionEvidenceStore({ledger:executionLedger});
  const externalRollback=new AutomaticRollbackExecutor({rollback:async ({target,ref,payload})=>{
    if(remoteRepository && ref) return remoteRepository.rollback(ref,config.github?.branch||"main");
    const client=target==="vercel"?vercelDeploymentClient:railwayDeploymentClient;
    return client.deploy({target,payload});
  }});
  const customerConfig=config.customer??{};
  const customerTenants=new CustomerTenantRegistry({store:new JsonStore({file:customerConfig.tenantStateFile||"./.jora/customer-tenants.json"})});
  const customerProjects=new ProjectRegistry({store:new JsonStore({file:customerConfig.projectStateFile||"./.jora/customer-projects.json"})});
  const customerMissions=new CustomerMissionManager({store:new JsonStore({file:customerConfig.missionStateFile||"./.jora/customer-missions.json"})});
  const customerMeter=new UsageMeter({store:new JsonStore({file:customerConfig.usageStateFile||"./.jora/customer-usage.json"})});
  const customerWorkspaces=new CustomerWorkspaceRegistry({store:new JsonStore({file:customerConfig.workspaceStateFile||"./.jora/customer-workspaces.json"})});
  const customerVersions=new CustomerVersionRegistry({store:new JsonStore({file:customerConfig.versionStateFile||"./.jora/customer-versions.json"})});
  const customerRepositoryFactory=new CustomerRepositoryFactory({
    github:remoteRepository,
    organization:customerConfig.githubOrganization||config.github?.customerOrganization||null,
    privateRepositories:customerConfig.privateRepositories!==false
  });
  const customerQuota=new QuotaGuard({limits:customerConfig.quotas||{},plans:customerConfig.plans||{}});
  const customerRouter=new CustomerExecutionRouter({tenantRegistry:customerTenants,projectRegistry:customerProjects,missionManager:customerMissions,quotaGuard:customerQuota,meter:customerMeter,executionPlatform:null,workspaceRegistry:customerWorkspaces,versionRegistry:customerVersions,repositoryFactory:customerRepositoryFactory});
  const customerLineageStore=new JsonStore({file:customerConfig.lineageStateFile||"./.jora/customer-lineage.json"});
  const customerDeliveryStore=new JsonStore({file:customerConfig.deliveryStateFile||"./.jora/customer-deliveries.json"});
  const customerProductionUrlStore=new JsonStore({file:customerConfig.productionUrlStateFile||"./.jora/customer-production-urls.json"});
  const customerApplicationFactory=new CustomerApplicationFactoryControlPlane({
    security:new CustomerArtifactSecurityGate(customerConfig.artifactSecurity||{}),
    buildValidation:new CustomerBuildValidationGate(),
    testCommands:new CustomerTestCommandController({timeoutMs:customerConfig.testTimeoutMs||300000}),
    deliveries:new CustomerDeliveryRecordStore({store:customerDeliveryStore}),
    productionUrls:new CustomerProductionUrlRegistry({store:customerProductionUrlStore})
  });

  const customerIdentity=new CustomerIdentityDirectory({store:new JsonStore({file:customerConfig.identityStateFile||"./.jora/customer-identities.json"})});
  const customerApiKeys=new CustomerApiKeyManager({store:new JsonStore({file:customerConfig.apiKeyStateFile||"./.jora/customer-api-keys.json"})});
  const customerBilling=new CustomerPlanBillingController({plans:customerConfig.plans||{},store:new JsonStore({file:customerConfig.billingStateFile||"./.jora/customer-billing.json"})});
  const customerControl=new CustomerControlPlaneV2({tenantRegistry:customerTenants,projects:customerProjects,missions:customerMissions,quota:customerQuota,meter:customerMeter,router:customerRouter,workspaceRegistry:customerWorkspaces,versionRegistry:customerVersions,repositoryFactory:customerRepositoryFactory,artifactLineageStore:customerLineageStore});
  await customerControl.load();
  const customerSaaS=new CustomerSaaSControlPlaneV3({customerControl,applicationFactory:customerApplicationFactory,identity:customerIdentity,apiKeys:customerApiKeys,billing:customerBilling});
  await customerSaaS.load();

  const externalExecution=new ExternalExecutionControlPlaneV2({
    github:new GitHubExecutionAdapter({repository:remoteRepository}),
    tests:new RealTestExecutionAdapter({runner:testRunner}),
    deployments:{
      railway:new DeploymentProviderAdapter({client:railwayDeploymentClient,name:"railway"}),
      vercel:new DeploymentProviderAdapter({client:vercelDeploymentClient,name:"vercel"})
    },
    deploymentStatus:new DeploymentStatusPoller({intervalMs:config.executionPlatform?.deploymentPollMs??5000,timeoutMs:config.executionPlatform?.deploymentTimeoutMs??300000}),
    health:new ProductionHealthVerifier({healthVerifier}),
    rollback:externalRollback,
    evidence:externalEvidence
  });

  const executionPlatform=new ExecutionPlatformV2({
    github:remoteRepository,
    sandbox,
    testRunner,
    queue:platformQueue,
    approvalGate,
    workerPool,
    deploymentClients:{railway:railwayDeploymentClient,vercel:vercelDeploymentClient},
    ledger:executionLedger,
    idempotency:new V2IdempotencyGuard({ledger:executionLedger,ttlMs:config.executionPlatform?.idempotencyTtlMs||86400000}),
    policy:controlPolicy,
    preflight:controlPreflight,
    artifacts:artifactManifest,
    healthVerifier,
    recovery:recoveryController,
    checkpoints:v2CheckpointStore,
    controlLoop,
    infrastructure,
    externalExecution,
    customerControl,
    productUnderstanding,
    architecturePlanner,
    taskDAGGenerator,
    projectBuilder,
    repositoryFactory:customerRepositoryFactory,applicationFactory:customerApplicationFactory,customerSaaS
  });
  customerRouter.executionPlatform=executionPlatform;
  await executionPlatform.customerProduction.lineage.load();
  await customerApplicationFactory.load();
  const auditLog=new AuditLog({observability:null});

  const roadmap=new RoadmapEngine({roadmap:JORA_MASTER_ROADMAP,store:new JsonStore({file:config.mission?.roadmapStateFile||"./.jora/roadmap.json"})});
  await roadmap.load();
  const taskGenerator=new SelfTaskGenerator({
    model:{
      generate:async ({objective,snapshot,limit=1})=>{
        const response=await modelGateway.complete({messages:[{role:"system",content:"Return ONLY a JSON array of implementation tasks. Do not invent repository facts. Each task must have title, description, priority and dependencies."},{role:"user",content:`Objective: ${objective}
Snapshot: ${JSON.stringify(snapshot).slice(0,10000)}
Limit: ${limit}`}]});
        const raw=response?.content??response?.output??"";
        const match=String(raw).match(/\[[\s\S]*\]/);
        if(!match) return [];
        return JSON.parse(match[0]).slice(0,limit);
      }
    }
  });
  const missionManager=new MissionManager({roadmap,taskGenerator,maxTasksPerCycle:config.mission?.tasksPerCycle??1});
  await missionManager.initialize();

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
  platformQueue=distributedConfig.enabled ? queueStore : new PersistentLocalQueue({file:config.executionPlatform?.localQueueFile});

  const governance=new GovernanceStateMachine({store:executionStore,auditLog});
  const runtime=new JoraRuntime({
    builder,
    controller,
    executionStore,
    repository,
    deploymentController,
    metrics,
    governance,
    policyEngine
  });
  const architectureStore=new ArchitectureStore({store:new JsonStore({file:config.architecture?.stateFile||"./.jora/architectures.json"})});
  await architectureStore.load();
  const taskDAGOptimizer=new TaskDAGOptimizer();
  const taskContractEngine=new TaskContractEngine();
  const adaptiveExecutionPlanner=new AdaptiveExecutionPlanner();
  const resourceScheduler=new ResourceAwareScheduler(config.resources||{});
  const checkpointStore=new CheckpointStore({store:new JsonStore({file:config.mission?.checkpointStateFile||"./.jora/checkpoints.json"})});
  const idempotencyGuard=new IdempotencyGuard();
  const missionTransactions=new MissionTransactionManager();
  const autonomousArchitect=new AutonomousArchitect({modelGateway,knowledgeRetriever,learningMemory,policyEngine,observability,architectureStore,taskDAGOptimizer,taskContractEngine,experiencePlanner});
  const architectureRegression=new ArchitectureRegressionIntelligence({historyStore:observability,threshold:config.architecture?.regressionThreshold??0.05});
  const dependencyIntelligence=new SystemDependencyIntelligence();
  const securityArchitect=new AutonomousSecurityArchitect({policyEngine});
  const policyDrivenAutonomy=new PolicyDrivenAutonomy({policyEngine});
  const evolutionController=new ContinuousEvolutionController({evolution:autonomousEvolution,observability});
  const missionRunner=new AutonomousMissionRunner({
    missionManager,
    maxCycles:config.mission?.maxCycles??Infinity,
    intervalMs:config.mission?.intervalMs??0,
    executeTask:async (task,{context})=>runtime.execute({command:task.description||task.title,constraints:{roadmapTask:task.id,title:task.title},context:{...context,roadmapTask:task}})
  });
  const programDirector=new AutonomousProgramDirector({
    architect:autonomousArchitect,
    missionManager,
    missionRunner,
    evolutionController,
    policy:policyDrivenAutonomy,
    observability
  });
  // Bootstrap a safe architecture planner before the full ArchitectCore is constructed.
  // This avoids temporal-dead-zone failures during runtime startup while preserving the full core once initialized.
  let architectCore={plan:input=>autonomousArchitect.plan(input)};
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
    cycle:async ({cycle,command,context})=>{
      const objective=command??"Complete Jora roadmap autonomously";
      let architecturePlan=null;
      try { architecturePlan=await architectCore.plan({objective,context}); } catch (error) {
        await observability.append?.({type:"ARCHITECTURE_PLAN_FAILED",objective,error:error.message,at:new Date().toISOString()});
      }
      const learningStrategy=architecturePlan?.taskDAG?.[0]?.executionStrategy??"standard";
      const missionResult=await missionRunner.run({
        objective,
        context:{
          ...context,
          cycle,
          modelGateway,
          benchmarkStore,
          championStore,
          workspace:config.workspace,
          sandbox,
          network:config.docker.network,
          securityConfig:config.security,
          architecturePlan
        },
        maxCycles:1
      });
      try {
        const outcome=missionResult?.status==="COMPLETED"||missionResult?.status==="PROMOTED"?"SUCCESS":"FAILED";
        const failure=missionResult?.error??missionResult?.results?.find?.(x=>x.status==="FAILED"||String(x.status).includes("BLOCKED"));
        await continuousLearning.learn({
          candidate:{id:`mission-${cycle}`},
          outcome,
          strategy:learningStrategy,
          lessons:architecturePlan?.requirements?.acceptanceCriteria??[],
          evidence:failure?{failureType:failure.status??"MISSION_FAILURE",message:failure.error??failure.reason??"mission failed"}:{}
        });
      } catch {}
      return missionResult;
    }
  });
  runtime.continuousWorker=worker;
  const programManager=new AutonomousProgramManager({
    missionManager,
    missionRunner,
    roadmap,
    observability
  });
  programManager.autonomousArchitect=autonomousArchitect;
  programManager.architectCore=architectCore;
  programManager.programDirector=programDirector;
  const recoveryConfig=config.recovery??{};
  const recovery=new RecoveryOrchestrator({observability,worker,queue:queueStore,deploymentController,controller,policy:recoveryConfig.policy});
  const incidentManager=new IncidentManager({observability});
  const incidentCommander=new AutonomousIncidentCommander({incidentManager,recovery,observability});
  const sloRecovery=new SLOAwareRecoveryController({metrics,recovery,observability,slos:config.slo??{}});
  architectCore=new AutonomousArchitectCore({
    architect:autonomousArchitect,
    programDirector,
    dependencyIntelligence,
    architectureRegression,
    securityArchitect,
    policy:policyDrivenAutonomy,
    evolutionController,
    incidentCommander,
    sloRecovery,
    architectureStore,
    observability
  });
  const healthConfig=config.operationalHealth??{};
  const healthMonitor=healthConfig.enabled
    ? new OperationalHealthMonitor({metrics,observability,worker,queue:queueStore,thresholds:healthConfig.thresholds,onAlert:async alert=>incidentCommander.handle(alert)})
    : null;
  let healthTimer=null;
  if(healthMonitor) {
    healthTimer=setInterval(()=>void healthMonitor.check().catch(()=>{}),healthConfig.intervalMs??30000);
    healthTimer.unref?.();
  }
  let sloTimer=null;
  if(config.slo?.enabled) {
    const interval=Math.max(1000,Number(config.slo.intervalMs??30000));
    sloTimer=setInterval(()=>void sloRecovery.recover().catch(()=>{}),interval);
    sloTimer.unref?.();
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
        programManager,
        accessController,
        auditLog,
        productUnderstanding,
        architecturePlanner,
        taskDAGGenerator,
        autonomousProductBuilder,
        autonomousCodingOrchestrator,
        autonomousEngineeringLoop,
        selfImprovingEngineeringCore,
        autonomousSoftwareFactory,
        executionPlatform
      })
    : null;
  return {
    runtime,repository,remoteRepository,ciGate,securityCouncil,sandbox,testRunner,benchmarkStore,autonomousArchitect,architectCore,agentRuntime,agentToolRegistry,architectureRegression,dependencyIntelligence,securityArchitect,policyDrivenAutonomy,incidentCommander,sloRecovery,evolutionController,capabilityRegistry,agentRouter,negotiationProtocol,parallelSpecialists,artifactWorkspace,reviewGraph,agentQualityGate,agentLifecycle,teamOptimizer,knowledgeIngestion,knowledgeIndex,evidenceRetriever,provenanceManager,conflictResolver,memoryConsolidation,failurePatterns,strategyModel,experiencePlanner,continuousLearning,architectureStore,taskDAGOptimizer,taskContractEngine,adaptiveExecutionPlanner,resourceScheduler,checkpointStore,idempotencyGuard,missionTransactions,
    infrastructure,executionStore,championStore,lineageStore,agentRegistry,programManager,programDirector,agentMemory,knowledgeStore,knowledgeRetriever,sharedTeamMemory,population,mutationStrategy,evolutionScheduler,researchLoop,candidateRunner,experimentEngine,learningMemory,autonomousEvolution,codeMaster,roadmap,missionManager,missionRunner,codeIndex,architectureAnalyzer,refactorPlanner,impactAnalyzer,worker,leaseStore,queueStore,platformQueue,observability,metrics,auditLog,productUnderstanding,architecturePlanner,taskDAGGenerator,autonomousProductBuilder,autonomousCodingOrchestrator,autonomousEngineeringLoop,selfImprovingEngineeringCore,autonomousSoftwareFactory,executionPlatform,healthMonitor,healthTimer,sloTimer,recovery,incidentManager,deploymentController,api,modelGateway,config
  };
}
