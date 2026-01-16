# Design Document

## Overview

The Execution Reflection Loop enhances the Akira autonomous execution engine with adaptive execution capabilities. Instead of failing immediately when a task execution doesn't succeed, the system will iteratively execute, evaluate, and re-plan until the task completes or a maximum iteration limit is reached. This brings Akira closer to feature parity with Amazon Kiro by enabling the system to learn from failures and automatically adjust its approach.

The reflection loop follows a simple pattern:

1. **Execute**: Generate and run an execution plan using the LLM
2. **Evaluate**: Check if the task is complete using the Decision Engine
3. **Re-plan**: If incomplete, analyze the failure and generate a new plan with failure context
4. **Repeat**: Continue until success or max iterations reached

This design integrates seamlessly with the existing execution engine architecture, enhancing rather than replacing current functionality.

## Architecture

### Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                   AutonomousExecutor                         │
│  • Calls executeWithReflection() instead of executePlan()   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   ExecutionEngine                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  executeWithReflection(task, context, options)        │  │
│  │    Loop (max iterations):                             │  │
│  │      1. Generate plan with failure context            │  │
│  │      2. Execute plan                                  │  │
│  │      3. Evaluate completion                           │  │
│  │      4. If complete → return success                  │  │
│  │      5. If incomplete → capture failure & continue    │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ LLMIntegrator  │ │DecisionEngine│ │ ContextManager   │
│ • Generate     │ │ • Evaluate   │ │ • Track failures │
│   with failure │ │   completion │ │ • Store history  │
│   context      │ │ • Calculate  │ │ • Provide        │
│ • Adjust       │ │   confidence │ │   context        │
│   strategy     │ └──────────────┘ └──────────────────┘
└────────────────┘
```

### Reflection Loop Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Task Execution Request                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Iteration 1: Initial Attempt                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. LLM generates initial execution plan                │ │
│  │ 2. Execute plan (file writes, commands, etc.)          │ │
│  │ 3. Decision Engine evaluates completion                │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │Complete?│
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │ Yes                 │ No
              ▼                     ▼
    ┌──────────────────┐  ┌─────────────────────────────────┐
    │ Return Success   │  │ Capture Failure Context:        │
    └──────────────────┘  │  • Error messages               │
                          │  • Files created/modified       │
                          │  • Command outputs              │
                          │  • Evaluation reasoning         │
                          └────────────┬────────────────────┘
                                       │
                                       ▼
                          ┌─────────────────────────────────┐
                          │ Iteration 2: Adaptive Retry     │
                          │  ┌───────────────────────────┐  │
                          │  │ 1. LLM receives:          │  │
                          │  │    - Previous failure     │  │
                          │  │    - Actions attempted    │  │
                          │  │    - Why it failed        │  │
                          │  │ 2. LLM generates NEW plan │  │
                          │  │ 3. Execute new plan       │  │
                          │  │ 4. Evaluate again         │  │
                          │  └───────────────────────────┘  │
                          └────────────┬────────────────────┘
                                       │
                                  ┌────▼────┐
                                  │Complete?│
                                  └────┬────┘
                                       │
                            ┌──────────┴──────────┐
                            │ Yes                 │ No
                            ▼                     ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │ Return Success   │  │ Continue loop... │
                  └──────────────────┘  │ (up to max iter) │
                                        └──────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │ Max iterations       │
                                    │ reached?             │
                                    │ Return last result   │
                                    │ with failure details │
                                    └──────────────────────┘
```

## Components and Interfaces

### 1. ExecutionEngine Enhancements

#### New Method: `executeWithReflection()`

```typescript
async executeWithReflection(
  task: TaskRecord,
  context: ExecutionContext,
  options: ReflectionOptions
): Promise<ExecutionResult>
```

**Parameters:**

- `task`: The task to execute
- `context`: Execution context including spec path, session ID, phase, and previous tasks
- `options`: Configuration including `maxIterations` (default: 3)

**Returns:** `ExecutionResult` with success status, error details, and execution metadata

**Behavior:**

1. Initialize iteration counter and failure history
2. Loop until success or max iterations:
   - Build failure context from previous attempts
   - Call `generateWithLLM()` with enriched context
   - Execute the generated plan
   - Evaluate completion using Decision Engine
   - If complete, return success immediately
   - If incomplete, capture failure details and continue
3. If loop exhausts, return last result with comprehensive failure information

#### Enhanced Method: `generateWithLLM()`

```typescript
async generateWithLLM(
  task: TaskRecord,
  context: ExecutionContext,
  failureContext?: FailureContext
): Promise<ExecutionResult>
```

**New Parameter:**

- `failureContext`: Optional context from previous failed attempts

**Behavior:**

- Pass failure context to LLM Integrator
- LLM receives information about what was tried and why it failed
- LLM generates a different approach based on failure analysis

### 2. ContextManager Enhancements

#### New Interface: `FailureContext`

```typescript
interface FailureContext {
  iteration: number;
  previousAttempts: AttemptRecord[];
  failurePatterns: FailurePattern[];
  environmentState: EnvironmentState;
}

interface AttemptRecord {
  iteration: number;
  timestamp: string;
  actions: ExecutionAction[];
  result: ExecutionResult;
  evaluationReason: string;
  confidence: number;
}

interface FailurePattern {
  errorMessage: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

interface EnvironmentState {
  filesCreated: string[];
  filesModified: string[];
  commandOutputs: Map<string, string>;
  workingDirectoryState: string[];
}
```

#### New Methods

```typescript
// Track an execution attempt
async trackAttempt(
  sessionId: string,
  taskId: string,
  attempt: AttemptRecord
): Promise<void>

// Get failure history for a task
async getFailureHistory(
  sessionId: string,
  taskId: string
): Promise<AttemptRecord[]>

// Detect failure patterns
async detectFailurePatterns(
  sessionId: string,
  taskId: string
): Promise<FailurePattern[]>

// Capture current environment state
async captureEnvironmentState(
  workspaceRoot: string
): Promise<EnvironmentState>

// Evaluate task after execution
async evaluateAfterExecution(
  task: TaskRecord,
  sessionId: string
): Promise<DecisionResult>
```

### 3. DecisionEngine Enhancements

#### Enhanced Method: `evaluateTask()`

The existing `evaluateTask()` method will be used for post-execution evaluation. No signature changes needed, but we'll add a new convenience method:

```typescript
// Evaluate with detailed reasoning for reflection
async evaluateWithDetails(
  task: TaskRecord,
  executionResult: ExecutionResult
): Promise<DetailedEvaluation>

interface DetailedEvaluation extends DecisionResult {
  criteriaResults: CriterionResult[];
  missingElements: string[];
  suggestions: string[];
}

interface CriterionResult {
  criterion: SuccessCriteria;
  met: boolean;
  reason: string;
  evidence?: string;
}
```

### 4. LLMIntegrator Enhancements

#### Enhanced Method: `generateActions()`

```typescript
async generateActions(request: {
  task: TaskRecord;
  context: ExecutionContext;
  failureContext?: FailureContext;
}): Promise<GenerationResult>
```

**New Behavior:**

- When `failureContext` is provided, include it in the LLM prompt
- Prompt structure:

  ```
  You are generating an execution plan for a task.

  Task: {task.title}

  [If failureContext exists:]
  Previous Attempts: {failureContext.previousAttempts.length}

  Attempt {iteration}:
  - Actions: {list of actions}
  - Result: {success/failure}
  - Reason: {evaluation reasoning}
  - Files created: {list}
  - Commands run: {list}

  Failure Patterns Detected:
  - {error message} (occurred {count} times)

  IMPORTANT: The previous approach did not work. Try a different strategy.
  Consider:
  - Different file locations
  - Alternative commands
  - Different implementation approach
  - Missing dependencies or setup steps

  Generate a NEW execution plan that addresses the failures above.
  ```

### 5. SessionManager Integration

#### New Methods

```typescript
// Log reflection iteration
async logReflectionIteration(
  sessionId: string,
  taskId: string,
  iteration: number,
  result: ExecutionResult,
  evaluation: DecisionResult
): Promise<void>

// Get reflection statistics
async getReflectionStats(
  sessionId: string
): Promise<ReflectionStats>

interface ReflectionStats {
  totalReflections: number;
  averageIterations: number;
  successRate: number;
  commonFailurePatterns: FailurePattern[];
}
```

## Data Models

### Configuration

```typescript
interface ReflectionConfig {
  enabled: boolean;
  maxIterations: number;
  confidenceThreshold: number;
  enablePatternDetection: boolean;
  pauseOnPersistentFailure: boolean;
  persistentFailureThreshold: number;
}

const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = {
  enabled: true,
  maxIterations: 3,
  confidenceThreshold: 0.8,
  enablePatternDetection: true,
  pauseOnPersistentFailure: true,
  persistentFailureThreshold: 2,
};
```

### Storage Format

Reflection data will be stored in the session directory:

```
.akira/sessions/{session-id}/
├── session.md              # Existing session state
├── history.md              # Existing execution log
├── decisions.md            # Existing decision log
├── reflection.md           # NEW: Reflection loop details
└── failures.json           # NEW: Structured failure data
```

#### reflection.md Format

```markdown
# Reflection Loop Log

## Task: {task-id}

### Iteration 1 (2026-01-04 10:30:00)

**Status:** Failed  
**Confidence:** 0.3  
**Reasoning:** Missing file src/component.ts

**Actions Attempted:**

- file-write: src/component.ts
- command: npm run build

**Result:** Build failed - module not found

---

### Iteration 2 (2026-01-04 10:30:15)

**Status:** Failed  
**Confidence:** 0.5  
**Reasoning:** File exists but tests fail

**Actions Attempted:**

- file-write: src/component.ts (revised)
- file-write: src/component.test.ts
- command: npm test

**Result:** Test failed - assertion error

---

### Iteration 3 (2026-01-04 10:30:30)

**Status:** Success  
**Confidence:** 0.9  
**Reasoning:** All criteria met

**Actions Attempted:**

- file-write: src/component.ts (revised again)
- file-write: src/component.test.ts (fixed)
- command: npm test

**Result:** All tests passed ✓
```

#### failures.json Format

```json
{
  "sessionId": "session-123",
  "tasks": {
    "task-1": {
      "attempts": [
        {
          "iteration": 1,
          "timestamp": "2026-01-04T10:30:00Z",
          "actions": [...],
          "result": {...},
          "evaluation": {...}
        }
      ],
      "patterns": [
        {
          "errorMessage": "module not found",
          "occurrences": 2,
          "firstSeen": "2026-01-04T10:30:00Z",
          "lastSeen": "2026-01-04T10:30:15Z"
        }
      ]
    }
  }
}
```

## Error Handling

### Transient vs Strategic Failures

The system distinguishes between two types of failures:

1. **Transient Failures** (handled by existing retry logic):
   - Network timeouts
   - File locks
   - Temporary resource unavailability
   - Exit codes indicating retry-able errors

2. **Strategic Failures** (handled by reflection loop):
   - Wrong approach or implementation
   - Missing dependencies
   - Incorrect file paths
   - Logic errors in generated code

**Decision Logic:**

```typescript
if (isTransientError(error)) {
  // Use exponential backoff retry (existing logic)
  await retryWithBackoff(action);
} else {
  // Use reflection loop
  await executeWithReflection(task, context);
}
```

### Persistent Failure Detection

When the same error occurs in multiple consecutive iterations:

1. **Detection:** Compare error messages across attempts
2. **Threshold:** Default 2 consecutive identical errors
3. **Action:** Pause execution and request user guidance
4. **User Prompt:**

   ```
   Task execution is stuck in a failure loop.

   Task: {task.title}
   Error: {error.message}
   Occurred: {count} times

   Attempted approaches:
   1. {summary of iteration 1}
   2. {summary of iteration 2}

   Would you like to:
   - Provide guidance for the next attempt
   - Skip this task
   - Stop execution
   ```

### Graceful Degradation

If reflection loop is disabled or fails:

- Fall back to single-attempt execution
- Log warning about reflection being unavailable
- Continue with standard error handling

## Testing Strategy

### Unit Tests

**ExecutionEngine Tests:**

- `executeWithReflection()` completes on first success
- `executeWithReflection()` retries on failure
- `executeWithReflection()` respects max iterations
- `executeWithReflection()` passes failure context to LLM
- `executeWithReflection()` returns last result when exhausted

**ContextManager Tests:**

- `trackAttempt()` stores attempt records
- `getFailureHistory()` retrieves attempts for a task
- `detectFailurePatterns()` identifies repeated errors
- `captureEnvironmentState()` captures file and command state
- `evaluateAfterExecution()` calls Decision Engine correctly

**DecisionEngine Tests:**

- `evaluateWithDetails()` provides detailed criterion results
- `evaluateWithDetails()` identifies missing elements
- `evaluateWithDetails()` generates helpful suggestions

**LLMIntegrator Tests:**

- `generateActions()` includes failure context in prompt
- `generateActions()` instructs LLM to try different approach
- `generateActions()` formats failure history correctly

### Integration Tests

**Reflection Loop Integration:**

- Complete flow: execute → fail → re-plan → succeed
- Multiple iterations with different failures
- Persistent failure detection and user escalation
- Failure pattern recognition across iterations
- Environment state tracking across attempts

**Backward Compatibility:**

- Existing `executePlan()` still works
- Existing `generateWithLLM()` works without failure context
- Reflection can be disabled via configuration
- Standard retry logic still functions for transient errors

### E2E Tests

**Real Execution Scenarios:**

- Task fails initially, succeeds on retry with adjusted approach
- Task fails persistently, user is prompted for guidance
- Reflection loop disabled, falls back to single attempt
- Multiple tasks with reflection in parallel session
- Session recovery after crash during reflection

**Observability:**

- Reflection iterations logged to session history
- Failure patterns visible in reflection.md
- Event bus emits reflection events
- Status bar shows iteration progress

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Reflection Loop Execution Properties

**Property 1: Reflection loop initiation on failure**  
_For any_ task execution that fails, the Execution Engine should initiate a reflection loop with the configured max iterations setting.  
**Validates: Requirements 1.1**

**Property 2: Failure context propagation**  
_For any_ reflection iteration after the first, the failure context from all previous attempts should be included in the LLM generation request.  
**Validates: Requirements 1.2, 3.1, 3.2, 3.3**

**Property 3: Iteration exhaustion handling**  
_For any_ reflection loop that reaches max iterations without success, the returned result should contain the last execution result with complete failure details.  
**Validates: Requirements 1.3**

**Property 4: Early exit on success**  
_For any_ task that completes successfully before max iterations, no further iterations should be executed.  
**Validates: Requirements 1.4**

**Property 5: Iteration logging**  
_For any_ reflection loop with logging enabled, each iteration should be logged with its iteration number, actions attempted, and failure reason.  
**Validates: Requirements 1.5, 7.1, 7.2, 7.3**

### Evaluation Properties

**Property 6: Post-execution evaluation**  
_For any_ execution attempt, the Decision Engine should evaluate the task against its success criteria after execution completes.  
**Validates: Requirements 2.1**

**Property 7: Confidence threshold for completion**  
_For any_ task evaluation with confidence >= 0.8, the task should be marked as complete.  
**Validates: Requirements 2.2**

**Property 8: Low confidence reasoning**  
_For any_ task evaluation with confidence < 0.8, the result should include specific reasons explaining why the task is incomplete.  
**Validates: Requirements 2.3**

**Property 9: Evaluation error handling**  
_For any_ evaluation that fails due to errors, the task should be treated as incomplete and the evaluation error should be logged.  
**Validates: Requirements 2.4**

**Property 10: Comprehensive evaluation checks**  
_For any_ task evaluation, the Decision Engine should perform file existence checks, command validation, and content verification.  
**Validates: Requirements 2.5**

### LLM Integration Properties

**Property 11: Failure pattern summarization**  
_For any_ re-planning attempt with multiple previous failures, the LLM prompt should include a summary of detected failure patterns.  
**Validates: Requirements 3.4**

**Property 12: Different approach instruction**  
_For any_ re-planning attempt, the LLM prompt should explicitly instruct the LLM to try a different approach than previous attempts.  
**Validates: Requirements 3.5**

### Context Management Properties

**Property 13: Attempt tracking**  
_For any_ execution attempt, the Context Manager should track it with timestamp, actions, outcome, and evaluation result.  
**Validates: Requirements 4.1**

**Property 14: Failure history persistence**  
_For any_ task with failed attempts, the Context Manager should maintain a queryable history of failure reasons.  
**Validates: Requirements 4.2, 4.3**

**Property 15: File modification tracking**  
_For any_ execution attempt that modifies files, the Context Manager should track which files were modified.  
**Validates: Requirements 4.4**

**Property 16: Context persistence**  
_For any_ execution context, it should be persisted to session storage and recoverable after crashes.  
**Validates: Requirements 4.5**

### Configuration Properties

**Property 17: Max iterations configuration**  
_For any_ reflection loop, it should respect the configured max iterations setting (default: 3).  
**Validates: Requirements 5.1**

**Property 18: Confidence threshold configuration**  
_For any_ task evaluation, the completion decision should use the configured confidence threshold (default: 0.8).  
**Validates: Requirements 5.2**

**Property 19: Reflection toggle**  
_For any_ execution when reflection is disabled, the system should fall back to single-attempt execution with standard retry logic.  
**Validates: Requirements 5.3, 5.4**

**Property 20: Reflection metrics emission**  
_For any_ completed reflection loop, metrics (iterations used, success rate) should be emitted via the event bus.  
**Validates: Requirements 5.5**

### Failure Pattern Recognition Properties

**Property 21: Persistent failure detection**  
_For any_ sequence of 2+ consecutive iterations with the same error message, the system should recognize it as a persistent failure.  
**Validates: Requirements 6.1**

**Property 22: User escalation on persistent failure**  
_For any_ detected persistent failure, execution should pause and request user guidance with a summary of attempted approaches.  
**Validates: Requirements 6.2, 6.3**

**Property 23: User guidance incorporation**  
_For any_ user-provided guidance, it should be incorporated into the next execution plan generation.  
**Validates: Requirements 6.4**

**Property 24: Session-level pattern tracking**  
_For any_ session with multiple tasks, failure patterns should be tracked across all tasks to identify systemic issues.  
**Validates: Requirements 6.5**

### Observability Properties

**Property 25: Reflection completion event**  
_For any_ completed reflection loop, an event should be emitted containing the iteration count and final outcome.  
**Validates: Requirements 7.4**

**Property 26: Session history persistence**  
_For any_ reflection loop activity, it should be persisted to the session history file.  
**Validates: Requirements 7.5**

### Retry Integration Properties

**Property 27: Transient error retry precedence**  
_For any_ transient error (network timeout, file lock), standard exponential backoff retry should be used before invoking reflection.  
**Validates: Requirements 8.1**

**Property 28: Retry success short-circuit**  
_For any_ execution where standard retry succeeds, reflection should not be initiated.  
**Validates: Requirements 8.2**

**Property 29: Retry to reflection handoff**  
_For any_ execution where standard retry exhausts all attempts, reflection should be initiated with the failure context.  
**Validates: Requirements 8.3**

**Property 30: Error classification**  
_For any_ execution error, the system should correctly classify it as either transient (use retry) or strategic (use reflection).  
**Validates: Requirements 8.4**

**Property 31: Retry mechanism logging**  
_For any_ failure, the log should indicate which retry mechanism (standard retry or reflection) was used.  
**Validates: Requirements 8.5**
