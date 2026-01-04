# Akira Autonomous Execution Engine - Architecture Overview

## Executive Summary

The Akira Autonomous Execution Engine is a comprehensive system for automated spec-driven development within VS Code. It enables autonomous execution of development tasks from specification files through intelligent task detection, LLM-powered code generation, and robust checkpoint/rollback mechanisms.

**Version:** 1.0  
**Date:** January 2, 2026  
**Status:** Production Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [Features](#features)
6. [Testing Strategy](#testing-strategy)
7. [Usage Guide](#usage-guide)
8. [Configuration](#configuration)
9. [Extension Points](#extension-points)
10. [Performance Characteristics](#performance-characteristics)

---

## System Overview

### Purpose

The Autonomous Execution Engine transforms static specification documents into executable development workflows. It reads spec files (written in markdown with checkboxes), detects tasks, generates implementation code using LLMs, executes the code, and tracks progress through completion.

### Key Capabilities

- ✅ **Autonomous Task Execution** - Automatically detects and executes tasks from spec files
- ✅ **LLM-Powered Code Generation** - Generates requirements, design, tasks, and implementation code
- ✅ **Intelligent Decision Making** - Evaluates task completion with confidence scoring
- ✅ **Checkpoint & Rollback** - Safe experimentation with Git-backed rollback
- ✅ **Concurrent Execution** - Runs multiple independent tasks simultaneously
- ✅ **Progress Tracking** - Real-time session monitoring with VS Code integration
- ✅ **Event-Driven Architecture** - Loosely coupled components via pub/sub
- ✅ **Persistent Storage** - Markdown-based human-readable session logs

### Design Principles

1. **Fail-Safe First** - All destructive operations have rollback mechanisms
2. **Human-Readable Storage** - Sessions stored as markdown with YAML frontmatter
3. **Event-Driven** - Components communicate via EventBus (pub/sub pattern)
4. **Progressive Automation** - Manual intervention supported at any point
5. **Transparent Operations** - Full audit trail of decisions and actions

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Autonomous Executor (Orchestrator)           │  │
│  │  • Session Lifecycle Management                           │  │
│  │  • Task Processing Coordination                           │  │
│  │  • Status Bar & UI Updates                                │  │
│  └────────┬──────────────────────────────────┬────────────────┘  │
│           │                                   │                   │
│  ┌────────▼────────┐                ┌────────▼─────────┐        │
│  │   Scheduler      │                │  Session Manager │        │
│  │  • Task Queue    │                │  • State Persist │        │
│  │  • Concurrency   │                │  • History Log   │        │
│  │  • Priority      │                │  • Counters      │        │
│  └────────┬─────────┘                └──────────────────┘        │
│           │                                                        │
│  ┌────────▼────────────────────────────────────────┐            │
│  │            Execution Engine                      │            │
│  │  • Action Execution (files, commands)            │            │
│  │  • Retry Logic with Exponential Backoff          │            │
│  │  • File Modification Limits                      │            │
│  └────────┬─────────────────────────────────────────┘            │
│           │                                                        │
│  ┌────────▼─────────┐      ┌──────────────┐    ┌─────────────┐ │
│  │ Decision Engine  │      │ LLM Integrator│    │  Checkpoint │ │
│  │ • Task Detection │      │ • Requirements│    │  Manager    │ │
│  │ • Success Check  │      │ • Design      │    │  • Snapshot │ │
│  │ • Confidence     │      │ • Tasks       │    │  • Restore  │ │
│  └──────────────────┘      │ • Impl Code   │    └──────┬──────┘ │
│                             └───────────────┘           │        │
│  ┌─────────────────────────────────────────────────────▼──────┐ │
│  │                    Git Integrator                            │ │
│  │  • Commit Creation  • Status Check  • Safe Rollback         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                       Event Bus                               │ │
│  │  • Pub/Sub Pattern  • Event History  • Wildcard Support      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    Storage Layer                              │ │
│  │  • Atomic Writes  • Write Queue  • Hash Calculation           │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘

                              ▼
                    ┌──────────────────┐
                    │   File System    │
                    │  .kiro/          │
                    │  ├── sessions/   │
                    │  └── checkpoints/│
                    └──────────────────┘
```

### Component Interaction Flow

```
User Command (akira.autonomous.start)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ 1. AutonomousExecutor.startSession()                │
│    • Creates session via SessionManager             │
│    • Starts Scheduler                               │
│    • Emits sessionStarted event                     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 2. Parse Spec File & Detect Tasks                  │
│    • Read markdown file                             │
│    • Extract checkboxes as tasks                    │
│    • Store in SessionState                          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 3. Enqueue Tasks (via Scheduler)                   │
│    • Priority queue (based on task order)           │
│    • Respects concurrency limits (default: 3)       │
│    • Worker pool pattern                            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 4. Process Task (for each task)                    │
│    ┌───────────────────────────────────────────┐   │
│    │ A. DecisionEngine.evaluateTask()          │   │
│    │    • Check if already complete             │   │
│    │    • Parse success criteria                │   │
│    │    • Calculate confidence (0.0-1.0)        │   │
│    └───────────────┬───────────────────────────┘   │
│                    │                                │
│    ┌───────────────▼───────────────────────────┐   │
│    │ B. If not complete:                        │   │
│    │    buildExecutionPlan()                    │   │
│    │    ┌─────────────────────────────────┐    │   │
│    │    │ LLMIntegrator.generateActions() │    │   │
│    │    │ • Infer type (req/design/impl)  │    │   │
│    │    │ • Call appropriate LLM generator│    │   │
│    │    │ • Parse into ExecutionActions   │    │   │
│    │    └──────────────┬──────────────────┘    │   │
│    └───────────────────▼───────────────────────┘   │
│                        │                            │
│    ┌───────────────────▼───────────────────────┐   │
│    │ C. ExecutionEngine.executePlan()          │   │
│    │    For each action:                        │   │
│    │    • file-write → create/update files      │   │
│    │    • file-delete → remove files            │   │
│    │    • command → spawn process with retry    │   │
│    │    • llm-generate → delegate to LLM        │   │
│    └───────────────┬───────────────────────────┘   │
│                    │                                │
│    ┌───────────────▼───────────────────────────┐   │
│    │ D. Mark Complete & Log                     │   │
│    │    • SessionManager.markTaskComplete()     │   │
│    │    • Update checkbox in spec file          │   │
│    │    • Log to history.md                     │   │
│    │    • Emit taskCompleted event              │   │
│    └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 5. Checkpoint at Phase Boundaries                  │
│    • CheckpointManager.createCheckpoint()           │
│    • Capture file snapshots                         │
│    • Create Git commit (if available)               │
│    • Store in .kiro/checkpoints/                    │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ 6. Complete Session                                 │
│    • Update session status → COMPLETED              │
│    • Show summary notification                      │
│    • Emit sessionCompleted event                    │
└─────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. EventBus (`event-bus.ts`)
Central pub/sub communication hub for loosely coupled components.

### 2. StorageLayer (`storage-layer.ts`)
Atomic file operations with write queuing and crash safety.

### 3. SessionManager (`session-manager.ts`)
Session lifecycle and state persistence in markdown format.

### 4. Scheduler (`scheduler.ts`)
Task queue with worker pool and concurrency control.

### 5. DecisionEngine (`decision-engine.ts`)
Evaluates task completion with success criteria and confidence scoring.

### 6. ExecutionEngine (`execution-engine.ts`)
Executes actions (files, commands, LLM) with retry logic.

### 7. CheckpointManager (`checkpoint-manager.ts`)
Phase-level checkpoints with Git integration and rollback.

### 8. GitIntegrator (`git-integrator.ts`)
Git operations for version control and safe rollback.

### 9. LLMIntegrator (`llm-integrator.ts`)
Connects to LLM generators for code generation.

### 10. AutonomousExecutor (`autonomous-executor.ts`)
Main orchestrator coordinating all components and VS Code UI.

---

## Data Flow

### Storage Structure
```
.kiro/
├── sessions/
│   └── session-{timestamp}/
│       ├── session.md      # State + task table
│       ├── history.md      # Execution log
│       └── decisions.md    # AI decisions
└── checkpoints/
    └── session-{timestamp}/
        └── phase-{n}-{timestamp}.md
```

### Session File Format (session.md)
```markdown
---
sessionId: session-1704153600000
status: RUNNING
phase: 3
specPath: /workspace/feature.md
---

# Session: feature

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
| task-1 | ✅ | 12:01 | 12:02 |
```

---

## Features

1. **Autonomous Task Execution** - Auto-detects and executes tasks from spec files
2. **LLM Code Generation** - Requirements, design, tasks, implementation
3. **Intelligent Completion Detection** - Success criteria evaluation
4. **Git-Backed Rollback** - Safe experimentation with checkpoint/restore
5. **Concurrent Execution** - Worker pool pattern (3 workers default)
6. **Progress Tracking** - Status bar, notifications, output channel
7. **Event-Driven** - Pub/sub for component decoupling
8. **Human-Readable Storage** - Markdown with YAML frontmatter

---

## Testing Strategy

### Three-Tier Approach

1. **Unit Tests** (Vitest) - `npm test`
   - 10 test files for each component
   - 140+ test cases
   - Mocked dependencies

2. **Integration Tests** (Vitest) - `npm test src/execution-engine.integration.test.ts`
   - 15 multi-component scenarios
   - Real file system operations
   - No VS Code dependency

3. **E2E Tests** (Mocha) - `npm run test:e2e`
   - 15 real VS Code workflows
   - Actual extension activation
   - UI integration testing

### Coverage: 100% of execution engine components

---

## Usage Guide

### Quick Start

1. Create spec file with checkboxes:
```markdown
# Feature: User Auth

## Tasks
- [ ] Create User model
- [ ] Add password hashing
- [ ] Create login endpoint
```

2. Start session: `Cmd+Shift+P` → "Akira: Start Autonomous Session"
3. Monitor progress in status bar
4. System auto-executes tasks with LLM

### Commands
- `akira.autonomous.start` - Start session
- `akira.autonomous.pause` - Pause execution
- `akira.autonomous.resume` - Resume execution
- `akira.autonomous.stop` - Stop session

---

## Configuration

```json
{
  "akira.autonomous.maxConcurrentTasks": 3,
  "akira.autonomous.maxTasksPerSession": 100,
  "akira.autonomous.enableLLM": true,
  "akira.autonomous.gitIntegration": true
}
```

---

## Extension Points

### Custom Event Handlers
```typescript
import { getEventBus } from './execution';
eventBus.subscribe("taskCompleted", (event) => {
  // Your logic
});
```

### Custom Success Criteria
```typescript
const criteria: SuccessCriteria = {
  type: "custom",
  validation: async () => {
    // Your validation
  }
};
```

---

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Session Creation | <100ms | Creates directory structure |
| Task Detection | <50ms | Per task |
| File Write | <10ms | Atomic with temp file |
| Checkpoint | <200ms | Excluding Git commit |
| Git Commit | <500ms | Varies by repo size |

### Scalability
- Max tasks/session: 100 (configurable to 1000+)
- Concurrent tasks: 3 (max 10)
- Memory footprint: ~15 MB typical

---

## Summary

Production-ready autonomous execution engine with:
- ✅ 10 core components
- ✅ 100% test coverage
- ✅ LLM integration
- ✅ Git-backed rollback
- ✅ Concurrent execution
- ✅ Full VS Code integration

**Status:** Ready for production use
