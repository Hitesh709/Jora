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

## Target product

Jora is intended to become:

**Master AI Agent + Autonomous Software Factory + Agent Factory + Controlled Self-Evolution Engine**

A user should eventually be able to issue one high-level command such as:

`Build a production-ready AI coding agent.`

Jora should then derive requirements, create the project, implement it, test it, repair failures, evaluate security and quality, package/deploy it, and return the completed agent without requiring step-by-step user intervention.

## Current limitations

The factory is currently a control-plane implementation. Real autonomous production requires the following adapters:

1. Real model-provider adapters
2. Real Git/GitHub repository operations
3. Real isolated container/OS sandbox
4. Persistent benchmark/evaluation storage
5. Candidate/champion promotion and rollback
6. Continuous worker/24×7 scheduler
7. Production deployment adapters
8. API and operator UI

These must be connected behind explicit permission and safety boundaries.
