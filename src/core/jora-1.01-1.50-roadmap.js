import {JORA_1_00_ROADMAP} from "./jora-1.00-roadmap.js";

const MILESTONES=[
  ["1.01","Requirements interpreter","Convert natural-language goals into structured requirements, constraints, risks and acceptance criteria."],
  ["1.02","Autonomous architecture designer","Generate an explicit system architecture from approved requirements."],
  ["1.03","Architecture alternatives","Generate multiple viable architectures with trade-off metadata."],
  ["1.04","Architecture decision engine","Select an architecture using explicit cost, reliability, security and maintainability constraints."],
  ["1.05","Architecture contract","Persist a machine-readable architecture contract and decision record."],
  ["1.06","Architecture validator","Validate architecture contracts for missing components, dependency cycles and incompatible constraints."],
  ["1.07","Architecture conformance checker","Compare implementation structure against the approved architecture contract."],
  ["1.08","Architecture-to-task compiler","Compile architecture components into a dependency-aware implementation DAG."],
  ["1.09","Architecture-to-team compiler","Map architecture work to specialist agents and collaboration roles."],
  ["1.10","Architecture versioning","Version architecture contracts and preserve parent/child decision lineage."],

  ["1.11","Task DAG optimizer","Optimize task ordering, critical paths, dependencies and parallelizable work."],
  ["1.12","Dynamic task synthesis","Generate new tasks when execution discovers missing work or changed requirements."],
  ["1.13","Task acceptance contracts","Attach executable acceptance criteria and evidence requirements to every task."],
  ["1.14","Task risk estimation","Estimate implementation, security, dependency and rollback risk before execution."],
  ["1.15","Adaptive execution planner","Choose execution strategies from task risk, history, resources and constraints."],
  ["1.16","Parallel work scheduler","Run independent tasks concurrently while respecting resource and dependency limits."],
  ["1.17","Resource-aware scheduling","Schedule work against CPU, memory, model, sandbox and concurrency budgets."],
  ["1.18","Checkpointed execution","Persist resumable checkpoints across long-running autonomous missions."],
  ["1.19","Idempotent task execution","Make retries safe through execution keys, state checks and duplicate suppression."],
  ["1.20","Mission transaction boundaries","Define recoverable transaction boundaries for multi-task autonomous programs."],

  ["1.21","Knowledge ingestion pipeline","Ingest repository, documentation, test, benchmark and operational knowledge."],
  ["1.22","Semantic knowledge index","Add structured semantic indexing for code, architecture, tasks and decisions."],
  ["1.23","Evidence-aware retrieval","Rank knowledge by relevance, freshness, authority and execution evidence."],
  ["1.24","Knowledge provenance","Track source, version, timestamp and confidence for retained knowledge."],
  ["1.25","Knowledge conflict resolver","Detect contradictory knowledge and resolve it using explicit evidence policies."],
  ["1.26","Memory consolidation engine","Convert repeated execution outcomes into durable reusable lessons."],
  ["1.27","Failure pattern library","Cluster recurring failures and associate them with proven repair strategies."],
  ["1.28","Strategy effectiveness model","Measure which planning, coding, testing and repair strategies work best."],
  ["1.29","Experience-guided planning","Use historical outcomes to alter future task plans and execution strategies."],
  ["1.30","Continuous learning loop","Close the loop from outcome evidence to knowledge, strategy and future planning."],

  ["1.31","Specialist agent planner","Create specialized agents from architecture and task capability requirements."],
  ["1.32","Agent capability registry 2.0","Track capabilities, reliability, cost, latency, security and historical outcomes."],
  ["1.33","Agent routing engine","Route tasks to suitable agents using capability and evidence-based policies."],
  ["1.34","Agent negotiation protocol","Allow agents to exchange requirements, assumptions, artifacts and handoffs."],
  ["1.35","Parallel specialist orchestration","Coordinate concurrent specialist agents with bounded resource usage."],
  ["1.36","Shared artifact workspace","Provide versioned shared artifacts with ownership and conflict detection."],
  ["1.37","Collaborative review graph","Create reviewer, verifier and challenger roles for high-risk changes."],
  ["1.38","Agent quality gates","Evaluate agent outputs before allowing downstream agents to consume them."],
  ["1.39","Agent lifecycle manager","Automatically provision, benchmark, activate, retire and replace specialist agents."],
  ["1.40","Agent-team self-optimization","Adapt team composition from measured task outcomes and resource efficiency."],

  ["1.41","Autonomous architect integration","Make architecture design a first-class stage of the autonomous delivery loop."],
  ["1.42","Architecture regression intelligence","Detect architectural drift and regressions across candidate generations."],
  ["1.43","System-wide dependency intelligence","Model runtime, code, service, data and agent dependencies for change impact."],
  ["1.44","Autonomous security architecture","Generate and validate security boundaries, trust zones and least-privilege requirements."],
  ["1.45","Policy-driven autonomy","Apply explicit governance policies to planning, execution, promotion and deployment."],
  ["1.46","Autonomous incident commander","Coordinate diagnosis, containment, repair, rollback and post-incident learning."],
  ["1.47","SLO-aware self-recovery","Use reliability objectives and telemetry to trigger bounded recovery strategies."],
  ["1.48","Continuous evolution controller","Unify research, mutation, evaluation, champion selection and rollback decisions."],
  ["1.49","Autonomous program director","Coordinate architecture, roadmap, agents, delivery, operations and learning as one program."],
  ["1.50","Jora Autonomous Architect Core","Integrate requirements-to-architecture-to-DAG-to-agents-to-delivery-to-learning into one governed autonomous control loop."]
];

export const JORA_1_01_1_50_ROADMAP=Object.freeze(
  MILESTONES.map(([version,title,description],index)=>({
    id:"v"+version.replace(".",""),
    version,
    title,
    description,
    priority:55-index,
    dependencies:[index===0?"v100":"v"+MILESTONES[index-1][0].replace(".","")]
  }))
);

export const JORA_MASTER_ROADMAP=Object.freeze([
  ...JORA_1_00_ROADMAP,
  ...JORA_1_01_1_50_ROADMAP
]);
