# Design Document: Copilot Spec Extension

## Overview

The Copilot Spec Extension brings spec-driven development to GitHub Copilot Chat in VS Code. The extension implements a structured workflow that guides developers through requirements gathering, design creation, and task planning using the Model Context Protocol (MCP) for persistent context management.

The extension consists of three main components:

1. A VS Code extension that integrates with Copilot Chat via the Chat Participant API
2. An MCP server that provides spec management tools and persistent context
3. A UI layer that displays workflow progress and task status

The workflow follows a linear progression: Requirements → Design → Tasks → Execution. Each phase requires explicit user approval before proceeding to the next, ensuring the developer maintains control over the specification process.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code                               │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │  Copilot Chat    │◄────────┤  Extension Host         │  │
│  │  (User Interface)│         │  - Chat Participant     │  │
│  └──────────────────┘         │  - Command Handlers     │  │
│                                │  - UI Components        │  │
│                                └───────────┬─────────────┘  │
│                                            │                 │
│                                            │ MCP Protocol    │
│                                            ▼                 │
│                                ┌───────────────────────┐    │
│                                │   MCP Server          │    │
│                                │   - Spec Tools        │    │
│                                │   - File Operations   │    │
│                                │   - State Management  │    │
│                                └───────────┬───────────┘    │
└────────────────────────────────────────────┼────────────────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │  File System   │
                                    │  .kiro/specs/  │
                                    └────────────────┘
```

### Component Interaction Flow

1. User sends command to Copilot Chat with @spec participant
2. Chat Participant parses command and determines intent
3. Extension invokes appropriate MCP tool via MCP client
4. MCP Server executes tool logic (read/write specs, validate requirements, etc.)
5. MCP Server returns structured result
6. Extension formats result and displays in Copilot Chat
7. UI components update to reflect new workflow state

### Technology Stack

- **Extension Framework**: VS Code Extension API
- **Language**: TypeScript
- **MCP Implementation**: @modelcontextprotocol/sdk
- **Chat Integration**: VS Code Chat Participant API
- **Testing**: Vitest for unit tests, fast-check for property-based testing
- **Build Tool**: esbuild or webpack for bundling

## Components and Interfaces

### 1. Chat Participant Component

The Chat Participant handles all interactions with Copilot Chat.

```typescript
interface ChatParticipant {
  id: string; // "@spec"
  handler: ChatRequestHandler;

  // Parse user intent from chat messages
  parseCommand(message: string): SpecCommand;

  // Format responses for chat display
  formatResponse(result: SpecOperationResult): ChatResponse;

  // Handle streaming responses for long operations
  streamProgress(progress: ProgressUpdate): void;
}

interface SpecCommand {
  action: "create" | "update" | "execute" | "list" | "status";
  featureName?: string;
  phase?: "requirements" | "design" | "tasks";
  taskId?: string;
  parameters?: Record<string, any>;
}
```

### 2. MCP Server Component

The MCP Server provides tools for spec operations.

```typescript
interface SpecMCPServer {
  // Tool registration
  registerTools(): void;

  // Core spec operations
  tools: {
    createSpec(featureName: string): SpecCreationResult;
    readSpec(featureName: string, phase: Phase): SpecDocument;
    updateSpec(
      featureName: string,
      phase: Phase,
      content: string
    ): UpdateResult;
    listSpecs(): SpecSummary[];
    validateRequirements(content: string): ValidationResult;
    analyzeAcceptanceCriteria(criteria: AcceptanceCriterion[]): PreworkAnalysis;
    updateTaskStatus(
      featureName: string,
      taskId: string,
      status: TaskStatus
    ): void;
  };
}

interface SpecCreationResult {
  success: boolean;
  featureName: string;
  directory: string;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  requirementId: string;
  rule: "EARS" | "INCOSE";
  message: string;
  suggestion?: string;
}
```

### 3. Workflow State Manager

Manages the current state of each spec workflow.

```typescript
interface WorkflowStateManager {
  // Get current phase for a spec
  getCurrentPhase(featureName: string): Phase;

  // Check if phase is approved
  isPhaseApproved(featureName: string, phase: Phase): boolean;

  // Mark phase as approved
  approvePhase(featureName: string, phase: Phase): void;

  // Get task completion status
  getTaskProgress(featureName: string): TaskProgress;
}

interface TaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  optional: number;
  percentage: number;
}

type Phase = "requirements" | "design" | "tasks" | "execution";
```

### 4. Requirements Generator

Generates and validates requirements documents.

```typescript
interface RequirementsGenerator {
  // Generate initial requirements from feature idea
  generateRequirements(featureIdea: string): RequirementsDocument;

  // Validate requirements against EARS and INCOSE
  validateRequirements(doc: RequirementsDocument): ValidationResult;

  // Extract and define glossary terms
  extractGlossaryTerms(requirements: Requirement[]): GlossaryEntry[];
}

interface RequirementsDocument {
  introduction: string;
  glossary: GlossaryEntry[];
  requirements: Requirement[];
}

interface Requirement {
  id: string; // e.g., "1", "2"
  userStory: UserStory;
  acceptanceCriteria: AcceptanceCriterion[];
}

interface AcceptanceCriterion {
  id: string; // e.g., "1.1", "1.2"
  text: string;
  pattern: EARSPattern;
}

type EARSPattern =
  | "ubiquitous"
  | "event-driven"
  | "state-driven"
  | "unwanted-event"
  | "optional"
  | "complex";
```

### 5. Design Generator

Creates design documents with correctness properties.

```typescript
interface DesignGenerator {
  // Generate design from requirements
  generateDesign(requirements: RequirementsDocument): DesignDocument;

  // Analyze acceptance criteria for testability
  analyzeTestability(criteria: AcceptanceCriterion[]): PreworkAnalysis;

  // Generate correctness properties
  generateProperties(analysis: PreworkAnalysis): CorrectnessProperty[];

  // Perform property reflection to eliminate redundancy
  reflectProperties(properties: CorrectnessProperty[]): CorrectnessProperty[];
}

interface DesignDocument {
  overview: string;
  architecture: string;
  components: ComponentDescription[];
  dataModels: DataModel[];
  correctnessProperties: CorrectnessProperty[];
  errorHandling: string;
  testingStrategy: TestingStrategy;
}

interface PreworkAnalysis {
  criterionId: string;
  thoughts: string;
  testable: "yes-property" | "yes-example" | "edge-case" | "no";
}

interface CorrectnessProperty {
  id: string; // e.g., "Property 1"
  description: string; // "For any X, Y should Z"
  validatesRequirements: string[]; // e.g., ["1.1", "1.2"]
}
```

### 6. Task Generator

Creates actionable task lists from design documents.

```typescript
interface TaskGenerator {
  // Generate tasks from design
  generateTasks(
    design: DesignDocument,
    requirements: RequirementsDocument
  ): TaskDocument;

  // Mark test tasks as optional
  markOptionalTasks(tasks: Task[]): Task[];

  // Insert checkpoint tasks
  insertCheckpoints(tasks: Task[]): Task[];
}

interface TaskDocument {
  tasks: Task[];
}

interface Task {
  id: string; // e.g., "1", "1.1", "1.2"
  description: string;
  optional: boolean;
  completed: boolean;
  subtasks: Task[];
  requirementRefs: string[];
  propertyRef?: string; // For property test tasks
}
```

### 7. UI Components

Visual indicators for workflow progress.

```typescript
interface SpecTreeProvider {
  // Provide tree view of all specs
  getTreeItems(): SpecTreeItem[];

  // Refresh view when specs change
  refresh(): void;
}

interface SpecTreeItem {
  featureName: string;
  phase: Phase;
  progress: TaskProgress;
  approved: boolean;
}

interface StatusBarManager {
  // Update status bar with current spec info
  updateStatus(featureName: string, phase: Phase): void;

  // Show progress indicator
  showProgress(message: string): void;
}
```

## Data Models

### Spec Directory Structure

```
.kiro/
  specs/
    {feature-name}/
      requirements.md
      design.md
      tasks.md
      .state.json          # Workflow state (phase, approvals)
```

### State File Format

```typescript
interface SpecState {
  featureName: string;
  currentPhase: Phase;
  approvals: {
    requirements: boolean;
    design: boolean;
    tasks: boolean;
  };
  taskStatuses: Record<string, TaskStatus>;
  createdAt: string;
  updatedAt: string;
}

type TaskStatus = "not-started" | "in-progress" | "completed" | "skipped";
```

### MCP Tool Schemas

Each MCP tool has a defined input/output schema:

```typescript
// Example: create_spec tool
interface CreateSpecInput {
  featureName: string;
  featureIdea: string;
}

interface CreateSpecOutput {
  success: boolean;
  directory: string;
  requirementsPath: string;
  message: string;
}

// Example: validate_requirements tool
interface ValidateRequirementsInput {
  content: string;
}

interface ValidateRequirementsOutput {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}
```

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property Reflection

After analyzing all acceptance criteria, several redundant properties were identified:

- Properties 3.1 and 3.2 both verify design document sections (consolidated into Property 3)
- Properties 3.4 and 4.3 both check property formatting (consolidated into Property 4)
- Properties 2.1, 2.2, and 8.5 all validate requirements (consolidated into Property 2)

The following properties represent the unique, non-redundant correctness guarantees:

**Property 1: Spec directory creation**
_For any_ spec creation command with a feature name, executing the command should result in a directory at `.kiro/specs/{kebab-case-name}` containing a `requirements.md` file.
**Validates: Requirements 1.1, 1.3, 1.5**

**Property 2: Requirements validation**
_For any_ generated requirements document, every requirement should follow one of the six EARS patterns and comply with all INCOSE semantic quality rules (active voice, no vague terms, no escape clauses, no negatives, one thought per requirement, explicit conditions, consistent terminology, no pronouns, no absolutes, solution-free, realistic tolerances).
**Validates: Requirements 1.2, 2.1, 2.2, 8.5**

**Property 3: Glossary term extraction**
_For any_ requirements document containing technical terms, all undefined terms should appear in the Glossary section with definitions.
**Validates: Requirements 2.3**

**Property 4: User story structure**
_For any_ generated requirements document, each requirement should have exactly one user story and between 2 and 5 acceptance criteria.
**Validates: Requirements 2.4**

**Property 5: Design document completeness**
_For any_ generated design document, it should contain all required sections: Overview, Architecture, Components and Interfaces, Data Models, Correctness Properties, Error Handling, and Testing Strategy.
**Validates: Requirements 3.1, 3.2**

**Property 6: Acceptance criteria analysis**
_For any_ set of acceptance criteria, the prework analysis should categorize each criterion as exactly one of: property, example, edge-case, or not testable.
**Validates: Requirements 3.3, 4.1**

**Property 7: Property formatting**
_For any_ correctness property in the design document, it should contain explicit universal quantification (starting with "For any" or "For all") and reference the specific requirements it validates using the format "**Validates: Requirements X.Y**".
**Validates: Requirements 3.4, 4.2, 4.3**

**Property 8: Round-trip properties for parsing**
_For any_ requirements that mention parsing, serialization, encoding, or decoding, the design document should include at least one round-trip correctness property.
**Validates: Requirements 4.5**

**Property 9: Task hierarchy constraint**
_For any_ generated tasks document, no task should have more than two levels of hierarchy (e.g., task IDs should match pattern `\d+` or `\d+\.\d+` but not `\d+\.\d+\.\d+`).
**Validates: Requirements 5.1, 5.2**

**Property 10: Optional task marking**
_For any_ generated tasks document, all test-related sub-tasks (unit tests, property tests, integration tests) should be marked as optional with an asterisk suffix in their checkbox.
**Validates: Requirements 5.3**

**Property 11: Checkpoint task inclusion**
_For any_ generated tasks document, it should contain at least one checkpoint task with the description "Ensure all tests pass, ask the user if questions arise."
**Validates: Requirements 5.4**

**Property 12: Context loading for task execution**
_For any_ task execution request, the system should load all three spec documents (requirements.md, design.md, tasks.md) into context before beginning execution.
**Validates: Requirements 6.1**

**Property 13: Subtask completion order**
_For any_ task with subtasks, the parent task should not be marked as completed until all non-optional subtasks are marked as completed.
**Validates: Requirements 6.3**

**Property 14: Task status updates**
_For any_ completed task, the tasks.md file should be updated to reflect the new status while preserving the document's formatting and structure.
**Validates: Requirements 6.4, 8.4**

**Property 15: Optional task skipping**
_For any_ task marked as optional (with asterisk suffix), it should be skipped during execution unless explicitly requested by the user.
**Validates: Requirements 6.5**

**Property 16: MCP tool provision**
_For any_ request for spec context from Copilot Chat, the MCP server should provide the requested documents via the appropriate MCP tools.
**Validates: Requirements 7.2, 7.4, 7.5**

**Property 17: State persistence**
_For any_ workflow state change (phase transition, task completion, approval), the .state.json file should be updated to reflect the new state.
**Validates: Requirements 7.3**

**Property 18: MCP tool execution**
_For any_ MCP tool invocation, the tool should execute the operation and return a result that conforms to its defined output schema.
**Validates: Requirements 8.2**

**Property 19: Spec listing completeness**
_For any_ workspace containing N specs, the list_specs tool should return exactly N spec summaries, each with the correct feature name and current phase.
**Validates: Requirements 8.3**

**Property 20: Task completion percentage calculation**
_For any_ tasks document, the completion percentage should equal (completed tasks / total non-optional tasks) × 100.
**Validates: Requirements 9.3**

**Property 21: Custom directory configuration**
_For any_ custom spec directory configured in settings, all spec operations should use that directory instead of the default `.kiro/specs`.
**Validates: Requirements 10.2**

**Property 22: Strict mode enforcement**
_For any_ workflow with strict mode enabled, all tasks (including those normally marked optional) should be required for completion.
**Validates: Requirements 10.3**

**Property 23: Configuration hot-reload**
_For any_ configuration change, the new settings should take effect immediately without requiring extension restart.
**Validates: Requirements 10.4, 10.5**

**Property 24: Command parsing and routing**
_For any_ valid spec command sent to the @spec participant, the command should be parsed correctly and routed to the appropriate MCP tool.
**Validates: Requirements 11.2, 11.3**

**Property 25: Response formatting**
_For any_ MCP tool result, the response displayed in Copilot Chat should be formatted with clear structure and readable content.
**Validates: Requirements 11.4**

**Property 26: Error message helpfulness**
_For any_ error that occurs during spec operations, the error message should include a description of what went wrong and at least one suggested correction.
**Validates: Requirements 11.5**

**Property 27: Testing strategy library specification**
_For any_ generated design document, the Testing Strategy section should explicitly name a property-based testing library appropriate for the target language.
**Validates: Requirements 12.1**

**Property 28: Property test iteration configuration**
_For any_ property test task in the tasks document, the task description or details should specify running at least 100 iterations.
**Validates: Requirements 12.2**

**Property 29: Property test tagging**
_For any_ implemented property-based test, the test code should include a comment tag referencing the specific correctness property from the design document using the format "**Feature: {feature_name}, Property {number}: {property_text}**".
**Validates: Requirements 12.3**

**Property 30: Failure example capture**
_For any_ property-based test that fails, the system should capture the failing example provided by the PBT library and update the task status with this information.
**Validates: Requirements 12.4**

**Property 31: Requirements validation on test success**
_For any_ correctness property where all associated property-based tests pass, the corresponding requirements should be marked as validated.
**Validates: Requirements 12.5**

## Error Handling

### Error Categories

1. **File System Errors**

   - Missing spec directories
   - Permission issues
   - Corrupted spec files
   - Strategy: Graceful degradation with clear error messages and recovery suggestions

2. **Validation Errors**

   - Requirements not following EARS patterns
   - INCOSE rule violations
   - Invalid task hierarchy
   - Strategy: Provide specific error location and correction suggestions

3. **MCP Communication Errors**

   - Server initialization failures
   - Tool invocation timeouts
   - Schema validation failures
   - Strategy: Retry with exponential backoff, fallback to direct file operations

4. **Workflow State Errors**

   - Attempting to skip phases
   - Missing approvals
   - Corrupted state files
   - Strategy: Enforce workflow constraints, offer state reset option

5. **User Input Errors**
   - Invalid commands
   - Missing required parameters
   - Malformed feature names
   - Strategy: Parse errors with helpful suggestions, show command examples

### Error Recovery Patterns

```typescript
interface ErrorHandler {
  // Handle errors with context-aware recovery
  handleError(error: Error, context: OperationContext): ErrorResponse;

  // Suggest recovery actions
  suggestRecovery(error: Error): RecoveryAction[];

  // Log errors for debugging
  logError(error: Error, context: OperationContext): void;
}

interface ErrorResponse {
  message: string;
  suggestions: string[];
  recoverable: boolean;
  retryable: boolean;
}

interface RecoveryAction {
  description: string;
  command?: string;
  automatic: boolean;
}
```

### Specific Error Handling

- **Spec Already Exists**: Offer to update existing spec or create with different name
- **Invalid EARS Pattern**: Show the problematic requirement and suggest correct pattern
- **Missing Approval**: Explain workflow phase requirements and prompt for approval
- **MCP Server Down**: Attempt restart, fallback to direct file operations if restart fails
- **Task Execution Failure**: Capture error details, suggest debugging steps, allow retry

## Testing Strategy

### Unit Testing

Unit tests will verify specific behaviors and edge cases using Vitest:

- **Component Tests**: Test individual components (ChatParticipant, RequirementsGenerator, etc.) in isolation
- **Integration Tests**: Test interactions between components (e.g., ChatParticipant → MCP Server → File System)
- **Edge Cases**: Test boundary conditions (empty inputs, maximum hierarchy depth, special characters in names)
- **Error Conditions**: Test error handling paths (missing files, invalid formats, permission errors)

Example unit test structure:

```typescript
describe("RequirementsGenerator", () => {
  it("should generate requirements with EARS patterns", () => {
    const generator = new RequirementsGenerator();
    const result = generator.generateRequirements("user authentication");
    expect(
      result.requirements.every((r) =>
        r.acceptanceCriteria.every((c) => isValidEARSPattern(c.text))
      )
    ).toBe(true);
  });

  it("should handle empty feature ideas", () => {
    const generator = new RequirementsGenerator();
    expect(() => generator.generateRequirements("")).toThrow();
  });
});
```

### Property-Based Testing

Property-based tests will verify universal properties using fast-check:

- **Library**: fast-check (TypeScript/JavaScript property-based testing library)
- **Iterations**: Minimum 100 iterations per property test
- **Generators**: Custom generators for feature names, requirements, tasks, etc.
- **Shrinking**: Leverage fast-check's automatic shrinking to find minimal failing examples

Each property test must:

1. Be tagged with a comment referencing the design document property
2. Use the format: `// **Feature: copilot-spec-extension, Property {N}: {description}**`
3. Run at least 100 iterations
4. Test the universal property across randomly generated inputs

Example property test structure:

```typescript
import fc from "fast-check";

describe("Property Tests", () => {
  it("Property 1: Spec directory creation", () => {
    // **Feature: copilot-spec-extension, Property 1: Spec directory creation**
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        (featureName) => {
          const result = createSpec(featureName);
          const expectedPath = `.kiro/specs/${toKebabCase(featureName)}`;
          expect(fs.existsSync(expectedPath)).toBe(true);
          expect(fs.existsSync(`${expectedPath}/requirements.md`)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 2: Requirements validation", () => {
    // **Feature: copilot-spec-extension, Property 2: Requirements validation**
    fc.assert(
      fc.property(arbitraryFeatureIdea(), (featureIdea) => {
        const doc = generateRequirements(featureIdea);
        const validation = validateRequirements(doc);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Goals

- **Unit Test Coverage**: Minimum 80% code coverage
- **Property Test Coverage**: All 31 correctness properties must have corresponding property tests
- **Integration Test Coverage**: All major workflows (create spec, execute task, etc.)
- **Edge Case Coverage**: All identified edge cases from requirements

### Testing Workflow

1. **Development**: Write implementation code first
2. **Unit Tests**: Write unit tests for specific behaviors
3. **Property Tests**: Write property tests for universal properties
4. **Validation**: Run all tests, ensure they pass
5. **Iteration**: Fix failures, refine tests as needed

### Continuous Testing

- Run unit tests on every file save
- Run full test suite (including property tests) before commits
- Run extended property tests (1000+ iterations) in CI/CD pipeline
- Track property test failures and shrunk examples for debugging
