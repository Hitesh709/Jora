# Current State

## Implemented

- Task lifecycle and dependency registry
- Orchestrator and evaluation foundations
- Agent runtime, model gateway, tool registry
- Sandbox boundary abstraction
- Execution persistence abstraction
- Code Master repository abstraction with conflict protection
- Production pipeline
- Self-inspection and autonomous task-generation adapters
- Automatic repair/evaluation loop
- Agent Factory
- Project Factory
- Agent specification planner
- Autonomous delivery controller
- Bootstrap self-development command
- Automated tests and CI
- Multi-gate Security Council and autonomous controller
- Provider registry
- Production agent builder
- Benchmark store
- Rollback manager
- Command runner
- Docker sandbox boundary
- Local Git repository adapter
- Production evaluator
- Champion store
- Unified Jora runtime
- CLI command entry point

## Target product

**Master AI Agent + Autonomous Software Factory + Agent Factory + Controlled Self-Evolution Engine**

A user should eventually be able to issue one high-level command:

`Build a production-ready AI coding agent.`

Jora should derive requirements, create the project, implement it, test it, diagnose and repair failures, run independent automated security gates, benchmark the candidate, compare it with the champion, promote or roll back, deploy, monitor, and continue improving without step-by-step user intervention.

## Current limitations

The control plane and several concrete runtime boundaries now exist, but full autonomous production still requires deployment-specific adapters:

1. Real model-provider implementation and credentials
2. Real GitHub/Git workspace provisioning and branch/worktree lifecycle
3. Production container runtime and host hardening
4. Persistent task/execution/benchmark/champion storage
5. Production test, security, and benchmark suites
6. Deployment adapters
7. Durable 24×7 scheduler/worker with restart and heartbeat
8. API/operator UI
9. Secrets management and observability

The architecture is deliberately adapter-based so these can be connected without redesigning the core orchestration model.
