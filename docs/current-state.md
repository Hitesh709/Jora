# Current State

## Implemented

- Task lifecycle and dependency registry
- Orchestrator foundation
- Evaluation gates
- Controlled evolution proposal model
- Agent registry
- Tool registry with permission gates
- Provider-independent model gateway
- Agent runtime with bounded tool loop
- Sandbox abstraction with timeout/output limits
- Execution persistence abstraction
- Code Master repository abstraction with conflict protection
- Production pipeline
- Self-inspection engine
- Autonomous task-generation adapter
- Automatic repair/evaluation loop
- Bootstrap command for self-development mode
- Automated runtime tests and CI

## Current milestone

**Self-development control plane**

Inspect → Generate Task → Implement → Test → Diagnose → Repair → Evaluate → Promote/Reject

## Important limitation

The bootstrap executor is intentionally a safety stub. Jora is not yet allowed to modify and execute its own production code autonomously. The next milestone is to connect:

1. Real model-provider adapters
2. Real Git/GitHub repository operations
3. Real isolated container/OS sandbox
4. Persistent benchmark/evaluation store
5. Promotion and rollback controller
6. Continuous worker/24×7 scheduler
7. API and operator UI

## Definition of autonomy

Jora should only promote a self-generated change after reproducible evidence shows that the candidate satisfies tests, security gates, regression benchmarks, and rollback requirements.
