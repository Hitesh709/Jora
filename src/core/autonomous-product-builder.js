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
  constructor({runtime=null,modelGateway=null}={}) {
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

  async build({input,context={}}={}) {
    if(!String(input??"").trim()) throw new Error("input is required");

    const specification=await this.understanding.understand({input,context});
    if(specification.executionReadiness==="NEEDS_CLARIFICATION") {
      return {
        accepted:false,
        status:"NEEDS_CLARIFICATION",
        version:this.version,
        specification
      };
    }

    const architectureResult=await this.architecture.plan({specification,input,context});
    if(architectureResult.status!=="ARCHITECTURE_PLANNED" || architectureResult.plan?.readiness==="BLOCKED_BY_REQUIREMENTS") {
      return {
        accepted:false,
        status:"ARCHITECTURE_BLOCKED",
        version:this.version,
        specification,
        architecture:architectureResult.plan??null
      };
    }

    const dagResult=this.dag.generate({specification,architecture:architectureResult.plan});
    const selection=this.specialists.select({dag:dagResult.dag});

    const execution=await this.execution.execute({
      assignments:selection.assignments,
      context:{...context,specification,architecture:architectureResult.plan,dag:dagResult.dag}
    });
    const verification=this.verification.verify({
      executionResults:execution.results,
      dag:dagResult.dag
    });
    const correction=this.correction.correct({
      verification,
      assignments:selection.assignments
    });
    const learning=this.learning.learn({
      tasks:execution.results,
      verification,
      corrections:correction.corrections
    });
    const evolution=this.evolution.evolve({
      learning,
      architecture:architectureResult.plan
    });

    return {
      accepted:true,
      status:"AUTONOMOUS_BUILD_COMPLETED",
      version:this.version,
      specification,
      architecture:architectureResult.plan,
      dag:dagResult.dag,
      specialists:selection,
      execution,
      verification,
      correction,
      learning,
      evolution
    };
  }
}
