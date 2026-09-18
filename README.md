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
