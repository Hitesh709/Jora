# Jora Task Execution Protocol

## Task lifecycle

BACKLOG → READY → IN_PROGRESS → TESTING → REVIEW → APPROVED → DEPLOYED → DONE

Failure states:

BLOCKED, FAILED, REJECTED, ROLLED_BACK

## Completion criteria

Never mark a task DONE because code was generated. A task is DONE only when:

- implementation is present;
- acceptance criteria are satisfied;
- automated tests pass where applicable;
- security checks pass where applicable;
- documentation is updated where needed;
- changes are version-controlled;
- rollback is possible for production changes.

## Execution cycle

1. Load the task registry.
2. Inspect current repository state.
3. Resolve dependencies.
4. Select a small coherent batch.
5. Implement.
6. Test.
7. Review.
8. Update task state.
9. Commit.
10. Record evidence.
11. Continue with the next executable batch.

Prefer vertical slices over disconnected scaffolding.

## Self-evolution gate

Candidate changes must pass:

1. Baseline capture.
2. Candidate generation.
3. Isolated execution.
4. Test suite.
5. Security checks.
6. Benchmark suite.
7. Candidate/champion comparison.
8. Governance approval.
9. Version creation.
10. Controlled deployment.
11. Monitoring.
12. Rollback if thresholds regress.

The evaluator must be independent of the component being evaluated wherever practical.

## Autonomy levels

- Level 0 — human performs the action.
- Level 1 — AI proposes.
- Level 2 — AI implements in sandbox.
- Level 3 — AI prepares validated deployment.
- Level 4 — AI deploys approved classes of changes.
- Level 5 — controlled autonomous evolution.

High-impact operations require stronger controls.

## Required checkpoint files

Maintain:

- docs/current-state.md
- docs/decisions.md
- docs/known-issues.md
- docs/next-actions.md

Do not rely on conversation history as the sole source of project state.
