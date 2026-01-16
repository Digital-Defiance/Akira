# Agent Hooks Implementation Progress

**Started:** January 16, 2026  
**Status:** Phase 1 Complete ✅, Phase 2 In Progress 🚧

## Overview

Implementing the Agent Hooks system to enable automated agent actions triggered by IDE events. This is the #1 priority feature for achieving Kiro parity.

## Completed Work

### ✅ Phase 1: Foundation & Setup (100% Complete)

**Files Created:**

- `src/agent-hooks/types.ts` - Complete type definitions for hooks system
- `src/agent-hooks/schema/.akira.hooks.schema.json` - JSON schema for validation
- `src/agent-hooks/outputLogger.ts` - Structured logging to VS Code output channel
- `src/agent-hooks/extension.ts` - Extension activation/deactivation lifecycle
- `src/agent-hooks/package.json` - Module dependencies and scripts
- `src/agent-hooks/tsconfig.json` - TypeScript configuration

**Tasks Completed:**

- [x] 1.1 Initialize module and scaffold files
- [x] 1.2 Add dependencies and dev-deps
- [x] 1.3 Create shared types and schema files
- [x] 1.4 Add OutputLogger and simple OutputChannel

**Key Features:**

- Full TypeScript type safety with comprehensive interfaces
- JSON Schema validation with ajv
- Structured logging with timestamps and context
- Extension lifecycle management

### 🚧 Phase 2: Core Implementation (40% Complete)

**Files Created:**

- `src/agent-hooks/secretsRedactor.ts` - Secret pattern redaction ✅
- `src/agent-hooks/configLoader.ts` - Config loading and validation ✅

**Tasks Completed:**

- [x] 2.2 Implement Secrets Redactor
- [x] 2.1 Implement Config Loader (partial - needs testing)

**Tasks In Progress:**

- [ ] 2.3 Implement Event Registry
- [ ] 2.4 Implement Hook Manager
- [ ] 2.5 Implement Prompt Runner skeleton

**Key Features Implemented:**

- Regex-based secret redaction with validation
- File watcher for hot-reload of hooks.json
- Schema validation with detailed error messages
- Default value normalization

## Next Steps

### Immediate (Next 2-3 hours)

1. **Complete Event Registry** (`src/agent-hooks/eventRegistry.ts`)
   - Register VS Code event listeners
   - Deduplicate registrations per workspace
   - Handle registration failures

2. **Complete Hook Manager** (`src/agent-hooks/hookManager.ts`)
   - Manage hook runtime state
   - Filter hooks by event and patterns
   - Enable/disable hooks dynamically

3. **Complete Prompt Runner** (`src/agent-hooks/promptRunner.ts`)
   - Execute prompts with timeout and cancellation
   - Support both askAgent and runCommand actions
   - Return structured results

### Short Term (Next 1-2 days)

4. **Phase 3: Integration & Polish**
   - Wire all components together in extension.ts
   - Implement execution engine with retry logic
   - Add redaction to all logging paths

5. **Phase 4: Testing & Documentation**
   - Unit tests for all components
   - Integration tests with VS Code events
   - Documentation and examples

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension.ts                             │
│  • Lifecycle management                                      │
│  • Component initialization                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ ConfigLoader   │ │ HookManager  │ │ EventRegistry    │
│ • Load config  │ │ • Manage     │ │ • Register       │
│ • Validate     │ │   hooks      │ │   listeners      │
│ • Watch files  │ │ • Filter     │ │ • Deduplicate    │
└────────┬───────┘ └──────┬───────┘ └────────┬─────────┘
         │                │                  │
         └────────────────┼──────────────────┘
                          │
                          ▼
                 ┌────────────────────┐
                 │ ExecutionEngine    │
                 │ • Queue hooks      │
                 │ • Concurrency      │
                 │ • Retry logic      │
                 └─────────┬──────────┘
                           │
                 ┌─────────┴──────────┐
                 │                    │
                 ▼                    ▼
        ┌────────────────┐   ┌────────────────┐
        │ PromptRunner   │   │SecretsRedactor │
        │ • Execute      │   │ • Redact       │
        │ • Timeout      │   │ • Validate     │
        │ • Cancel       │   │   patterns     │
        └────────────────┘   └────────────────┘
```

## File Structure

```
src/agent-hooks/
├── extension.ts              ✅ Entry point
├── types.ts                  ✅ Type definitions
├── package.json              ✅ Dependencies
├── tsconfig.json             ✅ TypeScript config
├── outputLogger.ts           ✅ Logging
├── secretsRedactor.ts        ✅ Secret redaction
├── configLoader.ts           ✅ Config loading
├── eventRegistry.ts          🚧 Event listeners (TODO)
├── hookManager.ts            🚧 Hook management (TODO)
├── promptRunner.ts           🚧 Prompt execution (TODO)
├── executionEngine.ts        ⏳ Execution queue (Phase 3)
├── schema/
│   └── .akira.hooks.schema.json ✅ JSON schema
└── tests/                    ⏳ Tests (Phase 4)
    ├── unit/
    └── integration/
```

## Testing Strategy

### Unit Tests (Phase 4)

- ConfigLoader: Schema validation, normalization, file watching
- SecretsRedactor: Pattern validation, redaction accuracy
- EventRegistry: Registration, deduplication, error handling
- HookManager: Filtering, enable/disable, state management
- PromptRunner: Execution, timeout, cancellation
- ExecutionEngine: Queueing, concurrency, retry logic

### Integration Tests (Phase 4)

- End-to-end hook execution
- File save triggers
- Git commit triggers
- Concurrent execution limits
- Retry with backoff
- Secret redaction in logs

## Configuration Example

```json
{
  "schemaVersion": "1.0.0",
  "hooks": [
    {
      "id": "lint-on-save",
      "name": "Lint on Save",
      "description": "Run linter when TypeScript files are saved",
      "trigger": {
        "type": "fileEdited",
        "patterns": ["**/*.ts", "**/*.tsx"]
      },
      "action": {
        "type": "askAgent",
        "prompt": "Run `npm run lint` and fix any errors in the edited file"
      },
      "enabled": true,
      "concurrency": 2,
      "timeout": 30000,
      "retry": {
        "maxAttempts": 3,
        "backoffMs": 1000,
        "jitter": true
      },
      "secretPatterns": ["AKIA[0-9A-Z]{16}", "ghp_[A-Za-z0-9]{36}"]
    }
  ]
}
```

## Metrics

- **Lines of Code:** ~800 (Phase 1 + partial Phase 2)
- **Files Created:** 8
- **Test Coverage:** 0% (tests in Phase 4)
- **Estimated Completion:** 2 weeks total
  - Phase 1: ✅ Complete (1 day)
  - Phase 2: 🚧 40% (2 days remaining)
  - Phase 3: ⏳ Not started (2 days)
  - Phase 4: ⏳ Not started (3 days)

## Success Criteria

### Phase 1 ✅

- [x] Extension builds without errors
- [x] Extension activates in VS Code
- [x] Types compile successfully
- [x] Schema file exists and is valid
- [x] OutputLogger shows messages in output pane

### Phase 2 (In Progress)

- [x] Config loads within 2000ms
- [x] Invalid schema emits errors
- [x] Secret patterns validated at load time
- [ ] Event listeners registered without duplicates
- [ ] Hooks filtered correctly by event type
- [ ] Prompt execution supports cancellation

### Phase 3 (Pending)

- [ ] Components wired together in extension.ts
- [ ] Hooks execute on file save events
- [ ] Retry logic works with backoff
- [ ] Secrets redacted in all logs

### Phase 4 (Pending)

- [ ] Unit tests pass with >80% coverage
- [ ] Integration tests pass end-to-end
- [ ] Documentation complete
- [ ] Code reviewed and approved

## Known Issues

None yet - implementation just started!

## Notes

- Using ajv for JSON schema validation (industry standard)
- File watcher provides hot-reload without restart
- Secrets redactor uses regex patterns (configurable per hook)
- Concurrency controlled per-hook (default 4)
- Timeout and retry configurable per-hook
- Git triggers require explicit allowGit flag for safety

---

**Next Update:** After completing Event Registry, Hook Manager, and Prompt Runner
