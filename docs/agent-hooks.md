# Agent Hooks System

The Agent Hooks system provides event-triggered automation for VS Code workspaces. Hooks can automatically execute prompts or commands when specific events occur, such as file saves, file creation, git commits, or user-triggered actions.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration Schema](#configuration-schema)
- [Trigger Types](#trigger-types)
- [Action Types](#action-types)
- [Example Configuration](#example-configuration)
- [Activation Flow](#activation-flow)
- [Secrets Redaction](#secrets-redaction)
- [Debug Flags and Logging](#debug-flags-and-logging)
- [Structured Log File](#structured-log-file)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)

## Overview

The Agent Hooks system consists of several core components:

| Component            | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| **Config Loader**    | Loads and validates `.kiro/hooks.json` configuration  |
| **Event Registry**   | Registers VS Code event listeners for triggers        |
| **Hook Manager**     | Manages hook state and lifecycle                      |
| **Execution Engine** | Schedules and executes hooks with concurrency control |
| **Prompt Runner**    | Executes prompts/commands in background processes     |
| **Output Logger**    | Provides structured logging with secrets redaction    |
| **Secrets Redactor** | Replaces sensitive data with `[REDACTED]`             |

### Key Features

- **Event-driven automation**: Hooks trigger on file changes, git commits, and custom events
- **Background execution**: Hooks run without blocking the VS Code UI
- **Concurrency control**: Configurable limits on parallel executions
- **Retry with backoff**: Automatic retry on failure with exponential backoff
- **Secrets protection**: Automatic redaction of sensitive data from logs
- **Git safeguards**: Explicit opt-in required for git-triggered hooks

## Quick Start

1. Create a `.kiro/hooks.json` file in your workspace root:

```json
{
  "schemaVersion": "1.0.0",
  "hooks": [
    {
      "id": "lint-on-save",
      "name": "Lint TypeScript Files",
      "trigger": {
        "type": "fileEdited",
        "patterns": ["**/*.ts"]
      },
      "action": {
        "type": "runCommand",
        "command": "npm run lint"
      }
    }
  ]
}
```

2. The hooks system will automatically load and activate when VS Code opens the workspace.

3. View hook execution logs in the **Output** panel → **Agent Hooks** channel.

## Configuration Schema

The hooks configuration file (`.kiro/hooks.json`) follows this schema:

### Root Object

| Field           | Type   | Required | Default   | Description                          |
| --------------- | ------ | -------- | --------- | ------------------------------------ |
| `schemaVersion` | string | No       | `"1.0.0"` | Schema version for migration support |
| `hooks`         | array  | Yes      | -         | Array of hook definitions            |

### Hook Object

| Field            | Type    | Required    | Default   | Description                                                |
| ---------------- | ------- | ----------- | --------- | ---------------------------------------------------------- |
| `id`             | string  | Yes         | -         | Unique identifier (lowercase, dashes only: `^[a-z0-9-]+$`) |
| `name`           | string  | Yes         | -         | Human-readable name                                        |
| `description`    | string  | No          | -         | Optional description                                       |
| `trigger`        | object  | Yes         | -         | Event trigger configuration                                |
| `action`         | object  | Yes         | -         | Action to perform                                          |
| `enabled`        | boolean | No          | `true`    | Whether the hook is active                                 |
| `concurrency`    | integer | No          | `4`       | Max concurrent executions (1-10)                           |
| `timeout`        | integer | No          | `30000`   | Execution timeout in milliseconds (min: 1000)              |
| `retry`          | object  | No          | See below | Retry configuration                                        |
| `allowGit`       | boolean | No          | `false`   | Allow execution on git events                              |
| `repoRoot`       | string  | Conditional | -         | Repository root (required for git triggers)                |
| `secretPatterns` | array   | No          | `[]`      | Regex patterns for secret redaction                        |

### Trigger Object

| Field      | Type   | Required    | Description                                           |
| ---------- | ------ | ----------- | ----------------------------------------------------- |
| `type`     | string | Yes         | Trigger type (see [Trigger Types](#trigger-types))    |
| `patterns` | array  | Conditional | File glob patterns (required for file-based triggers) |

### Action Object

| Field     | Type   | Required    | Description                               |
| --------- | ------ | ----------- | ----------------------------------------- |
| `type`    | string | Yes         | `"askAgent"` or `"runCommand"`            |
| `prompt`  | string | Conditional | Prompt text (required for `askAgent`)     |
| `command` | string | Conditional | Shell command (required for `runCommand`) |

### Retry Object

| Field         | Type    | Default | Description                           |
| ------------- | ------- | ------- | ------------------------------------- |
| `maxAttempts` | integer | `3`     | Maximum retry attempts (1-5)          |
| `backoffMs`   | integer | `1000`  | Initial backoff delay in milliseconds |
| `jitter`      | boolean | `true`  | Add random jitter to backoff          |

## Trigger Types

| Type            | Description             | Requires Patterns                       |
| --------------- | ----------------------- | --------------------------------------- |
| `fileEdited`    | File saved              | Yes                                     |
| `fileCreated`   | New file created        | Yes                                     |
| `fileDeleted`   | File deleted            | Yes                                     |
| `gitCommit`     | Git commit event        | No (requires `allowGit` and `repoRoot`) |
| `promptSubmit`  | Agent prompt submitted  | No                                      |
| `agentStop`     | Agent execution stopped | No                                      |
| `userTriggered` | Manual user trigger     | No                                      |

### File Pattern Syntax

File patterns use glob syntax:

- `*` - Matches any characters except `/`
- `**` - Matches any characters including `/`
- `?` - Matches a single character

Examples:

- `**/*.ts` - All TypeScript files
- `src/**/*.js` - JavaScript files in src directory
- `*.json` - JSON files in root only
- `tests/**/*` - All files in tests directory

## Action Types

### askAgent

Sends a prompt to the AI agent for processing:

```json
{
  "type": "askAgent",
  "prompt": "Review the changes in {{file}} and suggest improvements"
}
```

### runCommand

Executes a shell command:

```json
{
  "type": "runCommand",
  "command": "npm run lint -- {{file}}"
}
```

**Note**: `runCommand` is only valid with `promptSubmit` and `agentStop` triggers for file-based events. For file events that need to run commands, use `askAgent` with instructions to run the command.

## Example Configuration

Here's a comprehensive example with multiple hooks:

```json
{
  "schemaVersion": "1.0.0",
  "hooks": [
    {
      "id": "format-on-save",
      "name": "Format TypeScript on Save",
      "description": "Automatically format TypeScript files when saved",
      "trigger": {
        "type": "fileEdited",
        "patterns": ["**/*.ts", "**/*.tsx"]
      },
      "action": {
        "type": "askAgent",
        "prompt": "Format the saved file using prettier"
      },
      "enabled": true,
      "concurrency": 2,
      "timeout": 10000
    },
    {
      "id": "test-on-change",
      "name": "Run Tests on File Change",
      "trigger": {
        "type": "fileEdited",
        "patterns": ["src/**/*.ts"]
      },
      "action": {
        "type": "askAgent",
        "prompt": "Run the related unit tests for the changed file"
      },
      "retry": {
        "maxAttempts": 2,
        "backoffMs": 500,
        "jitter": true
      }
    },
    {
      "id": "pre-commit-check",
      "name": "Pre-commit Validation",
      "trigger": {
        "type": "gitCommit"
      },
      "action": {
        "type": "askAgent",
        "prompt": "Validate the commit message follows conventional commits format"
      },
      "allowGit": true,
      "repoRoot": "/path/to/repo",
      "secretPatterns": ["password=\\w+", "api[_-]?key[=:]\\s*[\\w-]+"]
    },
    {
      "id": "cleanup-on-stop",
      "name": "Cleanup Temp Files",
      "trigger": {
        "type": "agentStop"
      },
      "action": {
        "type": "runCommand",
        "command": "rm -rf .tmp/*"
      }
    }
  ]
}
```

## Activation Flow

When VS Code opens a workspace with hooks configured:

```
1. Extension Activation
   ├── Initialize OutputLogger (logging channel)
   ├── Initialize PromptRunner (execution backend)
   ├── Initialize EventRegistry (event listeners)
   ├── Initialize HookManager (hook state)
   ├── Initialize ExecutionEngine (scheduler)
   └── Initialize ConfigLoader (config parser)

2. Configuration Loading
   ├── Read .kiro/hooks.json
   ├── Validate against JSON schema
   ├── Validate secret patterns (regex compilation)
   ├── Check for duplicate hook IDs
   ├── Normalize with default values
   └── Store in HookManager

3. Event Registration
   ├── Extract distinct trigger types
   ├── Register VS Code event listeners
   ├── Set up file watchers for patterns
   └── Configure git event handlers (if allowGit)

4. Runtime Operation
   ├── Event occurs (file save, etc.)
   ├── EventRegistry dispatches to HookManager
   ├── HookManager finds matching enabled hooks
   ├── ExecutionEngine enqueues hooks
   ├── Worker pool executes with concurrency limits
   └── Results logged to OutputLogger
```

### Time Budgets

| Operation             | Target   | Description                        |
| --------------------- | -------- | ---------------------------------- |
| Config load           | ≤ 2000ms | Initial configuration loading      |
| Listener registration | ≤ 500ms  | Event listener setup               |
| Event-to-enqueue      | ≤ 1000ms | Time from event to execution queue |

## Secrets Redaction

The hooks system automatically redacts sensitive information from logs and prompts.

### How It Works

1. **Pattern Configuration**: Define regex patterns in `secretPatterns` array
2. **Validation**: Patterns are validated at config load time
3. **Redaction**: Matching text is replaced with `[REDACTED]`
4. **Scope**: Applied to prompts, stdout, stderr, and all log output

### Configuring Secret Patterns

```json
{
  "secretPatterns": [
    "password[=:]\\s*\\S+",
    "api[_-]?key[=:]\\s*[\\w-]+",
    "token[=:]\\s*[\\w-]+",
    "secret[=:]\\s*\\S+",
    "AKIA[0-9A-Z]{16}",
    "ghp_[A-Za-z0-9]{36}"
  ]
}
```

### Built-in Pattern Detection

The system includes detection for common sensitive patterns:

- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_...`)
- Generic API keys and tokens
- Password assignments

### Pattern Validation Rules

- Patterns must be valid JavaScript regular expressions
- Overly broad patterns (`.*`, `.+`, empty string) are rejected
- Invalid patterns cause config load failure with error message

### Example

Input:

```
Connecting with password=secret123 and api_key=abc-xyz-123
```

Output (with patterns `password=\S+` and `api_key=\S+`):

```
Connecting with [REDACTED] and [REDACTED]
```

## Debug Flags and Logging

### Output Channel

All hook activity is logged to the **Agent Hooks** output channel:

1. Open VS Code **Output** panel (`Ctrl+Shift+U` / `Cmd+Shift+U`)
2. Select **Agent Hooks** from the dropdown

### Log Format

```
[2024-01-15T10:30:45.123Z] [hook-id] INFO: Message
[2024-01-15T10:30:45.456Z] [hook-id] ERROR: Error message
[2024-01-15T10:30:45.789Z] [hook-id] EXECUTION SUCCESS (attempt 1, duration: 234ms)
```

### Log Levels

| Level       | Description                        |
| ----------- | ---------------------------------- |
| `INFO`      | General information, state changes |
| `ERROR`     | Errors, failures, exceptions       |
| `EXECUTION` | Hook execution status updates      |

### Execution Status Values

| Status     | Description                        |
| ---------- | ---------------------------------- |
| `queued`   | Hook added to execution queue      |
| `running`  | Hook currently executing           |
| `success`  | Execution completed successfully   |
| `failure`  | Execution failed after all retries |
| `timeout`  | Execution exceeded timeout         |
| `canceled` | Execution was canceled             |

### Debug Information

The output includes:

- Timestamp for each log entry
- Hook ID for context
- Execution attempt number
- Duration in milliseconds
- Exit codes for commands
- Truncated stdout/stderr (first 500 chars)
- Error messages and stack traces

## Structured Log File

Enable persistent structured logging to `.kiro/logs/hooks.log` for later analysis, debugging, and auditing.

### Overview

The structured log file feature provides:

- **Append-only JSONL format**: Each log entry is a single JSON line, making it easy to parse and analyze
- **Automatic redaction**: All sensitive data is redacted before writing to disk
- **Automatic directory creation**: The `.kiro/logs/` directory is created automatically if it doesn't exist
- **Non-blocking writes**: File writes don't block the main extension functionality

### Enabling Structured Logs

The structured log file feature can be enabled programmatically when initializing the OutputLogger:

```typescript
import { OutputLogger, OutputLoggerConfig } from "./outputLogger";

// Enable at construction time
const config: OutputLoggerConfig = {
  enableFileLogging: true,
  workspaceRoot: "/path/to/workspace",
};
const logger = new OutputLogger("Agent Hooks", config);

// Or enable at runtime
logger.setFileLogging(true, "/path/to/workspace");

// Check if file logging is enabled
if (logger.isFileLoggingEnabled()) {
  console.log(`Logging to: ${logger.getLogFilePath()}`);
}

// Disable file logging
logger.setFileLogging(false);
```

### Log File Location

```
.kiro/
└── logs/
    └── hooks.log
```

The log file is created in the workspace root under `.kiro/logs/hooks.log`. The directory structure is created automatically when file logging is enabled.

### Log Entry Format (JSONL)

Each line in the log file is a valid JSON object. This format (JSON Lines) makes it easy to:

- Parse logs line by line without loading the entire file
- Use standard tools like `jq` for analysis
- Stream logs to external systems

#### Info Log Entry

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "hookId": "lint-on-save",
  "message": "Hook triggered"
}
```

#### Error Log Entry

```json
{
  "timestamp": "2024-01-15T10:30:45.456Z",
  "level": "error",
  "hookId": "test-runner",
  "error": "Command not found: npm"
}
```

#### Execution Log Entry

```json
{
  "timestamp": "2024-01-15T10:30:45.789Z",
  "level": "execution",
  "hookId": "lint-on-save",
  "status": "success",
  "attempt": 1,
  "duration": 234,
  "exitCode": 0
}
```

#### Execution with Output

```json
{
  "timestamp": "2024-01-15T10:30:46.123Z",
  "level": "execution",
  "hookId": "test-runner",
  "status": "failure",
  "attempt": 2,
  "duration": 5000,
  "exitCode": 1,
  "stdout": "Running tests...",
  "stderr": "Error: Test failed",
  "error": "Process exited with code 1"
}
```

### Fields Reference

| Field       | Type   | Log Levels       | Description                                           |
| ----------- | ------ | ---------------- | ----------------------------------------------------- |
| `timestamp` | string | All              | ISO 8601 timestamp (e.g., `2024-01-15T10:30:45.123Z`) |
| `level`     | string | All              | Log level: `info`, `error`, or `execution`            |
| `hookId`    | string | All              | Hook identifier (optional for system logs)            |
| `message`   | string | info             | Informational message                                 |
| `error`     | string | error, execution | Error message                                         |
| `status`    | string | execution        | Execution status (success, failure, timeout, etc.)    |
| `attempt`   | number | execution        | Attempt number (1-based)                              |
| `duration`  | number | execution        | Duration in milliseconds                              |
| `exitCode`  | number | execution        | Process exit code (if applicable)                     |
| `stdout`    | string | execution        | Standard output (if captured)                         |
| `stderr`    | string | execution        | Standard error (if captured)                          |

### Secrets Redaction

All log entries are automatically redacted before being written to the log file. This ensures that sensitive data configured in `secretPatterns` is never persisted to disk.

Example with secret pattern `password=\S+`:

**Before redaction:**

```json
{ "message": "Connecting with password=hunter2" }
```

**After redaction (written to file):**

```json
{ "message": "Connecting with [REDACTED]" }
```

### Analyzing Log Files

#### Using jq

```bash
# Get all execution failures
cat .kiro/logs/hooks.log | jq 'select(.level == "execution" and .status == "failure")'

# Get average duration for a specific hook
cat .kiro/logs/hooks.log | jq 'select(.hookId == "lint-on-save" and .duration) | .duration' | awk '{sum+=$1; count++} END {print sum/count}'

# Count logs by level
cat .kiro/logs/hooks.log | jq -r '.level' | sort | uniq -c

# Get all errors from the last hour
cat .kiro/logs/hooks.log | jq 'select(.level == "error")'
```

#### Using grep

```bash
# Find all timeout events
grep '"status":"timeout"' .kiro/logs/hooks.log

# Find logs for a specific hook
grep '"hookId":"my-hook"' .kiro/logs/hooks.log
```

### Error Handling

The structured log file writer is designed to be resilient:

- **Directory creation failure**: If the `.kiro/logs/` directory cannot be created, file logging is automatically disabled and an error is logged to the output channel
- **Write failure**: If a write to the log file fails (e.g., disk full, permissions), the error is logged to the output channel but does not affect the main extension functionality
- **Graceful degradation**: The extension continues to work normally even if file logging encounters errors

### Notes

- **No rotation**: Log rotation is not implemented in the MVP. For long-running workspaces, you may need to manually manage log file size.
- **No backfill**: Historical logs from before enabling file logging are not available.
- **Append-only**: Logs are only appended, never modified or deleted by the extension.

## Running Tests

The hooks system uses [Vitest](https://vitest.dev/) for testing.

### Prerequisites

```bash
# Install dependencies
yarn install
# or
npm install
```

### Running All Tests

```bash
# Run all tests
yarn test
# or
npm test
```

### Running Specific Test Files

```bash
# Run config loader tests
yarn test src/agent-hooks/configLoader.test.ts

# Run secrets redactor tests
yarn test src/agent-hooks/secretsRedactor.test.ts

# Run execution engine tests
yarn test src/agent-hooks/executionEngine.test.ts

# Run hook manager tests
yarn test src/agent-hooks/hookManager.test.ts

# Run event registry tests
yarn test src/agent-hooks/eventRegistry.test.ts

# Run integration tests
yarn test src/agent-hooks/integration.test.ts
```

### Test Coverage

```bash
# Run tests with coverage
yarn test --coverage
```

### Watch Mode

```bash
# Run tests in watch mode
yarn test --watch
```

### Test Categories

| Test File                 | Coverage                                    |
| ------------------------- | ------------------------------------------- |
| `configLoader.test.ts`    | Config loading, schema validation, defaults |
| `secretsRedactor.test.ts` | Pattern validation, redaction logic         |
| `hookManager.test.ts`     | Hook state, filtering, enable/disable       |
| `eventRegistry.test.ts`   | Listener registration, deduplication        |
| `executionEngine.test.ts` | Concurrency, timeout, retry logic           |
| `integration.test.ts`     | End-to-end workflow tests                   |

## Troubleshooting

### Common Issues

#### Hooks Not Loading

**Symptoms**: No hooks appear to be active, no log output

**Solutions**:

1. Check that `.kiro/hooks.json` exists in workspace root
2. Verify JSON syntax is valid
3. Check Output panel for schema validation errors
4. Ensure hook IDs match pattern `^[a-z0-9-]+$`

#### Schema Validation Errors

**Symptoms**: Error message about schema validation in Output panel

**Solutions**:

1. Verify all required fields are present (`id`, `name`, `trigger`, `action`)
2. Check trigger type is valid enum value
3. For file triggers, ensure `patterns` array is provided
4. For `askAgent`, ensure `prompt` is provided
5. For `runCommand`, ensure `command` is provided

#### Hooks Not Triggering

**Symptoms**: File saves don't trigger hooks

**Solutions**:

1. Verify `enabled` is `true` (or not set, defaults to true)
2. Check file patterns match the saved file
3. For git triggers, verify `allowGit: true` and `repoRoot` is set
4. Check Output panel for registration errors

#### Execution Timeouts

**Symptoms**: Hooks show `timeout` status

**Solutions**:

1. Increase `timeout` value in hook configuration
2. Optimize the command/prompt being executed
3. Check for infinite loops or blocking operations

#### Secrets Not Redacted

**Symptoms**: Sensitive data appears in logs

**Solutions**:

1. Verify `secretPatterns` array contains valid regex patterns
2. Test patterns against expected input
3. Check for regex escaping issues (use `\\` for backslash)

#### Duplicate Registration Warnings

**Symptoms**: "Trigger already registered" messages

**Solutions**:

- This is informational, not an error
- Multiple hooks can share the same trigger type
- The system deduplicates listeners automatically

### Error Codes

| Error                          | Description                 | Resolution              |
| ------------------------------ | --------------------------- | ----------------------- |
| `Schema validation failed`     | Config doesn't match schema | Fix JSON structure      |
| `Invalid JSON`                 | Malformed JSON syntax       | Check for syntax errors |
| `Duplicate hook ID`            | Two hooks have same ID      | Use unique IDs          |
| `Invalid secret patterns`      | Regex compilation failed    | Fix regex syntax        |
| `Listener registration failed` | VS Code API error           | Check trigger type      |
| `Execution engine shutdown`    | Extension deactivating      | Normal during shutdown  |

### Getting Help

1. Check the **Agent Hooks** output channel for detailed logs
2. Enable verbose logging if available
3. Review the configuration against the schema
4. Check for recent changes to `.kiro/hooks.json`

---

## Schema Reference

The full JSON Schema is available at:

```
src/agent-hooks/schema/.kiro.hooks.schema.json
```

You can use this schema for IDE autocompletion and validation in your `.kiro/hooks.json` file by adding:

```json
{
  "$schema": "./node_modules/your-extension/schema/.kiro.hooks.schema.json",
  "hooks": []
}
```
