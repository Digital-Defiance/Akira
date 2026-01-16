# Requirements Document

## Introduction

This document specifies the requirements for Implement fully autonomous execution mode.

**Feature Idea:** Implement fully autonomous execution mode where the agent can make decisions and execute tasks without user confirmation within a VS Code extension context. Enhance autonomous-executor.ts to support background execution, decision-making based on context, automatic error recovery, and self-guided progression through task phases. Add safety mechanisms including execution limits, rollback capabilities, checkpoint system (using markdown files and workspace state), and execution approval policies. Implement task progress tracking, VS Code notifications, and status bar indicators. Support pausing/resuming autonomous sessions with state persisted to markdown files.

## Glossary

- **Autonomous Executor**: The background agent component implemented in autonomous-executor.ts that makes decisions and executes tasks without user confirmation within VS Code.
- **Checkpoint**: A markdown file snapshot of task state at a defined phase boundary that enables rollback and resume, stored in `.akira/checkpoints/` directory.
- **Rollback**: An operation that restores task/file state to a prior checkpoint by reading the checkpoint markdown file and reverting changes.
- **Execution Approval Policy**: A configuration in VS Code settings that constrains autonomous execution by requiring confirmations, setting limits, or escalation procedures.
- **Session State File**: A markdown file in `.akira/sessions/` that tracks the current autonomous execution session, its tasks, and progress.
- **Session**: A single autonomous execution instance with a unique identifier, lifecycle states, and metadata stored in a session markdown file.
- **Task Detection**: The capability to validate if task success criteria are already met before executing the task.

## Requirements

### Requirement REQ-1

**User Story:** As a Product Owner, I want fully autonomous execution mode, so that tasks can run end-to-end without user confirmation to increase throughput

#### Acceptance Criteria

1. The system shall execute tasks from a tasks.md file end-to-end without requiring interactive user confirmation when autonomous mode is enabled via VS Code command or settings.
2. WHEN a task completes, the system shall update the task's checkbox in the tasks.md file from `- [ ]` to `- [x]` and append a completion timestamp comment.
3. WHEN autonomous mode is enabled, the system shall check for already-completed tasks by validating their success criteria before attempting execution.
4. IF a task's success criteria are already met (e.g., files exist, tests pass), THEN the system shall mark the task as complete without re-executing it and log the detection.
5. WHILE autonomous mode is enabled, the system shall limit concurrent task executions to a configurable maximum (default 3) settable in VS Code settings.

### Requirement REQ-2

**User Story:** As a Developer, I want background execution capability, so that tasks can run without blocking the VS Code UI

#### Acceptance Criteria

1. WHEN a user starts an autonomous session via command palette, the system shall create a session state file in `.akira/sessions/` with session ID and task list within 1 second.
2. WHILE background tasks execute, the system shall not block the VS Code UI and shall update the status bar with current task progress.
3. WHEN a background task completes, the system shall show a VS Code notification and update the session state file within 2 seconds.
4. The system shall use VS Code's async task execution to run LLM calls and file operations without freezing the editor.

### Requirement REQ-3

**User Story:** As a Data Scientist, I want contextual decision-making, so that the agent can choose the next action based on task context and confidence thresholds

#### Acceptance Criteria

1. WHEN the autonomous executor evaluates a task, the system shall analyze the task description, files mentioned, and success criteria to determine if execution is needed.
2. WHEN evaluating whether a task is already complete, the system shall check file existence, content validation, and command success criteria with confidence scoring.
3. IF the confidence score for "task already complete" is >= 0.80, THEN the system shall mark the task complete without re-executing and log the decision to the session file.
4. IF the confidence score is < 0.80 or task requires execution, THEN the system shall proceed with task execution and log the decision reasoning in the session file.
5. WHERE decision logging is enabled, the system shall append decision records to `.akira/sessions/<session-id>/decisions.md` with timestamp, task, confidence, and reasoning.

### Requirement REQ-4

**User Story:** As a Reliability Engineer, I want automatic error recovery with retries and rollback, so that failed tasks can recover automatically or rollback to known-safe states

#### Acceptance Criteria

1. WHEN a task execution fails with a transient error (e.g., API timeout, temporary file lock), the system shall retry the task up to 3 times with exponential backoff (1s, 2s, 4s).
2. IF a task fails after all retries, THEN the system shall create a checkpoint markdown file in `.akira/checkpoints/<session-id>/` capturing the state before the failed task and mark the task as Failed with error details.
3. WHEN the system performs a rollback, the system shall revert file changes using Git (if available) or file system snapshots captured in the checkpoint, and update the session file with rollback details within 2 seconds.
4. The system shall maintain a rollback history in `.akira/sessions/<session-id>/rollbacks.md` with checkpoint ID, timestamp, reason, and files affected.

### Requirement REQ-5

**User Story:** As a Systems Architect, I want checkpoint system and self-guided progression through phases, so that sessions can safely progress and have reproducible rollback/resume points

#### Acceptance Criteria

1. The system shall create a checkpoint markdown file in `.akira/checkpoints/<session-id>/phase-<N>.md` after successful completion of each phase, including phase ID, completed tasks, and workspace state snapshot.
2. WHILE a session transitions phases, the system shall validate all phase tasks are complete by checking the tasks.md file and shall advance to the next phase within 5 seconds when no blocking conditions exist.
3. WHEN a session has more than 50 checkpoints, the system shall optionally compact older checkpoints by keeping only phase boundary checkpoints and the 10 most recent checkpoints.
4. WHERE phase-level timeouts are configured in VS Code settings, the system shall pause or abort the phase if execution exceeds the timeout and create an error checkpoint with timeout details.

### Requirement REQ-6

**User Story:** As a Security Officer, I want execution limits and approval policies, so that autonomous actions are constrained by policy and safe to run

#### Acceptance Criteria

1. The system shall support configurable execution limits in VS Code settings including: max concurrent tasks, max total tasks per session, max file modifications, and require-confirmation-for-destructive-operations.
2. WHERE an execution policy defines a maximum file modification limit, the system shall count file creations/modifications and shall pause the session when the limit is reached, showing a VS Code warning notification.
3. IF a task requires destructive operations (file deletion, Git reset) AND require-confirmation-for-destructive-operations is true, THEN the system shall pause and show a VS Code quick pick dialog requiring user approval before proceeding.
4. WHEN a policy limit is reached or approval is required, the system shall update the session state file with "PAUSED_FOR_APPROVAL" status and await user input via command palette or notification action.

### Requirement REQ-7

**User Story:** As a Product Manager, I want status bar indicators and progress notifications, so that users have visibility and control over autonomous sessions

#### Acceptance Criteria

1. WHEN a new autonomous session starts, the system shall show a status bar item with session ID, current task, and progress indicator (e.g., "$(sync~spin) Autonomous: Task 3/10").
2. WHILE a session is active, the system shall update the status bar progress at least every task completion or every 30 seconds, whichever occurs first.
3. WHEN the system reaches configured progress milestones (25%, 50%, 75%, 100%), the system shall show a VS Code information notification within 5 seconds with summary of completed tasks.
4. The status bar item shall be clickable and shall open a quick pick menu showing: View Session Log, Pause Session, Resume Session, and Stop Session options.
5. WHEN a user clicks "View Session Log", the system shall open the session state file (`.akira/sessions/<session-id>/session.md`) in the editor.

### Requirement REQ-8

**User Story:** As an Operator, I want to pause/resume autonomous sessions and view execution history, so that I can intervene, audit, and resume sessions reliably

#### Acceptance Criteria

1. WHEN a user pauses a session via command palette or status bar, the system shall save the current state to the session file, set status to "PAUSED", and stop scheduling new tasks within 2 seconds.
2. WHEN a user resumes a paused session, the system shall restore the session state from the session file and continue with the next incomplete task within 3 seconds.
3. The system shall maintain execution history in `.akira/sessions/<session-id>/history.md` with timestamped entries for: task start/complete, errors, retries, checkpoints, rollbacks, and pause/resume events.
4. IF a paused session's session file is older than 7 days, THEN the system shall mark the session as "STALE" in the file and show an informational notification suggesting cleanup or archival.

### Requirement REQ-9

**User Story:** As an Integration Engineer, I want integration with external APIs and LLM calls, so that autonomous sessions can reliably call external services and generate content

#### Acceptance Criteria

1. WHEN the system makes an LLM API call (OpenAI, Anthropic, etc.), the system shall log request details (model, prompt length, tokens) to `.akira/sessions/<session-id>/api-calls.md`.
2. IF an LLM API call fails with a transient error (rate limit, timeout), THEN the system shall retry the call up to 3 times with exponential backoff and log each attempt.
3. IF an API call fails with authentication error (401/403), THEN the system shall pause the session, show a VS Code error notification requesting user to check API keys, and log the failure.
4. WHEN the system receives webhook events (e.g., from GitHub Actions CI status), it shall correlate them to the active session by checking session context and optionally resume paused sessions waiting on external conditions.

### Requirement REQ-10

**User Story:** As an Administrator, I want VS Code settings for configuration and limits, so that I can tune autonomous behavior and resource constraints

#### Acceptance Criteria

1. The system shall provide VS Code settings under `akira.autonomous` including: `maxConcurrentTasks`, `maxTasksPerSession`, `maxFileModifications`, `requireConfirmationForDestructiveOps`, `enableTaskDetection`, `phaseTimeout`, and `checkpointRetention`.
2. WHEN a user changes autonomous settings, the system shall validate numeric values against allowed ranges (e.g., maxConcurrentTasks: 1-10) and show an error notification for invalid values.
3. The system shall load configuration from `.vscode/settings.json` and user settings, with workspace settings taking precedence over user settings.
4. WHERE checkpoint retention settings are configured, the system shall automatically clean up checkpoint files older than the retention period (default 30 days) and log cleanup actions to the output channel.
