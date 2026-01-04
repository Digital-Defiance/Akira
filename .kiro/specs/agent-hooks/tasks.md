# Tasks for agent-hooks

## Phase 1: Foundation & Setup
- [ ] 1.1 Initialize module and scaffold files
  - Implementation notes: create folder `packages/agent-hooks` or `src/agent-hooks`, add `package.json`, `tsconfig.json`, `vscode` extension `activationEvents` stub, `src/extension.ts` with `activate(context: ExtensionContext)` and `deactivate()`.
  - Success criteria: extension builds (`yarn build` / `npm run build`) and activates in a dev host with a no-op activation log.
- [ ] 1.2 Add dependencies and dev-deps
  - Implementation notes: install `ajv`, `ajv-formats`, `typescript`, `@types/node`, `vscode-test` dev deps; add lint/test scripts.
  - Success criteria: `yarn install` succeeds and TypeScript compiles.
- [ ] 1.3 Create shared types and schema files
  - Implementation notes: add `src/types.ts` exporting Hook, HookRuntime, ExecutionRecord, HookTriggerContext; add `schema/.kiro.hooks.schema.json` copied from design.
  - Success criteria: types compile and schema file exists at `schema/.kiro.hooks.schema.json`.
- [ ] 1.4 Add OutputLogger and simple OutputChannel
  - Implementation notes: create `src/outputLogger.ts` exporting class `OutputLogger` with methods `logInfo(ctx, msg)`, `logError(ctx, err)`, `logExecution(record)`, `show()`. Wire to `vscode.window.createOutputChannel('agent-hooks')`.
  - Success criteria: calling `logInfo` from `activate()` shows messages in Output pane.

## Phase 2: Core Implementation
- [ ] 2.1 Implement Config Loader (src/configLoader.ts)
  - Implementation notes: export `async loadHooks(workspaceRoot: Uri): Promise<Hook[]>`, event `onDidChange: Event<HookLoadResult>`. Use `workspace.fs.readFile`, parse JSON, validate via `ajv`, normalize defaults (concurrency, enabled, timeout). Add file watcher for `.kiro/hooks.json`.
  - Success criteria: valid config returns normalized Hook[] within 2000 ms in tests; invalid schema emits error to OutputLogger and returns [].
- [ ] 2.2 Implement Secrets Redactor (src/secretsRedactor.ts)
  - Implementation notes: export `redact(text: string, patterns: RegExp[]): string`. Validate regexes during config load and return `[REDACTED]` replacements.
  - Success criteria: unit tests show sensitive substrings replaced and invalid patterns produce load-time validation error.
- [ ] 2.3 Implement Event Registry (src/eventRegistry.ts)
  - Implementation notes: export `registerListeners(triggers: TriggerType[], workspaceRoot: Uri): Promise<void>`, `unregisterListeners(workspaceRoot: Uri)`, `isRegistered(trigger, workspaceRoot)`. Use `Map<workspaceRoot, Map<trigger, Disposable>>` and dedupe registrations.
  - Success criteria: registering same trigger twice for same workspace does not create duplicate VS Code subscriptions; failures are logged and corresponding hooks are flagged via a callback (provide callback param for HookManager).
- [ ] 2.4 Implement Hook Manager (src/hookManager.ts)
  - Implementation notes: export `setHooks(workspaceRoot: Uri, hooks: Hook[])`, `getEnabledHooksForEvent(event: HookEvent): Hook[]`, `disableHook(hookId, reason?)`, `enableHook(hookId)`. Keep `Map<workspaceRoot, Map<hookId, HookRuntime>>`.
  - Success criteria: setHooks normalizes IDs, defaults, and EventRegistry is called to register distinct triggers; getEnabledHooksForEvent filters by `enabled`, `pattern`, and git allowlist.
- [ ] 2.5 Implement Prompt Runner skeleton (src/promptRunner.ts)
  - Implementation notes: export `runPrompt(prompt: string, opts: PromptOptions): Promise<PromptResult>`. Provide an implementation that spawns child process or worker thread; accept `AbortSignal`. For initial pass, implement a mockable worker process wrapper.
  - Success criteria: runPrompt supports cancellation via AbortSignal and returns {exitCode, stdout, stderr, duration} in unit tests.

## Phase 3: Integration & Polish
- [ ] 3.1 Implement Hook Execution Engine (src/executionEngine.ts)
  - Implementation notes: export `enqueue(hook: Hook, context: HookTriggerContext): Promise<ExecutionId>` and `shutdown(): Promise<void>`. Implement per-workspace Semaphore-based worker pool honoring `hook.concurrency`. Execution lifecycle: create ExecutionRecord, redact prompt, call PromptRunner with AbortController, enforce timeout, retry with backoff and jitter, persist logs via OutputLogger.
  - Success criteria: unit tests simulate success, error, timeout and verify attempts, status transitions, and that retries follow policy. ExecutionRecord entries emitted to OutputLogger.
- [ ] 3.2 Wire components in extension activation
  - Implementation notes: in `extension.ts` on activate: instantiate OutputLogger, ConfigLoader, HookManager, EventRegistry, ExecutionEngine, PromptRunner, SecretsRedactor. Hook up ConfigLoader.onDidChange -> HookManager.setHooks -> EventRegistry.registerListeners.
  - Success criteria: on workspace open and sample `.kiro/hooks.json` the manager registers listeners and a saved file event triggers enqueue flow (use log outputs to verify).
- [ ] 3.3 Listener registration failure handling and hook disable logic
  - Implementation notes: EventRegistry should call HookManager.disableHook(hookId, reason) on registration error. Add readable disabledReason in HookRuntime and an output log line explaining action.
  - Success criteria: simulate registration failure in unit tests and verify hook marked disabled and message logged.
- [ ] 3.4 Add redaction integration to logging and execution
  - Implementation notes: ensure OutputLogger always runs `SecretsRedactor.redact` before writing. HookExecutionEngine must redact prompts/logs before logExecution.
  - Success criteria: logs captured in OutputChannel and `.kiro/logs/hooks.log` (if enabled) never contain unredacted secrets matching configured patterns.

## Phase 4: Testing & Documentation
- [ ] 4.1 Add unit tests for Config Loader, Event Registry, Hook Manager, Secrets Redactor
  - Implementation notes: add `tests/unit/*` using `mocha`/`jest` and mock VS Code APIs. Validate time budget (load within 2000ms) and schema failures keep previous config.
  - Success criteria: test suite passes locally and CI; coverage for invalid regex detection and defaults.
- [ ] 4.2 Add unit/integration tests for Execution Engine and Prompt Runner
  - Implementation notes: mock PromptRunner to simulate success/failure/timeout; test concurrency limits, retry/backoff behavior and AbortSignal cancellation. Include tests for ExecutionRecord statuses and OutputLogger calls.
  - Success criteria: tests confirm retries, backoff delays (use clock mocking), and that aborted runs mark status `timeout` or `canceled`.
- [ ] 4.3 Add integration test simulating VS Code events (vscode-test)
  - Implementation notes: create workspace fixture with `.kiro/hooks.json`, run extension host tests to simulate `onDidSaveTextDocument` and `gitCommit` triggers. Use fake PromptRunner binary for deterministic results.
  - Success criteria: end-to-end tests show hooks enqueued and logs created; git triggers only run when `allowGit=true` and `repoRoot` matches.
- [ ] 4.4 Document usage and developer notes (README)
  - Implementation notes: add `docs/agent-hooks.md` describing `.kiro/hooks.json` schema, activation flow, debug flags, and how to run tests. Include example hooks file and commands to enable structured log file `.kiro/logs/hooks.log`.
  - Success criteria: README explains how to add hooks, debug, run tests and how secrets redaction works.
- [ ] 4.5 Code review & release checklist
  - Implementation notes: create PR template that checks for schema file, tests, logging, and security items (redaction patterns validated). Prepare `CHANGELOG.md` entry for initial feature.
  - Success criteria: PR checklist completed and at least one peer review approval.

Optional tasks (enhancements)
- [ ] 4.6 (Optional) Structured log file writer to `.kiro/logs/hooks.log`
  - Implementation notes: add configuration toggle; implement append-only JSONL writer in OutputLogger and ensure redaction before write.
  - Success criteria: enabling flag writes JSON lines and rotation/backfill not required for MVP.
- [ ] 4.7 (Optional) Telemetry & metrics hooks
  - Implementation notes: add simple counters (queueLength, activeExecutions, success/failure counts) exposed via `OutputLogger.logInfo` and optionally a Prometheus-like endpoint for dev.
  - Success criteria: metrics increment on enqueue/start/complete and can be asserted in integration tests.
- [ ] 4.8 (Optional) Debounce/coalesce high-frequency triggers
  - Implementation notes: implement per-file debounce in EventRegistry with configurable window (e.g., 500ms) to reduce duplicate enqueues.
  - Success criteria: high-frequency saves within window coalesce to single enqueue in tests.

Notes:
- File and function names referenced above are mandatory conventions for consistency: `src/configLoader.ts` (loadHooks/onDidChange), `src/eventRegistry.ts` (registerListeners/unregisterListeners/isRegistered), `src/hookManager.ts` (setHooks/getEnabledHooksForEvent/disableHook/enableHook), `src/executionEngine.ts` (enqueue/shutdown), `src/promptRunner.ts` (runPrompt), `src/outputLogger.ts` (logInfo/logError/logExecution/show), `src/secretsRedactor.ts` (redact).
- Keep tasks small and ordered. If any task exceeds 2 hours during implementation, split into subtasks (e.g., ExecutionEngine -> queue + worker pool + retry/backoff).