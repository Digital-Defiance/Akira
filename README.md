# Akira

A Visual Studio Code extension that brings spec-driven development to GitHub Copilot Chat. Akira guides developers through a structured workflow of Requirements → Design → Tasks → Execution, using the Model Context Protocol (MCP) for persistent context and the Easy Approach to Requirements Syntax (EARS) for high-quality specifications.

Akira is currently very much in Beta and a work in progress. Any fellow developers are welcome to contribute.

## Screenshots

### Sidebar - Spec Tree View

![Akira Sidebar showing spec hierarchy](./images/01-sidebar-specs-tree.png)
_The Akira sidebar displays all your specs with phase indicators and progress tracking_

### Requirements Document with EARS Validation

![Requirements document with EARS patterns](./images/04-requirements-document.png)
_Requirements follow EARS patterns and are validated against INCOSE quality rules_

### Design with Correctness Properties

![Design document with correctness properties](./images/05-design-document.png)
_Design documents include correctness properties for property-based testing_

### Tasks with Executable CodeLens

![Tasks document with CodeLens](./images/06-tasks-codelens.png)
_Tasks can be executed directly from the document using CodeLens_

### Copilot Chat Integration

![Copilot Chat with @spec participant](./images/08-chat-participant.png)
_Use the @spec participant in Copilot Chat for all spec operations_

## Features

### Structured Spec-Driven Workflow

- **Requirements Phase**: Generate requirements following EARS patterns and INCOSE quality rules
- **Design Phase**: Create comprehensive technical designs with correctness properties
- **Tasks Phase**: Generate actionable implementation plans with proper task hierarchy
- **Execution Phase**: Execute tasks with full context from requirements and design
- **Adaptive Reflection**: Automatically retry failed tasks with failure-aware re-planning (up to 3 iterations)

### Advanced Requirements Engineering

- **EARS Compliance**: All requirements follow one of six EARS patterns (ubiquitous, event-driven, state-driven, unwanted-event, optional, complex)
- **INCOSE Quality Rules**: Automatic validation against semantic quality standards
- **Glossary Management**: Automatic extraction and definition of technical terms
- **User Story Structure**: Consistent format with 2-5 acceptance criteria per requirement

### Property-Based Testing Integration

- **Correctness Properties**: Generate testable properties from acceptance criteria
- **Universal Quantification**: Properties formatted with explicit "For any" statements
- **Round-Trip Properties**: Automatic detection for parsing/serialization requirements
- **Test Library Integration**: Support for fast-check and other PBT libraries

### Model Context Protocol (MCP) Integration

- **Persistent Context**: Spec documents remain accessible across chat sessions
- **Structured Tools**: Programmatic access to spec operations via MCP tools
- **State Management**: Track workflow progress and task completion
- **File Operations**: Read, write, and update spec documents through MCP

### Adaptive Execution with Reflection Loop

- **Iterative Re-planning**: Automatically retry failed tasks with adjusted strategies (up to 3 iterations)
- **Failure Context**: LLM receives detailed failure information to avoid repeating mistakes
- **Pattern Detection**: Identifies repeated errors and escalates to user when needed
- **Smart Retry**: Distinguishes transient errors (network issues) from strategic failures (wrong approach)
- **Full Observability**: All reflection activity logged to session history

### Visual Progress Tracking

- **Sidebar Integration**: Tree view showing all specs with phase indicators
- **Task Progress**: Real-time completion percentage tracking
- **Status Bar**: Current spec and phase display
- **Approval Workflow**: Visual indicators for phase approvals

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Akira"
4. Click Install

## Usage

In Copilot Chat, use the `@spec` participant for all spec operations:

### Creating Specs

```
@spec create user-authentication
```

Creates a new spec with initial requirements generation.

### Managing Specs

```
@spec list                    # List all specs with status
@spec status feature-name     # Check detailed spec status
@spec update feature-name     # Update existing spec
```

### Executing Tasks

```
@spec execute task-1.2        # Execute specific task
@spec execute feature-name    # Continue workflow execution
```

### Workflow Commands

```
@spec approve requirements feature-name    # Approve requirements phase
@spec approve design feature-name         # Approve design phase
@spec approve tasks feature-name          # Approve tasks phase
```

## Workflow Phases

### 1. Requirements Phase

- Generate user stories with acceptance criteria
- Validate all requirements against EARS patterns
- Check compliance with INCOSE quality rules
- Extract and define glossary terms
- Require explicit approval before proceeding

### 2. Design Phase

- Create comprehensive technical design
- Generate correctness properties from acceptance criteria
- Include architecture, components, and data models
- Specify error handling and testing strategy
- Require explicit approval before proceeding

### 3. Tasks Phase

- Generate actionable implementation tasks
- Maintain maximum 2-level hierarchy (1, 1.1, 1.2)
- Mark test-related tasks as optional with asterisk
- Include checkpoint tasks for validation
- Require explicit approval before proceeding

### 4. Execution Phase

- Execute tasks with full context loading
- Track task completion and status
- Skip optional tasks unless explicitly requested
- Update task status while preserving formatting

## Spec Directory Structure

```
.kiro/
  specs/
    feature-name/
      requirements.md    # EARS-compliant requirements
      design.md         # Technical design with properties
      tasks.md          # Actionable task list
      .state.json       # Workflow state and progress
```

## Configuration

Configure Akira through VS Code settings:

- **Spec Directory**: Custom location for spec files (default: `.kiro/specs`)
- **Strict Mode**: Require completion of all tasks including optional ones
- **Property Test Iterations**: Number of iterations for property-based tests (default: 100)
- **Auto-Approval**: Skip manual approval steps (not recommended)

## Requirements

- VS Code 1.85.0 or higher
- GitHub Copilot extension
- Node.js 18 or higher (for development)

## EARS Patterns Supported

1. **Ubiquitous**: "The system shall..."
2. **Event-driven**: "WHEN [trigger] THEN the system SHALL [response]"
3. **State-driven**: "WHILE [state] the system SHALL [behavior]"
4. **Unwanted-event**: "IF [unwanted condition] THEN the system SHALL [response]"
5. **Optional**: "WHERE [feature enabled] the system SHALL [behavior]"
6. **Complex**: Combinations of the above patterns

## Property-Based Testing

Akira generates correctness properties that can be implemented with property-based testing libraries:

- **JavaScript/TypeScript**: fast-check
- **Python**: Hypothesis
- **Java**: jqwik
- **C#**: FsCheck
- **Haskell**: QuickCheck

Each property includes:

- Universal quantification ("For any X, Y should Z")
- Reference to validated requirements
- Minimum 100 test iterations
- Automatic shrinking on failure

## Examples

### Example Requirement (EARS Event-Driven)

```markdown
**User Story:** As a user, I want to log into the system securely.

#### Acceptance Criteria

1. WHEN a user enters valid credentials THEN the system SHALL authenticate the user within 2 seconds
2. WHEN a user enters invalid credentials THEN the system SHALL display an error message
3. WHERE two-factor authentication is enabled THEN the system SHALL require a second factor
```

### Example Correctness Property

```markdown
**Property 1: Authentication response time**
_For any_ valid credential pair (username, password), the authentication process should complete within 2000 milliseconds.
**Validates: Requirements 1.1**
```

### Example Task

```markdown
- [ ] 1. Implement user authentication
  - [ ] 1.1 Create authentication service
  - [ ] 1.2 Add credential validation
  - [ ] 1.3 Write unit tests for auth service\*
  - [ ] 1.4 Write property tests for response time\*
- [ ] 2. Checkpoint - Ensure all tests pass
```

## Development

To contribute to Akira:

1. Clone this repository
2. Run `yarn install`
3. Press F5 to launch in debug mode

### Build

```bash
yarn build
```

### Test

```bash
yarn test              # Run unit tests
yarn test:property     # Run property-based tests
yarn test:integration  # Run integration tests
```

### Architecture

Akira consists of:

- **Chat Participant**: Handles @spec commands in Copilot Chat
- **MCP Server**: Provides persistent context and spec tools
- **Requirements Generator**: Creates EARS-compliant requirements
- **Design Generator**: Creates technical designs with correctness properties
- **Task Generator**: Creates actionable implementation plans
- **UI Components**: Visual progress tracking and status display

## License

MIT
