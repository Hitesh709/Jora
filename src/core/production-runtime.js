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
  const benchmarkStore=new BenchmarkStore();
  const executionStore=new PersistentExecutionStore({store:new JsonStore({file:config.persistence})});
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
  const promotion=new PromotionController({
    evaluator:new CandidateEvaluator(),
    repository,
    targetBranch:repository.baseBranch??config.github?.branch??"main",
    ciGate
  });
  const controller=new AutonomousController({
    delivery,
    securityCouncil,
    promotion,
    championStore,
    maxCycles:config.autonomous?.maxCycles??4
  });
  const worker=new DurableWorker({
    store:new JsonStore({file:config.worker?.stateFile||"./.jora/worker.json"}),
    intervalMs:config.worker?.intervalMs??60000,
    heartbeatMs:config.worker?.heartbeatMs??10000,
    staleAfterMs:config.worker?.staleAfterMs??120000,
    maxCycles:config.worker?.maxCycles??Infinity,
    cycle:async ({cycle,command,context})=>controller.run({
      command:command??"Improve Jora",
      context:{
        ...context,
        cycle,
        modelGateway,
        benchmarkStore,
        championStore,
        workspace:config.workspace
      }
    })
  });
  const runtime=new JoraRuntime({
    builder,
    controller,
    continuousWorker:worker,
    executionStore,
    repository
  });
  return {
    runtime,repository,remoteRepository,ciGate,securityCouncil,sandbox,testRunner,benchmarkStore,
    executionStore,championStore,worker,modelGateway,config
  };
}
