# Tasks for autonomous-mode

## Phase 1: Foundation & Setup

- [ ] 1.1 Initialize extension scaffolding and workspace layout
  - Create package.json, tsconfig.json, .vscode/launch.json, src/ folder, and .kiro/ folders in workspace template.
  - Ensure extension activation events for commands: `akira.autonomous.start`, `.pause`, `.resume`, `.stop`.
  - Success criteria: project builds, VS Code run-extension starts with no runtime errors.
- [ ] 1.2 Add shared types, DI tokens, and Event Bus skeleton
  - Files: src/types.ts, src/di.ts, src/event-bus.ts
  - Implement EventBus.publish/subscribe async API and basic event types from design.
  - Success criteria: components can subscribe/publish in unit tests; EventBus preserves order.
- [ ] 1.3 Implement Storage Layer core (writeFileAtomic/readFile/ensureDir)
  - Files: src/storage/storage-layer.ts
  - Implementation notes:
    - Use fs.promises + temp-file+rename for atomic writes; implement write queue/back-pressure debounce.
    - Expose ensureDir(path) and cleanupOldCheckpoints(retentionDays) stub.
  - Success criteria: atomic write test (partial write simulate crash not produce corrupted file); ensureDir creates nested dirs.

## Phase 2: Core Implementation

- [ ] 2.1 Create Autonomous Executor skeleton
  - File: src/autonomous-executor.ts
  - Implement public methods startSession, pauseSession, resumeSession, stopSession and in-memory SessionContext with currentPhase/taskCursor.
  - Hook into EventBus and call Scheduler.startProcessing(sessionContext) on start.
  - Success criteria: calling startSession enqueues initial tasks and emits sessionStarted event.
- [ ] 2.2 Implement Session Manager (file-backed sessions)
  - File: src/session/session-manager.ts
  - Implement createSession, updateSession, readSession; session.md format with YAML front-matter.
  - Success criteria: createSession writes .kiro/sessions/<id>/session.md and subsequent updateSession patches persisted JSON/YAML.
- [ ] 2.3 Implement Scheduler / Worker Pool
  - File: src/scheduler/scheduler.ts
  - Implement enqueueTask(task, sessionContext), setConcurrency(n), shutdown(); use semaphore-like limiter and priority queue.
  - Success criteria: concurrency respected in integration test, shutdown waits for running workers to finish.
- [ ] 2.4 Implement Task Manager (tasks.md parse & update)
  - File: src/tasks/task-manager.ts
  - Implementation notes:
    - Parse tasks.md into TaskRecord[] using markdown AST (remark) or robust regex; keep rawLine indices for in-place updates.
    - Implement loadTasks(workspaceRoot), markTaskComplete(taskId,timestamp), markTaskFailed(taskId,details), persistTasks() (atomic).
  - Success criteria: loading tasks preserves order and line numbers; markTaskComplete updates the exact checkbox in tasks.md and appends timestamp.
- [ ] 2.5 Implement Decision Engine evaluateTask
  - File: src/decision/decision-engine.ts
  - Implementation notes:
    - Implement heuristics: file existence, content diff, command probe via Execution Engine (probe mode).
    - Implement optional LLM provider stub via ApiLogger; produce {confidence,reasoning,detected}.
    - Add retry logic for LLM calls and weights for combining heuristics.
  - Success criteria: deterministic heuristic path returns confidence quickly; LLM path is logged to api-calls.md and returns combined score.
- [ ] 2.6 Implement Execution Engine executePlan
  - File: src/execution/execution-engine.ts
  - Implementation notes:
    - executePlan runs file writes (via Storage Layer), shell commands (child_process.spawn with array args), and LLM writes (via ApiClient).
    - Consult Policy Manager before destructive ops; call ApiLogger for LLM calls.
    - Implement retry/backoff orchestration (1s,2s,4s) and expose ExecutionResult success/failure and error codes.
  - Success criteria: sample plan with a file write + command executes end-to-end; retries occur on transient errors; destructive ops blocked without approval.
- [ ] 2.7 Implement Checkpoint Manager create/restore
  - File: src/checkpoint/checkpoint-manager.ts
  - Implementation notes:
    - createCheckpoint(sessionId, phaseId, metadata, snapshot) writes .kiro/checkpoints/<session-id>/phase-<N>.md with YAML front-matter and optional base64 archived files.
    - restoreCheckpoint(checkpointId) returns RestoreResult with list of files to restore.
  - Success criteria: checkpoint file created and parsed back; restorePreview returns diffs without applying changes.

## Phase 3: Integration & Polish

- [ ] 3.1 Implement Policy Manager for settings & approvals
  - File: src/policy/policy-manager.ts
  - Implement validateSettings, checkDestructiveOp(sessionId,opDetails) that triggers UI approval flow, consumeFileModification counter.
  - Success criteria: settings validation throws on out-of-range values; destructive op requests emit PAUSED_FOR_APPROVAL and require user confirmation.
- [ ] 3.2 Implement Git Integrator (git CLI wrapper)
  - File: src/git/git-integrator.ts
  - Implement canRollbackWithGit, createRollbackPatch(files), revertToCommit(commitHash) using child_process.exec; provide safe fallbacks when git missing.
  - Success criteria: on a git repo, createRollbackPatch returns patch path and revertToCommit resets working tree in integration test.
- [ ] 3.3 Implement UI Controller (status bar, OutputChannel, notifications)
  - File: src/ui/ui-controller.ts
  - Implement showStatus, updateStatus, showNotification; status bar click shows quick pick: View Session Log, Pause, Resume, Stop.
  - Success criteria: status bar updates on session events; quick pick actions call autonomous-executor APIs.
- [ ] 3.4 Implement API Logger (append-only)
  - File: src/api/api-logger.ts
  - Implement logApiCall(sessionId,callMeta), logApiFailure(sessionId,callMeta,error) writing to .kiro/sessions/<session-id>/api-calls.md atomically.
  - Success criteria: api-calls.md contains structured entries for successful and failed calls with timestamps.

## Phase 4: Testing & Documentation

- [ ] 4.1 Unit tests for core components (Decision, Checkpoint, Policy, Scheduler)
  - Files: tests/decision.test.ts, tests/checkpoint.test.ts, tests/policy.test.ts, tests/scheduler.test.ts
  - Implementation notes:
    - Use Jest + ts-jest, memfs for file system mocking, injected Git and ApiClient stubs, deterministic clock.
    - Target boundary cases: LLM auth error, transient command failure, settings validation.
  - Success criteria: >=90% passing for unit tests; deterministic CI run with mocked dependencies.
- [ ] 4.2 Integration tests (VS Code extension runner)
  - Files: test/smoke/autonomous-session.test.ts
  - Implementation notes:
    - Use vscode-test to spawn ExtensionHost with a temp workspace, create tasks.md, initialize git repo / no-git scenario, run startSession, assert session files/checkpoints/notifications.
  - Success criteria: end-to-end scenario passes: tasks executed/marked, checkpoints created on failure, rollback via git works.
- [ ] 4.3 Documentation: README, API reference, migration notes
  - Files: docs/README.md, docs/api.md, docs/migration.md
  - Include code examples for autonomous-executor public API, session file formats, and how to opt-out telemetry.
  - Success criteria: developer can onboard and run tests following docs; session file format example present.
- [ ] 4.4 Release checklist, code review, and security review
  - Tasks: create PR template with checklist (tests, docs, telemetry opt-in, secrets warning), run dependency audit, confirm .gitignore recommendations for .kiro.
  - Success criteria: checklist items in PRs; security review notes addressed; no raw API keys persisted.

## Optional Enhancements (Optional)

- [ ] O.1 Implement checkpoint compaction job
  - File: src/checkpoint/compactor.ts
  - Success criteria: keeps phase boundary + N recent checkpoints; background job scheduled via setInterval and respects retention setting.
- [ ] O.2 Add telemetry/perf metrics to OutputChannel
  - File: src/telemetry/metrics.ts
  - Success criteria: OutputChannel reports queue length, avg task latency, checkpoint sizes when verbose enabled.
- [ ] O.3 Plugin registry for Decision/Execution providers
  - File: src/plugins/registry.ts
  - Success criteria: register/unregister provider at runtime; test with a sample plugin.
