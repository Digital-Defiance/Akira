# Autonomous Execution Engine

This module implements the autonomous spec execution system for the Akira VS Code extension.

## Overview

The execution engine enables fully autonomous execution of specs, where tasks can be run automatically with safety mechanisms, decision-making, and progress tracking.

## Architecture

### Core Components

#### 1. **AutonomousExecutor** (`autonomous-executor.ts`)

Main orchestrator that manages the entire execution lifecycle:

- Starts/pauses/resumes/stops sessions
- Loads tasks from tasks.md
- Coordinates between all other components
- Manages UI updates (status bar, notifications)

#### 2. **SessionManager** (`session-manager.ts`)

Manages session state persistence:

- Creates and tracks execution sessions
- Persists session state to markdown files (`.akira/sessions/<id>/session.md`)
- Maintains history, decisions, and logs
- Tracks task completion and failures

#### 3. **Scheduler** (`scheduler.ts`)

Handles task queueing and concurrency control:

- Priority-based task queue
- Configurable concurrency (default: 3 concurrent tasks)
- Worker pool management
- Task routing to executor

#### 4. **DecisionEngine** (`decision-engine.ts`)

Evaluates whether tasks need execution:

- Checks file existence
- Runs command validation
- Parses success criteria from task descriptions
- Returns confidence scores (0-1) for task completion

#### 5. **ExecutionEngine** (`execution-engine.ts`)

Executes individual task actions with reflection loop for adaptive retry:

- File operations (create, modify, delete)
- Command execution with retries
- Reflection loop: iterative re-planning on failure (up to 3 iterations)
- Failure context propagation to LLM
- Approval flow for destructive operations
- LLM integration with failure-aware prompting

#### 6. **ContextManager** (`context-manager.ts`)

Tracks execution history and failure patterns:

- Execution attempt tracking with timestamps
- Failure history maintenance
- Failure pattern detection
- Environment state capture (files, commands)
- Context persistence to session storage

#### 7. **StorageLayer** (`storage-layer.ts`)

Atomic file operations:

- Atomic writes (temp file + rename)
- Write queue with debouncing
- Directory management
- Checkpoint cleanup

#### 8. **EventBus** (`event-bus.ts`)

Pub/sub system for execution events:

- Session lifecycle events
- Task progress events
- Approval requests
- Progress updates

## Session Management

### Session Structure

Each session is stored in `.akira/sessions/<session-id>/`:

```
session.md          # Main session state (YAML front-matter + task table)
history.md          # Chronological event log
decisions.md        # Task detection decisions
reflection.md       # Reflection loop iterations and outcomes
failures.json       # Structured failure data and patterns
api-calls.md        # External API/LLM call logs
rollbacks.md        # Rollback history (future)
```

### Session Status States

- **RUNNING**: Active execution
- **PAUSED**: User-paused, can resume
- **PAUSED_FOR_APPROVAL**: Waiting for destructive operation approval
- **COMPLETED**: All tasks finished
- **FAILED**: Execution failed
- **STALE**: Paused for > 7 days

## Reflection Loop

The Reflection Loop enables adaptive execution by iteratively re-planning failed tasks with failure context:

### How It Works

1. **Initial Execution**: Task executes with LLM-generated plan
2. **Evaluation**: Decision Engine checks completion (confidence score 0-1)
3. **Failure Detection**: If confidence < 0.8, capture failure context
4. **Adaptive Retry**: LLM receives failure context and generates new plan
5. **Iteration**: Repeat up to max iterations (default: 3)
6. **User Escalation**: If persistent failure detected, prompt user for guidance

### Failure Context

Each iteration captures:

- Error messages and stack traces
- Actions attempted (files written, commands run)
- Evaluation reasoning (why task incomplete)
- Environment state (files created/modified)
- Previous iteration outcomes

### Configuration

```json
{
  "akira.autonomous.reflection.enabled": true,
  "akira.autonomous.reflection.maxIterations": 3,
  "akira.autonomous.reflection.confidenceThreshold": 0.8,
  "akira.autonomous.reflection.enablePatternDetection": true,
  "akira.autonomous.reflection.pauseOnPersistentFailure": true
}
```

### Failure Pattern Detection

The system identifies repeated failures:

- Same error message in 2+ consecutive iterations = persistent failure
- Triggers user escalation with summary of attempted approaches
- User can provide guidance to incorporate into next iteration

### Transient vs Strategic Errors

- **Transient Errors**: Network timeouts, file locks → Standard retry with exponential backoff
- **Strategic Errors**: Wrong approach, missing dependencies → Reflection loop

### Observability

All reflection activity is logged:

- `reflection.md`: Human-readable iteration log
- `failures.json`: Structured failure data
- `history.md`: Complete execution timeline
- Event bus: Real-time reflection events

## Task Detection

The decision engine can automatically detect if a task is already complete by:

1. **File Existence**: Check if required files exist
2. **Command Success**: Run validation commands (build, test, lint)
3. **Confidence Scoring**: Combine checks into 0-1 confidence score

If confidence >= 0.8, the task is marked complete without re-execution.

## Safety Mechanisms

### 1. Execution Limits

- Max concurrent tasks (default: 3)
- Max tasks per session (default: 100)
- Max file modifications (default: 50)

### 2. Approval Policies

- Destructive operations require confirmation
- User approval via VS Code modal dialog
- Session pauses until approval granted

### 3. Retry & Backoff

- Transient errors retry up to 3 times
- Exponential backoff: 1s, 2s, 4s
- Non-transient errors fail immediately

### 4. Checkpoints (Future)

- Phase-level snapshots
- Rollback to safe states
- Git integration when available

## VS Code Integration

### Commands

- `akira.autonomous.start` - Start execution for a spec
- `akira.autonomous.pause` - Pause the current session
- `akira.autonomous.resume` - Resume a paused session
- `akira.autonomous.stop` - Stop execution
- `akira.showSessionMenu` - Quick actions menu

### Status Bar

Active sessions show:

```
$(sync~spin) Akira: 3/10
```

Click to open session menu with:

- View Session Log
- Pause/Resume Session
- Stop Session
- View Progress

### Notifications

Milestone notifications at:

- 25% complete
- 50% complete
- 75% complete
- 100% complete

## Configuration

Settings under `akira.autonomous`:

```json
{
  "akira.autonomous.maxConcurrentTasks": 3,
  "akira.autonomous.maxTasksPerSession": 100,
  "akira.autonomous.maxFileModifications": 50,
  "akira.autonomous.requireConfirmationForDestructiveOps": true,
  "akira.autonomous.enableTaskDetection": true,
  "akira.autonomous.phaseTimeout": 600000,
  "akira.autonomous.checkpointRetention": 30
}
```

## Usage Example

1. **Create a spec with tasks**:

   ```
   @spec create my-feature "Description"
   @spec my-feature continue  (generates design & tasks)
   ```

2. **Start autonomous execution**:
   - Right-click spec in tree view → "Start Autonomous Execution"
   - Or: Command Palette → "Akira: Start Autonomous Execution"

3. **Monitor progress**:
   - Status bar shows current progress
   - Click status bar for session menu
   - View session.md for detailed state

4. **Task execution**:
   - Tasks with success criteria may auto-complete (detection)
   - Tasks without automated actions show guidance
   - Manual implementation required, then mark complete

5. **Control execution**:
   - Pause: Stops scheduling new tasks
   - Resume: Continues from current state
   - Stop: Ends session gracefully

## Event Flow

```
User triggers start
  ↓
AutonomousExecutor.startSession()
  ↓
SessionManager.createSession()
  ↓
Load tasks from tasks.md
  ↓
Scheduler.enqueueTasks()
  ↓
For each task:
  DecisionEngine.evaluateTask()
    ↓ (if confidence < 0.8)
  ExecutionEngine.executePlan()
    ↓
  Update tasks.md checkbox
    ↓
  SessionManager.markTaskComplete()
    ↓
  EventBus.emit("taskCompleted")
```

## Future Enhancements

- [ ] Full LLM integration for code generation
- [ ] Checkpoint system with rollback
- [ ] Git integration for safe reverts
- [ ] Webhook support for external events
- [ ] Checkpoint compaction
- [ ] Telemetry & metrics
- [ ] Plugin registry for custom providers

## Testing

Key test scenarios:

1. **Session lifecycle**: Start, pause, resume, stop
2. **Task detection**: File checks, command validation
3. **Concurrency**: Multiple tasks executing
4. **Error handling**: Retries, approval flow
5. **Storage**: Atomic writes, session persistence

## Implementation Status

✅ Core execution engine
✅ Session management
✅ Scheduler with concurrency
✅ Decision engine
✅ Context manager with failure tracking
✅ Reflection loop with adaptive retry
✅ Failure pattern detection
✅ Storage layer
✅ Event bus
✅ VS Code commands
✅ LLM integration with failure-aware prompting
⚠️ Checkpoint system (basic implementation)
⚠️ Git rollback (basic implementation)

## Notes

- The execution engine provides complete **infrastructure** for autonomous execution
- Reflection loop enables adaptive retry with failure context
- Failure pattern detection escalates to user when needed
- Safe to use - includes approval flow for destructive operations
- Session state persisted to markdown for transparency
- All reflection activity logged to reflection.md and failures.json
