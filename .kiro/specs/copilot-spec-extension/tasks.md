# Implementation Plan

- [x] 1. Set up project structure and dependencies

  - Initialize VS Code extension project with TypeScript
  - Install dependencies: @modelcontextprotocol/sdk, @vscode/chat-participant, fast-check, vitest
  - Configure build tooling (esbuild/webpack) and TypeScript compiler
  - Set up test framework configuration
  - _Requirements: 7.1, 8.1, 11.1_

- [x] 2. Implement MCP Server core infrastructure

  - [x] 2.1 Create MCP server initialization and tool registration

    - Implement SpecMCPServer class with tool registration
    - Define tool schemas for all spec operations
    - Set up server lifecycle management (start, stop, restart)
    - _Requirements: 7.1, 8.1_

  - [x] 2.2 Write property test for MCP server initialization

    - **Property 16: MCP tool provision**
    - **Validates: Requirements 7.2, 7.4, 7.5**

  - [x] 2.3 Write unit tests for MCP server

    - Test server initialization
    - Test tool registration
    - Test server lifecycle
    - _Requirements: 7.1, 8.1_

- [x] 3. Implement file system operations and state management

  - [x] 3.1 Create spec directory management utilities

    - Implement createSpecDirectory function with kebab-case naming
    - Implement spec existence checking
    - Implement spec listing functionality
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 3.2 Write property test for spec directory creation

    - **Property 1: Spec directory creation**
    - **Validates: Requirements 1.1, 1.3, 1.5**

  - [x] 3.3 Implement workflow state management

    - Create SpecState interface and .state.json handling
    - Implement state read/write operations
    - Implement phase tracking and approval management
    - _Requirements: 7.3_

  - [x] 3.4 Write property test for state persistence

    - **Property 17: State persistence**
    - **Validates: Requirements 7.3**

  - [x] 3.5 Write unit tests for file operations

    - Test directory creation with various feature names

    - Test state file read/write
    - Test error handling for file system errors
    - _Requirements: 1.1, 1.3, 1.5, 7.3_

- [x] 4. Implement requirements generation and validation

  - [x] 4.1 Create EARS pattern validator

    - Implement pattern matching for all six EARS patterns
    - Create validation functions for each pattern type
    - _Requirements: 1.2, 2.1_

  - [x] 4.2 Create INCOSE quality rules validator

    - Implement checks for active voice, vague terms, escape clauses, etc.
    - Create validation error messages with suggestions
    - _Requirements: 1.2, 2.2_

  - [x] 4.3 Write property test for requirements validation

    - **Property 2: Requirements validation**
    - **Validates: Requirements 1.2, 2.1, 2.2, 8.5**

  - [x] 4.4 Implement requirements generator

    - Create RequirementsGenerator class
    - Implement feature idea to requirements conversion
    - Implement glossary term extraction
    - Implement user story and acceptance criteria generation
    - _Requirements: 1.2, 2.3, 2.4_

  - [x] 4.5 Write property test for glossary term extraction

    - **Property 3: Glossary term extraction**
    - **Validates: Requirements 2.3**

  - [x] 4.6 Write property test for user story structure

    - **Property 4: User story structure**
    - **Validates: Requirements 2.4**

  - [x] 4.7 Write unit tests for requirements generation

    - Test EARS pattern validation with specific examples
    - Test INCOSE rule violations
    - Test glossary extraction
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4_

- [x] 5. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [-] 6. Implement design document generation

  - [x] 6.1 Create design document generator

    - Implement DesignGenerator class
    - Generate Overview, Architecture, Components, Data Models sections
    - Implement section completeness validation
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Write property test for design document completeness

    - **Property 5: Design document completeness**
    - **Validates: Requirements 3.1, 3.2**

  - [x] 6.3 Implement acceptance criteria analyzer (prework)

    - Create testability analysis logic
    - Categorize criteria as property/example/edge-case/not-testable
    - _Requirements: 3.3, 4.1_

  - [x] 6.4 Write property test for acceptance criteria analysis

    - **Property 6: Acceptance criteria analysis**
    - **Validates: Requirements 3.3, 4.1**

  - [x] 6.5 Implement correctness property generator

    - Generate properties from prework analysis
    - Format properties with "For any" quantification
    - Add requirement references
    - Implement property reflection to eliminate redundancy
    - _Requirements: 3.4, 4.2, 4.3, 4.4_

  - [x] 6.6 Write property test for property formatting

    - **Property 7: Property formatting**
    - **Validates: Requirements 3.4, 4.2, 4.3**

  - [x] 6.7 Write property test for round-trip properties

    - **Property 8: Round-trip properties for parsing**
    - **Validates: Requirements 4.5**

  - [x] 6.8 Implement Error Handling and Testing Strategy sections

    - Generate error handling patterns
    - Generate testing strategy with PBT library selection
    - _Requirements: 12.1_

  - [x] 6.9 Write property test for testing strategy library specification

    - **Property 27: Testing strategy library specification**
    - **Validates: Requirements 12.1**

  - [x] 6.10 Write unit tests for design generation

    - Test section generation
    - Test property formatting
    - Test round-trip property detection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.5_

- [-] 7. Implement task list generation

  - [ ] 7.1 Create task generator

    - Implement TaskGenerator class
    - Generate tasks from design and requirements
    - Implement task hierarchy validation (max 2 levels)
    - _Requirements: 5.1, 5.2_

  - [ ] 7.2 Write property test for task hierarchy constraint

    - **Property 9: Task hierarchy constraint**
    - **Validates: Requirements 5.1, 5.2**

  - [ ] 7.3 Implement optional task marking

    - Mark test-related subtasks with asterisk
    - Implement test task detection logic
    - _Requirements: 5.3_

  - [ ] 7.4 Write property test for optional task marking

    - **Property 10: Optional task marking**
    - **Validates: Requirements 5.3**

  - [ ] 7.5 Implement checkpoint task insertion

    - Add checkpoint tasks at appropriate intervals
    - _Requirements: 5.4_

  - [ ] 7.6 Write property test for checkpoint task inclusion

    - **Property 11: Checkpoint task inclusion**
    - **Validates: Requirements 5.4**

  - [ ] 7.7 Write property test for property test iteration configuration

    - **Property 28: Property test iteration configuration**
    - **Validates: Requirements 12.2**

  - [ ] 7.8 Write unit tests for task generation
    - Test task hierarchy validation
    - Test optional task marking
    - Test checkpoint insertion
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 8. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement task execution logic

  - [ ] 9.1 Create task execution manager

    - Implement context loading (requirements, design, tasks)
    - Implement task status tracking
    - Implement subtask execution order enforcement
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ] 9.2 Write property test for context loading

    - **Property 12: Context loading for task execution**
    - **Validates: Requirements 6.1**

  - [ ] 9.3 Write property test for subtask completion order

    - **Property 13: Subtask completion order**
    - **Validates: Requirements 6.3**

  - [ ] 9.4 Write property test for task status updates

    - **Property 14: Task status updates**
    - **Validates: Requirements 6.4, 8.4**

  - [ ] 9.5 Implement optional task handling

    - Skip optional tasks by default
    - Allow explicit execution of optional tasks
    - _Requirements: 6.5_

  - [ ] 9.6 Write property test for optional task skipping

    - **Property 15: Optional task skipping**
    - **Validates: Requirements 6.5**

  - [ ] 9.7 Write unit tests for task execution
    - Test context loading
    - Test status updates
    - Test optional task skipping
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

- [ ] 10. Implement MCP tools for spec operations

  - [ ] 10.1 Implement create_spec tool

    - Create tool handler for spec creation
    - Integrate with directory management and requirements generator
    - _Requirements: 1.1, 1.2, 8.2_

  - [ ] 10.2 Implement read_spec tool

    - Create tool handler for reading spec documents
    - Support reading requirements, design, and tasks
    - _Requirements: 7.2, 7.4, 8.2_

  - [ ] 10.3 Implement update_spec tool

    - Create tool handler for updating spec documents
    - Preserve formatting when updating
    - _Requirements: 7.5, 8.2_

  - [ ] 10.4 Implement list_specs tool

    - Create tool handler for listing all specs
    - Include feature name and current phase
    - _Requirements: 8.3_

  - [ ] 10.5 Write property test for spec listing completeness

    - **Property 19: Spec listing completeness**
    - **Validates: Requirements 8.3**

  - [ ] 10.6 Implement validate_requirements tool

    - Create tool handler for requirements validation
    - Integrate EARS and INCOSE validators
    - _Requirements: 8.5_

  - [ ] 10.7 Implement update_task_status tool

    - Create tool handler for task status updates
    - Preserve tasks.md formatting
    - _Requirements: 8.4_

  - [ ] 10.8 Write property test for MCP tool execution

    - **Property 18: MCP tool execution**
    - **Validates: Requirements 8.2**

  - [ ] 10.9 Write unit tests for MCP tools
    - Test each tool with valid inputs
    - Test error handling
    - Test schema validation
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Implement Chat Participant integration

  - [ ] 11.1 Create chat participant registration

    - Register @spec participant with VS Code
    - Set up chat request handler
    - _Requirements: 11.1_

  - [ ] 11.2 Implement command parser

    - Parse user commands from chat messages
    - Extract intent and parameters
    - _Requirements: 11.2, 11.3_

  - [ ] 11.3 Write property test for command parsing and routing

    - **Property 24: Command parsing and routing**
    - **Validates: Requirements 11.2, 11.3**

  - [ ] 11.4 Implement command router

    - Route commands to appropriate MCP tools
    - Handle command execution
    - _Requirements: 11.3_

  - [ ] 11.5 Implement response formatter

    - Format MCP tool results for chat display
    - Create readable, structured responses
    - _Requirements: 11.4_

  - [ ] 11.6 Write property test for response formatting

    - **Property 25: Response formatting**
    - **Validates: Requirements 11.4**

  - [ ] 11.7 Implement error handling for chat

    - Create helpful error messages
    - Provide suggested corrections
    - _Requirements: 11.5_

  - [ ] 11.8 Write property test for error message helpfulness

    - **Property 26: Error message helpfulness**
    - **Validates: Requirements 11.5**

  - [ ] 11.9 Write unit tests for chat participant
    - Test command parsing
    - Test response formatting
    - Test error handling
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 12. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement UI components

  - [ ] 13.1 Create spec tree view provider

    - Implement SpecTreeProvider for sidebar
    - Display all specs with phase and progress
    - _Requirements: 9.1, 9.2_

  - [ ] 13.2 Implement task progress calculation

    - Calculate completion percentage
    - Exclude optional tasks from calculation
    - _Requirements: 9.3_

  - [ ] 13.3 Write property test for task completion percentage

    - **Property 20: Task completion percentage calculation**
    - **Validates: Requirements 9.3**

  - [ ] 13.4 Implement status bar manager

    - Show current spec and phase in status bar
    - Display progress indicators
    - _Requirements: 9.1_

  - [ ] 13.5 Write unit tests for UI components
    - Test tree view data generation
    - Test progress calculation
    - Test status bar updates
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 14. Implement configuration management

  - [ ] 14.1 Register extension configuration

    - Define configuration schema in package.json
    - Register configuration options
    - _Requirements: 10.1_

  - [ ] 14.2 Implement custom directory configuration

    - Read custom spec directory from settings
    - Use custom directory for all operations
    - _Requirements: 10.2_

  - [ ] 14.3 Write property test for custom directory configuration

    - **Property 21: Custom directory configuration**
    - **Validates: Requirements 10.2**

  - [ ] 14.4 Implement strict mode

    - Read strict mode setting
    - Require all tasks when strict mode enabled
    - _Requirements: 10.3_

  - [ ] 14.5 Write property test for strict mode enforcement

    - **Property 22: Strict mode enforcement**
    - **Validates: Requirements 10.3**

  - [ ] 14.6 Implement property test iteration configuration

    - Read iteration count from settings
    - Use in testing strategy generation
    - _Requirements: 10.4_

  - [ ] 14.7 Implement configuration hot-reload

    - Listen for configuration changes
    - Apply new settings without restart
    - _Requirements: 10.5_

  - [ ] 14.8 Write property test for configuration hot-reload

    - **Property 23: Configuration hot-reload**
    - **Validates: Requirements 10.4, 10.5**

  - [ ] 14.9 Write unit tests for configuration
    - Test custom directory handling
    - Test strict mode
    - Test hot-reload
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 15. Implement property-based testing support

  - [ ] 15.1 Implement property test tagging

    - Generate test code with property references
    - Use format: "**Feature: {name}, Property {N}: {text}**"
    - _Requirements: 12.3_

  - [ ] 15.2 Write property test for property test tagging

    - **Property 29: Property test tagging**
    - **Validates: Requirements 12.3**

  - [ ] 15.3 Implement failure example capture

    - Capture failing examples from PBT library
    - Update task status with failure information
    - _Requirements: 12.4_

  - [ ] 15.4 Write property test for failure example capture

    - **Property 30: Failure example capture**
    - **Validates: Requirements 12.4**

  - [ ] 15.5 Implement requirements validation tracking

    - Mark requirements as validated when properties pass
    - Track validation status in state file
    - _Requirements: 12.5_

  - [ ] 15.6 Write property test for requirements validation

    - **Property 31: Requirements validation on test success**
    - **Validates: Requirements 12.5**

  - [ ] 15.7 Write unit tests for PBT support
    - Test tag generation
    - Test failure capture
    - Test validation tracking
    - _Requirements: 12.3, 12.4, 12.5_

- [ ] 16. Implement error handling infrastructure

  - [ ] 16.1 Create error handler

    - Implement ErrorHandler class
    - Create error categorization logic
    - Generate recovery suggestions
    - _Requirements: 11.5_

  - [ ] 16.2 Implement specific error handlers

    - Handle file system errors
    - Handle validation errors
    - Handle MCP communication errors
    - Handle workflow state errors
    - Handle user input errors
    - _Requirements: 11.5_

  - [ ] 16.3 Write unit tests for error handling
    - Test error categorization
    - Test recovery suggestions
    - Test specific error handlers
    - _Requirements: 11.5_

- [ ] 17. Final checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Create extension packaging and documentation

  - [ ] 18.1 Create package.json with all metadata

    - Define extension metadata
    - List all commands and contributions
    - Specify activation events

  - [ ] 18.2 Create README.md

    - Document extension features
    - Provide usage examples
    - Include installation instructions

  - [ ] 18.3 Create CHANGELOG.md

    - Document initial release features

  - [ ] 18.4 Write integration tests
    - Test complete workflows end-to-end
    - Test requirements → design → tasks flow
    - Test task execution flow
