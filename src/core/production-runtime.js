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
import {createWorkspaceSecurityCouncil} from "./security-checks.js";
import {JoraRuntime} from "./jora-runtime.js";
import {JsonStore} from "./json-store.js";
import {PersistentExecutionStore} from "./persistent-execution-store.js";
import {BenchmarkStore} from "./benchmark-store.js";
import {ChampionStore} from "./champion-store.js";

class CandidateEvaluator {
  async evaluate({candidate,champion,security}={}) {
    const evaluation=candidate?.evaluation??{};
    const benchmarkScore=evaluation.benchmarkScore??0;
    const qualityScore=evaluation.qualityScore??0;
    const championScore=champion?.evaluation?.benchmarkScore??-Infinity;
    const passed=Boolean(evaluation.passed && security?.passed && benchmarkScore>=championScore);
    return {
      passed,
      benchmarkScore,
      qualityScore,
      comparedToChampion:championScore===-Infinity?"NO_CHAMPION":benchmarkScore-championScore,
      reasons:passed
        ? ["Candidate passed tests, security and benchmark comparison"]
        : ["Candidate failed a promotion gate or did not meet the champion benchmark"]
    };
  }
}

export async function createProductionJoraRuntime({config,modelGateway}={}) {
  if(!config) throw new Error("config is required");
  if(!modelGateway) throw new Error("modelGateway is required");

  const repository=new WorkspaceRepository({root:config.workspace});
  await repository.prepareCandidate(`startup-${Date.now()}`);
  const benchmarkStore=new BenchmarkStore();
  const executionStore=new PersistentExecutionStore({store:new JsonStore({file:config.persistence})});
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
  const delivery=new AutonomousDelivery({agentFactory,evolution,maxRepairCycles:1});
  const builder=new ProductionAgentBuilder({planner,factory,delivery});
  const promotion=new PromotionController({evaluator:new CandidateEvaluator(),repository});
  const championStore=new ChampionStore();
  const controller=new AutonomousController({delivery,securityCouncil,promotion,maxCycles:1});
  const runtime=new JoraRuntime({builder,controller,executionStore});
  return {
    runtime,repository,securityCouncil,sandbox,testRunner,benchmarkStore,
    executionStore,championStore,modelGateway,config
  };
}
