# Jora

AI coding agent evolving into a controlled **AI Evolution OS**.

## Vision

Jora is designed to progress from an AI coding agent into a production system that can understand requirements, plan software, coordinate agents, build and test applications, evaluate its own outputs, and safely improve its own components.

## Self-development mode

Jora now has a self-development engine that provides the control loop for:

**Inspect → Generate Task → Implement → Test → Diagnose → Repair → Evaluate → Promote/Reject**

The engine is deliberately adapter-based. Real model providers, repository operations, and an isolated execution backend plug into these interfaces. The bootstrap command currently uses a safety stub and therefore **does not execute arbitrary autonomous code**.

Run:

`npm run jora:self-build -- "Build Jora into a production autonomous AI engineering platform"`

## Core loop

Requirement → Plan → Build → Sandbox → Test → Evaluate → Version → Observe → Evolve

## Roadmap

The long-term program contains **10,000 production tasks across 20 phases**. The repository focuses on building the autonomous development control plane before enabling unrestricted execution.

See:

- `docs/AI_EVOLUTION_OS.md`
- `docs/TASK_EXECUTION_PROTOCOL.md`
- `TASKS.md`
- `docs/current-state.md`

## Engineering principle

Self-evolution is controlled:

**Generate → Isolate → Test → Security Check → Benchmark → Compare → Approve → Version → Deploy → Monitor → Rollback**

No AI-generated change is automatically considered production-ready.
