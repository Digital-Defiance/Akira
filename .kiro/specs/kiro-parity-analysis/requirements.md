# Requirements Document: Kiro Parity Analysis

## Introduction

This document analyzes the current state of Akira compared to Amazon Kiro and identifies the remaining features needed to achieve feature parity. Akira is a VS Code extension for spec-driven development with EARS requirements, property-based testing, and autonomous execution capabilities.

**Current Status Summary:**

- ✅ **Completed**: Autonomous execution with reflection loop, spec workflow (requirements → design → tasks), EARS validation, MCP integration, tree view UI
- 🚧 **In Progress**: Agent hooks (tasks defined but not implemented), execution history (requirements only)
- ❌ **Missing**: Several key Kiro features identified below

## Glossary

- **Kiro**: Amazon's internal AI-powered development assistant with autonomous execution capabilities
- **Akira**: Open-source VS Code extension aiming to replicate Kiro's functionality
- **Spec-Driven Development**: Methodology where features are developed through Requirements → Design → Tasks → Execution phases
- **EARS**: Easy Approach to Requirements Syntax - structured requirement patterns
- **Reflection Loop**: Iterative execution pattern that learns from failures and adjusts strategy
- **Agent Hooks**: Automated triggers that execute agent actions based on IDE events
- **Steering Files**: Context files that guide agent behavior with project-specific knowledge
- **MCP**: Model Context Protocol for persistent context across chat sessions

## Requirements

### Requirement 1: Complete Agent Hooks Implementation

**User Story:** As a developer, I want automated agent actions triggered by IDE events, so that repetitive tasks are handled automatically without manual intervention.

#### Acceptance Criteria

1. The system SHALL load and validate `.akira/hooks.json` configuration file from workspace root within 2000ms
2. WHEN a configured event occurs (file save, git commit, prompt submit), the system SHALL execute the associated hook actions
3. The system SHALL support both `askAgent` and `runCommand` hook actions with proper event type restrictions
4. The system SHALL provide a UI for creating, editing, and managing hooks without manual JSON editing
5. The system SHALL log all hook executions to an output channel with timestamps and results

**Current Status:** Requirements and design complete, tasks defined, but no implementation exists in src/

**Priority:** HIGH - This is a key Kiro feature for automation

---

### Requirement 2: Execution History and Session Management

**User Story:** As a developer, I want to view and manage past autonomous execution sessions, so that I can review what was done, debug issues, and resume interrupted work.

#### Acceptance Criteria

1. The system SHALL persist all autonomous execution sessions to `.akira/sessions/<session-id>/` with session.md, history.md, decisions.md, and api-calls.md files
2. The system SHALL provide a tree view or panel showing all past sessions with status, duration, and task completion metrics
3. WHEN a user selects a session, the system SHALL display detailed execution history including tasks attempted, decisions made, and failures encountered
4. The system SHALL allow users to resume paused or failed sessions from their last checkpoint
5. The system SHALL provide session cleanup/archival functionality for old sessions (configurable retention period)

**Current Status:** Requirements document exists but no design or implementation

**Priority:** HIGH - Critical for debugging and understanding autonomous execution

---

### Requirement 3: Steering Files System

**User Story:** As a developer, I want to provide project-specific context and guidelines to the agent, so that it follows team conventions and understands project architecture.

#### Acceptance Criteria

1. The system SHALL load markdown files from `.akira/steering/` directory and include them in agent context
2. The system SHALL support three inclusion modes: always-included, file-pattern-conditional, and manual (#reference)
3. The system SHALL support file references within steering files using `#[[file:<path>]]` syntax
4. The system SHALL provide a UI for creating and managing steering files with templates for common patterns
5. The system SHALL validate steering file syntax and warn about broken file references

**Current Status:** Requirements document exists but no design or implementation

**Priority:** MEDIUM - Important for customization but not blocking core functionality

---

### Requirement 4: Task Dependencies and Parallel Execution

**User Story:** As a developer, I want to define dependencies between tasks and execute independent tasks in parallel, so that complex features are built efficiently in the correct order.

#### Acceptance Criteria

1. The system SHALL support task dependency declarations in tasks.md using `depends-on: [task-ids]` syntax
2. The system SHALL validate dependency graphs and detect circular dependencies before execution
3. WHEN executing tasks, the system SHALL respect dependencies and only start tasks after their dependencies complete
4. The system SHALL execute independent tasks in parallel up to a configurable concurrency limit
5. The system SHALL visualize task dependencies in the tree view with dependency arrows or indicators

**Current Status:** Requirements document exists but no design or implementation

**Priority:** MEDIUM - Enhances execution efficiency but not critical for MVP

---

### Requirement 5: Multimodal Input Support

**User Story:** As a developer, I want to provide images, diagrams, and screenshots to the agent, so that I can communicate visual requirements and UI designs effectively.

#### Acceptance Criteria

1. The system SHALL accept image files (PNG, JPG, SVG) as attachments in chat messages
2. The system SHALL process images through vision-capable LLM models (GPT-4V, Claude 3) when available
3. The system SHALL extract text from images using OCR when vision models are unavailable
4. The system SHALL store image references in spec documents with relative paths
5. The system SHALL display image previews in the chat interface and spec documents

**Current Status:** Requirements document exists but no design or implementation

**Priority:** LOW - Nice to have but not essential for core functionality

---

### Requirement 6: Enhanced Chat Participant with Streaming

**User Story:** As a developer, I want real-time streaming responses in chat, so that I can see progress and cancel long-running operations.

#### Acceptance Criteria

1. The system SHALL stream LLM responses token-by-token to the chat interface
2. The system SHALL show progress indicators for long-running operations (file generation, task execution)
3. The system SHALL support cancellation of in-progress operations via cancel button
4. The system SHALL provide inline actions in chat responses (approve phase, execute task, open file)
5. The system SHALL maintain chat history across sessions with persistence to workspace storage

**Current Status:** Basic chat participant exists but lacks streaming and advanced features

**Priority:** MEDIUM - Improves UX significantly

---

### Requirement 7: Spec Templates and Scaffolding

**User Story:** As a developer, I want pre-built spec templates for common feature types, so that I can start new specs quickly with best practices.

#### Acceptance Criteria

1. The system SHALL provide templates for common feature types: API endpoint, UI component, database schema, CLI command, background job
2. WHEN creating a new spec, the system SHALL offer template selection with preview
3. The system SHALL support custom template creation and sharing via workspace `.akira/templates/` directory
4. The system SHALL scaffold initial file structure based on template (e.g., create src/ files for API endpoint)
5. The system SHALL populate template variables from user input (feature name, entity names, etc.)

**Current Status:** No requirements, design, or implementation

**Priority:** LOW - Quality of life improvement

---

### Requirement 8: Integration with External Tools

**User Story:** As a developer, I want the agent to integrate with external tools (GitHub, Jira, Slack), so that spec-driven development fits into existing workflows.

#### Acceptance Criteria

1. The system SHALL support GitHub integration for creating issues from requirements and PRs from completed specs
2. The system SHALL support Jira integration for syncing requirements with Jira stories
3. The system SHALL support Slack notifications for spec phase completions and execution failures
4. The system SHALL provide webhook support for custom integrations
5. The system SHALL store integration credentials securely using VS Code secret storage

**Current Status:** No requirements, design, or implementation

**Priority:** LOW - Enterprise feature, not essential for individual developers

---

### Requirement 9: Property-Based Test Generation and Execution

**User Story:** As a developer, I want the agent to generate and run property-based tests automatically, so that correctness properties are validated during execution.

#### Acceptance Criteria

1. The system SHALL generate property-based test code from correctness properties in design.md
2. The system SHALL support multiple PBT frameworks: fast-check (JS/TS), Hypothesis (Python), QuickCheck (Haskell)
3. WHEN executing tasks, the system SHALL run property tests and report failures with counterexamples
4. The system SHALL update PBT task status in tasks.md with pass/fail and counterexample details
5. The system SHALL provide a command to re-run all property tests for a spec

**Current Status:** PBT support exists in design phase but test generation and execution is manual

**Priority:** HIGH - Core differentiator for Akira's correctness focus

---

### Requirement 10: Workspace-Level Configuration and Settings UI

**User Story:** As a developer, I want a graphical interface for configuring Akira settings, so that I don't need to manually edit JSON configuration files.

#### Acceptance Criteria

1. The system SHALL provide a webview panel for configuring all Akira settings
2. The system SHALL organize settings into categories: General, Autonomous Execution, Reflection Loop, Hooks, Integrations
3. The system SHALL validate setting values in real-time with helpful error messages
4. The system SHALL support workspace-level and user-level settings with clear precedence indicators
5. The system SHALL provide "Reset to Default" functionality for each setting

**Current Status:** Settings exist in package.json but no UI for configuration

**Priority:** LOW - Settings can be edited in VS Code settings UI

---

## Analysis Summary

### Completed Features (Kiro Parity Achieved)

- ✅ Spec-driven workflow (Requirements → Design → Tasks → Execution)
- ✅ EARS requirements validation
- ✅ Autonomous execution engine
- ✅ Reflection loop with adaptive retry
- ✅ MCP integration for persistent context
- ✅ Tree view UI for spec management
- ✅ CodeLens for task execution
- ✅ Chat participant for @spec commands

### High Priority Gaps (Blocking Kiro Parity)

1. **Agent Hooks** - Automation is a key Kiro feature
2. **Execution History** - Essential for debugging autonomous execution
3. **Property-Based Test Generation** - Core to Akira's correctness focus

### Medium Priority Gaps (Important but Not Blocking)

4. **Steering Files** - Customization and project context
5. **Task Dependencies** - Efficient parallel execution
6. **Enhanced Chat Streaming** - Better UX

### Low Priority Gaps (Nice to Have)

7. **Multimodal Input** - Visual requirements
8. **Spec Templates** - Faster spec creation
9. **External Integrations** - Enterprise workflows
10. **Settings UI** - Convenience feature

### Implementation Roadmap

**Phase 1: Core Parity (4-6 weeks)**

- Complete agent hooks implementation (2 weeks)
- Build execution history viewer (1 week)
- Implement PBT test generation (2 weeks)
- Add steering files system (1 week)

**Phase 2: Enhanced UX (2-3 weeks)**

- Add chat streaming and progress indicators (1 week)
- Implement task dependencies (1 week)
- Create settings UI (1 week)

**Phase 3: Advanced Features (3-4 weeks)**

- Add multimodal input support (1 week)
- Build spec templates system (1 week)
- Implement external integrations (2 weeks)

**Total Estimated Effort:** 9-13 weeks for full Kiro parity

### Recommended Next Steps

1. **Immediate:** Complete agent hooks implementation (spec exists, just needs coding)
2. **Next:** Design and implement execution history viewer
3. **Then:** Add PBT test generation to close the correctness loop
4. **Finally:** Polish UX with streaming chat and steering files

This prioritization focuses on achieving functional parity with Kiro's core autonomous execution capabilities before adding convenience features.
