import {ProductUnderstandingEngine} from "./product-understanding-engine.js";
import {ArchitecturePlanningEngine} from "./architecture-planning-engine.js";
import {TaskDAGGenerationEngine} from "./task-dag-generation-engine.js";
import {SpecialistAgentSelectionEngine} from "./specialist-agent-selection-engine.js";
import {AutonomousExecutionEngine} from "./autonomous-execution-engine.js";
import {VerificationEngine} from "./verification-engine.js";
import {SelfCorrectionEngine} from "./self-correction-engine.js";
import {LearningEngine} from "./learning-engine.js";
import {EvolutionEngine} from "./evolution-engine.js";

export class AutonomousProductBuilder {
  constructor({runtime=null,modelGateway=null}={}){
    this.understanding=new ProductUnderstandingEngine({modelGateway});
    this.architecture=new ArchitecturePlanningEngine({modelGateway,productUnderstanding:this.understanding});
    this.dag=new TaskDAGGenerationEngine({modelGateway});
    this.specialists=new SpecialistAgentSelectionEngine();
    this.execution=new AutonomousExecutionEngine({runtime});
    this.verification=new VerificationEngine();
    this.correction=new SelfCorrectionEngine();
    this.learning=new LearningEngine();
    this.evolution=new EvolutionEngine();
    this.version="1.60.0";
  }
  async build({input,context={}}={}){
    const specification=this.understanding.understand({input,context});
    const architecture=this.architecture.plan({specification,input,context});
    const dag=this.dag.generate({specification,architecture});
    const selection=this.specialists.select({dag:dag.dag});
    const execution=await this.execution.execute({assignments:selection.assignments,context});
    const verification=this.verification.verify({executionResults:execution.results,dag:dag.dag});
    const correction=this.correction.correct({verification,assignments:selection.assignments});
    const learning=this.learning.learn({tasks:execution.results,verification,corrections:correction.corrections});
    const evolution=this.evolution.evolve({learning,architecture:architecture.plan});
    return {accepted:true,status:"AUTONOMOUS_BUILD_COMPLETED",version:this.version,specification,architecture:architecture.plan,dag:dag.dag,specialists:selection,execution,verification,correction,learning,evolution};
  }
}
