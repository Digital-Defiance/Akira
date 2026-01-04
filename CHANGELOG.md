# Changelog

All notable changes to the Akira extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-20

### Added

#### Core Workflow

- Structured spec-driven development workflow: Requirements → Design → Tasks → Execution
- Explicit approval gates between workflow phases
- Workflow state persistence with `.state.json` files
- Phase tracking and progress indicators

#### Requirements Engineering

- EARS (Easy Approach to Requirements Syntax) pattern validation
  - Support for all six EARS patterns: ubiquitous, event-driven, state-driven, unwanted-event, optional, and complex
- INCOSE semantic quality rules validation
  - Active voice enforcement
  - Vague term detection
  - Escape clause prevention
  - Negative statement detection
  - Single thought per requirement validation
- Automatic glossary term extraction and definition
- User story structure with 2-5 acceptance criteria per requirement
- Requirements validation tool accessible via MCP

#### Design Generation

- Comprehensive design document generation with required sections:
  - Overview
  - Architecture
  - Components and Interfaces
  - Data Models
  - Correctness Properties
  - Error Handling
  - Testing Strategy
- Acceptance criteria testability analysis (prework)
- Correctness property generation with universal quantification
- Property reflection to eliminate redundant properties
- Automatic round-trip property detection for parsing/serialization
- Property-based testing library selection for target language

#### Task Management

- Actionable task list generation from design documents
- Two-level task hierarchy enforcement (e.g., 1, 1.1, 1.2)
- Optional task marking with asterisk suffix for test-related tasks
- Checkpoint task insertion for test validation
- Task status tracking and updates
- Subtask completion order enforcement
- Optional task skipping by default

#### Model Context Protocol (MCP) Integration

- MCP server implementation for persistent context
- Spec management tools:
  - `create_spec`: Create new specs with requirements generation
  - `read_spec`: Read requirements, design, or tasks documents
  - `update_spec`: Update spec documents with formatting preservation
  - `list_specs`: List all specs with current phase
  - `validate_requirements`: Validate EARS and INCOSE compliance
  - `update_task_status`: Update task completion status
- Context loading for task execution (requirements, design, tasks)
- State management through MCP tools

#### Chat Participant Integration

- `@spec` chat participant for Copilot Chat
- Natural language command parsing and routing
- Commands supported:
  - `create`: Create new spec
  - `list`: List all specs
  - `status`: Show spec status
  - `update`: Update existing spec
  - `execute`: Execute tasks
  - `approve`: Approve workflow phases
  - `validate`: Validate requirements
- Formatted response display in chat interface
- Helpful error messages with suggested corrections

#### Visual UI Components

- Spec tree view in VS Code sidebar
- Phase indicators (requirements, design, tasks, execution)
- Task completion percentage calculation
- Status bar integration showing current spec and phase
- Visual checkmarks for completed phases
- Refresh and create spec commands in tree view

#### Configuration

- Customizable spec directory location
- Strict mode for requiring all optional tasks
- Configurable property test iteration count
- Auto-approval option (not recommended)
- Hot-reload support for configuration changes

#### Property-Based Testing Support

- Property test tagging with design document references
- Format: `**Feature: {name}, Property {N}: {text}**`
- Minimum 100 iterations per property test
- Failure example capture from PBT libraries
- Requirements validation tracking on test success
- Integration with fast-check for TypeScript/JavaScript

#### Error Handling

- Comprehensive error categorization:
  - File system errors
  - Validation errors
  - MCP communication errors
  - Workflow state errors
  - User input errors
- Context-aware error recovery suggestions
- Graceful degradation with clear error messages
- Retry logic with exponential backoff for MCP operations

#### Testing Infrastructure

- Unit test suite with Vitest
- Property-based test suite with fast-check
- 31 correctness properties with corresponding property tests
- Test coverage for all major components:
  - MCP server and tools
  - Requirements generation and validation
  - Design generation and property creation
  - Task generation and execution
  - Chat participant and command parsing
  - UI components and progress tracking
  - Configuration management
  - Error handling

### Technical Details

- Built with TypeScript
- VS Code Extension API integration
- Model Context Protocol (MCP) SDK
- Vitest for unit testing
- fast-check for property-based testing
- esbuild for bundling

### Requirements

- VS Code 1.85.0 or higher
- GitHub Copilot extension
- Node.js 18 or higher (for development)

## [Unreleased]

### Planned Features

- Multi-language support for property-based testing libraries
- Template system for custom requirement patterns
- Export specs to various formats (PDF, HTML, Markdown)
- Collaboration features for team spec reviews
- Integration with issue tracking systems
- Spec versioning and history tracking
- Advanced property reflection with automated redundancy detection
- Machine learning-based requirement quality suggestions

---

[0.1.0]: https://github.com/digital-defiance/akira/releases/tag/v0.1.0
