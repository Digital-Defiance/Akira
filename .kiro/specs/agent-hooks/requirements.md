# Requirements Document

## Introduction

This document specifies the requirements for Implement an agent hooks system.

**Feature Idea:** Implement an agent hooks system for event-triggered automation. Hooks should trigger on file save, git commit, and other VS Code events, executing predefined prompts automatically in the background. Include hooks configuration file (.kiro/hooks.json), event listener registration, and hook execution engine.

## Glossary

- **hook**: A user-defined mapping of a trigger event to one or more prompt executions and associated metadata.
- **hooks configuration file**: A JSON file named .kiro/hooks.json stored at workspace root that declares hooks, triggers, prompts, and metadata.
- **event listener**: A registered callback inside the extension that receives VS Code events such as file save or git commit.
- **hook execution engine**: The runtime component that schedules, runs, logs, retries, and times out hook prompt executions in the background.
- **prompt**: A predefined text payload that the hook execution engine sends to an agent or local runner.
- **VS Code event**: An editor, workspace, or SCM lifecycle event emitted by VS Code (e.g., onDidSaveTextDocument, onWillSaveTextDocument, git commit).
- **hook ID**: A unique identifier string for a hook defined in .kiro/hooks.json.
- **output pane**: The extension's dedicated output channel in VS Code where execution logs and errors appear.

## Requirements

### Requirement REQ-1

**User Story:** As a developer, I want define hooks in a workspace-level configuration file, so that configure event-triggered prompts centrally for reproducible automation

#### Acceptance Criteria

1. WHEN the workspace opens the system shall load .kiro/hooks.json from the workspace root within 2000 ms
2. The system shall validate .kiro/hooks.json against the schema and reject the file when validation fails by emitting a schema error to the output pane
3. The system shall persist a normalized in-memory representation of each hook including hook ID, trigger, prompt, enabled flag, concurrency, timeout, and retry policy after successful validation

### Requirement REQ-2

**User Story:** As a extension author, I want register event listeners for configured hooks, so that ensure hooks execute automatically when target events occur

#### Acceptance Criteria

1. WHEN the extension activates the system shall register event listeners for all distinct trigger types declared in loaded hooks within 500 ms
2. WHILE an event listener is registered the system shall ensure the listener does not register duplicate callbacks for the same trigger and workspace
3. IF event listener registration fails THEN the system shall log the failure to the output pane with an error code and mark affected hooks as disabled in memory

### Requirement REQ-3

**User Story:** As a user, I want execute hooks automatically in the background, so that run prompts without blocking editing or requiring manual invocation

#### Acceptance Criteria

1. WHEN a configured trigger event occurs the system shall enqueue all matching enabled hooks for execution within 1000 ms of receiving the event
2. The system shall execute enqueued hooks in the background and shall not block the VS Code UI thread during execution
3. The system shall execute hooks concurrently up to the configured concurrency limit and shall default to 4 concurrent executions when not configured
4. The system shall abort a hook execution when the hook's configured timeout elapses and shall record the timeout event to the output pane with start and end timestamps

### Requirement REQ-4

**User Story:** As a security-conscious user, I want control which hooks run on sensitive events and protect secrets, so that prevent accidental exposure or execution during critical workflows such as git commit

#### Acceptance Criteria

1. WHEN a git commit event occurs the system shall execute only hooks that declare the repository root and have the allowGit flag set to true in .kiro/hooks.json
2. The system shall redact configured secret patterns from prompts and execution logs by replacing each match with the fixed token "[REDACTED]" before writing to the output pane
3. IF a hook execution returns a non-zero exit or error THEN the system shall retry execution according to the hook's retry policy and shall stop retrying after the configured retry count is reached and log the final failure

