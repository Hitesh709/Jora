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
- Champion store with persistent state and promotion history
- Unified Jora runtime
- Per-execution isolated candidate branches with validated fast-forward promotion and rollback
- GitHub Git-database primitives for atomic candidate branch promotion and rollback
- Remote GitHub candidate publication from the local workspace
- GitHub Actions CI gate before promotion
- CI failure job-log evidence collection
- Autonomous CI diagnosis and repair loop
- Re-publication of repaired candidates to the same isolated GitHub branch without force updates
- Durable worker with persisted state, single-worker lease, heartbeat, stale-job recovery, interrupted-cycle retry, and graceful stop
- Deployment controller with health-gated release and automatic adapter rollback
- Staging deployment gate that blocks production until staging deployment and health checks pass
- Health-check retry boundary
- Persistent observability event store
- Secret configuration, required-secret validation, and runtime redaction helpers
- Continuous worker runtime wiring and worker CLI
- CLI command entry point

## Autonomous production loop

A user should eventually be able to issue one high-level command:

`Build a production-ready AI coding agent.`

Jora now has the control flow for:

`COMMAND → ISOLATE → BUILD → TEST → SECURITY → BENCHMARK → PUBLISH → CI → DIAGNOSE → REPAIR → REPUBLISH → CI → PROMOTE`

The repair loop is bounded by `JORA_AUTONOMOUS_MAX_CYCLES` (default 4). A failed GitHub Actions candidate is not promoted. Jora collects failed workflow/job evidence, feeds that evidence into the next model build cycle, reuses the isolated candidate branch, and republishes the repaired tree. Remote branch advancement is non-force; promotion to the target branch remains fast-forward-only.

For continuous autonomous operation, `npm run jora:worker -- "Improve Jora continuously"` starts the durable worker. Worker state is stored in `JORA_WORKER_STATE_FILE` (default `.jora/worker.json`). The worker writes heartbeats, refuses a second fresh worker lease, and resumes a stale RUNNING job after restart. The interrupted cycle is retried rather than silently skipped.

Worker configuration:
- `JORA_WORK_INTERVAL_MS`: delay between cycles, default 60000
- `JORA_MAX_CYCLES`: optional cycle limit; unset means continuous operation
- `JORA_WORKER_STATE_FILE`: durable worker state path
- `JORA_WORKER_HEARTBEAT_MS`: heartbeat interval, default 10000
- `JORA_WORKER_STALE_AFTER_MS`: stale-worker threshold, default 120000

## Target product

**Master AI Agent + Autonomous Software Factory + Agent Factory + Controlled Self-Evolution Engine**

Jora should derive requirements, create the project, implement it, test it, diagnose and repair failures, run independent automated security gates, benchmark the candidate, compare it with the champion, publish an isolated GitHub candidate branch, wait for CI, promote or roll back, deploy, monitor, and continue improving without step-by-step user intervention.

## Current limitations

The control plane and several concrete runtime boundaries now exist, but full autonomous production still requires deployment-specific adapters:

1. Real model-provider implementation and credentials
2. Remote GitHub workspace provisioning/push orchestration for deletions and full repository mirroring
3. Production container runtime and host hardening
4. Durable task/execution/benchmark storage beyond the current local JSON/in-memory boundaries
5. Production test, security, and benchmark suites
6. Deployment adapters and environment-specific deployment targets
7. API/operator UI
8. Secrets management and observability

The durable worker provides restart recovery at the worker/job control-plane level; it does not yet provide distributed multi-node scheduling, external lease coordination, or exactly-once execution semantics. Deployment is adapter-driven: Jora will only perform a real deployment when a deployment adapter is explicitly configured. When staging is enabled, production deployment is blocked unless staging reaches DEPLOYED after its health gate. Health failure can trigger adapter rollback before a release is considered deployed. A recovered cycle can execute again, so candidate operations must remain idempotent and promotion gates remain authoritative.

The architecture is deliberately adapter-based so these can be connected without redesigning the core orchestration model.


## Staging → production release gate

Jora supports an optional two-environment release path:

`PROMOTE → STAGING DEPLOY → STAGING HEALTH → PRODUCTION DEPLOY → PRODUCTION HEALTH → PRODUCTION`

If staging deployment fails or its health check does not pass within the configured retry budget, production deployment is not attempted. Production health failure is handled by the production `DeploymentController`, which can invoke the configured production rollback adapter.

Environment configuration:
- `JORA_DEPLOYMENT_ENABLED=true`: enables deployment.
- `JORA_STAGING_DEPLOYMENT_ENABLED=true` or `JORA_STAGING_DEPLOYMENT_WEBHOOK_URL`: enables the staging gate.
- `JORA_STAGING_DEPLOYMENT_WEBHOOK_URL`: staging deployment endpoint.
- `JORA_STAGING_HEALTHCHECK_URL`: staging health endpoint.
- `JORA_PRODUCTION_DEPLOYMENT_WEBHOOK_URL`: production deployment endpoint; falls back to `JORA_DEPLOYMENT_WEBHOOK_URL`.
- `JORA_PRODUCTION_HEALTHCHECK_URL`: production health endpoint; falls back to `JORA_HEALTHCHECK_URL`.
- `JORA_STAGING_HEALTHCHECK_ATTEMPTS` / `JORA_STAGING_HEALTHCHECK_INTERVAL_MS`: staging health retry policy.
- `JORA_PRODUCTION_HEALTHCHECK_ATTEMPTS` / `JORA_PRODUCTION_HEALTHCHECK_INTERVAL_MS`: production health retry policy.
- `JORA_DEPLOYMENT_TIMEOUT_MS`: deployment webhook timeout.

The default remains safe: deployment is disabled unless explicitly enabled, and staging is not enabled unless its staging configuration is supplied.
