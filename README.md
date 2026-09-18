# Jora

AI coding agent evolving into a controlled **AI Evolution OS and Agent Factory**.

## Vision

Jora is designed to become a master AI engineering system that can understand a user's command, plan and build software projects, create production AI agents, test and repair them, and safely evolve its own platform.

## Agent Factory

The target interaction is:

`Jora, build me a production-ready AI coding agent.`

Jora's internal delivery path is:

**Command → Requirements → Architecture → Project Plan → Build → Test → Diagnose → Repair → Security → Benchmark → Package → Deliver**

The new Agent Factory and Project Factory provide the control-plane interfaces for this workflow. The production executor remains adapter-based and sandboxed; no arbitrary self-modification is enabled by default.

## Self-development

Jora also contains a self-development control loop:

**Inspect → Generate Task → Implement → Test → Diagnose → Repair → Evaluate → Promote/Reject**

Run:

`npm run jora:self-build -- "Build Jora into a production autonomous AI engineering platform"`

The current bootstrap executor is intentionally a safety stub until a real isolated execution backend and repository adapter are connected.

## Core principle

**Generate → Isolate → Test → Security Check → Benchmark → Compare → Approve → Version → Deploy → Monitor → Rollback**

No AI-generated change is automatically considered production-ready.

See `docs/AI_EVOLUTION_OS.md`, `docs/TASK_EXECUTION_PROTOCOL.md`, `TASKS.md`, and `docs/current-state.md`.

## Autonomous runtime milestone

The platform now includes adapter boundaries for process isolation, Git-backed repository operations, candidate promotion/rollback, and continuous worker execution. These components are deliberately dependency-injected so production deployments can supply hardened infrastructure without granting the model unrestricted host access.

## Autonomous security model

Jora is designed for high-autonomy operation. Safety is enforced by independent security gates rather than step-by-step user intervention. A Security Council can run multiple independent checks and require a configurable quorum before candidate promotion.


## Runtime infrastructure milestone

Jora now has concrete runtime boundaries for command execution, Docker-isolated project execution, local Git operations, production evaluation, benchmark evidence, champion history, rollback, and a unified `JoraRuntime` composition layer.

The CLI entry point is:

`npm run jora:command -- "Build a production-ready AI coding agent."`

It currently accepts and records the command but reports `ADAPTERS_REQUIRED` until a real model provider, repository workspace, evaluator/security implementation, and deployment adapter are configured. This prevents a false claim of production execution.

### Autonomous operating model

The intended production loop is:

**One command → Plan → Build → Isolate → Test → Diagnose → Repair → Security Council → Benchmark → Compare → Promote/Rollback → Deploy → Monitor → Improve**

Security gates are automated evaluation agents/checks; they are not intended to require manual approval for every development step.

The Docker boundary is designed as an infrastructure adapter with network isolation, resource limits, dropped Linux capabilities, read-only root filesystem, ephemeral tmpfs, and a non-root user. A production deployment should additionally harden the host/container runtime and secrets management.


## Production adapter milestone

Version 0.5 adds concrete provider, GitHub, persistence, and deployment adapter boundaries:

- `OpenAICompatibleProvider` — environment-configured model HTTP adapter
- `GitHubRestRepository` — token-based GitHub repository content adapter
- `JsonStore` and `PersistentExecutionStore` — durable local execution evidence
- `DeploymentAdapter` — deployment/rollback integration boundary

Credentials are read from environment/configuration and are never embedded in generated source. These adapters are intentionally dependency-injected so Jora's autonomous controller can run the same workflow against different production infrastructures.
