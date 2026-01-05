# Implementation Plan: Execution Reflection Loop

## Overview

This implementation plan breaks down the Execution Reflection Loop feature into discrete, incremental tasks. The approach focuses on building the core reflection loop first, then adding context management, failure pattern detection, and observability features. Each task builds on previous work and includes testing to validate correctness.

## Tasks

- [x] 1. Enhance ExecutionEngine with reflection loop core

  - Implement `executeWithReflection()` method with iteration loop
  - Add failure context parameter to `generateWithLLM()`
  - Integrate with existing `executePlan()` and evaluation flow
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 1.1 Write property test for reflection loop initiation

  - **Property 1: Reflection loop initiation on failure**
  - **Validates: Requirements 1.1**

- [x] 1.2 Write property test for early exit on success

  - **Property 4: Early exit on success**
  - **Validates: Requirements 1.4**

- [x] 1.3 Write property test for iteration exhaustion

  - **Property 3: Iteration exhaustion handling**
  - **Validates: Requirements 1.3**

- [x] 2. Add FailureContext types and interfaces

  - Define `FailureContext`, `AttemptRecord`, `FailurePattern`, `EnvironmentState` interfaces in types.ts
  - Add `ReflectionConfig` and `ReflectionOptions` types
  - Add `DetailedEvaluation` and `CriterionResult` types for enhanced evaluation
  - _Requirements: 1.2, 3.1, 4.1_

- [x] 3. Enhance ContextManager with failure tracking

  - Implement `trackAttempt()` to store execution attempts
  - Implement `getFailureHistory()` to retrieve attempt history
  - Implement `captureEnvironmentState()` to snapshot file/command state
  - Implement `evaluateAfterExecution()` to call Decision Engine post-execution
  - Add storage methods for failures.json
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3.1 Write property test for attempt tracking

  - **Property 13: Attempt tracking**
  - **Validates: Requirements 4.1**

- [x] 3.2 Write property test for failure history persistence

  - **Property 14: Failure history persistence**
  - **Validates: Requirements 4.2, 4.3**

- [x] 3.3 Write property test for file modification tracking

  - **Property 15: File modification tracking**
  - **Validates: Requirements 4.4**

- [x] 3.4 Write property test for context persistence

  - **Property 16: Context persistence**
  - **Validates: Requirements 4.5**

- [x] 4. Implement failure context propagation in ExecutionEngine

  - Modify `executeWithReflection()` to build failure context from previous attempts
  - Pass failure context to `generateWithLLM()` on subsequent iterations
  - Ensure failure context includes actions, results, and evaluation reasoning
  - _Requirements: 1.2, 3.1, 3.2, 3.3_

- [x] 4.1 Write property test for failure context propagation

  - **Property 2: Failure context propagation**
  - **Validates: Requirements 1.2, 3.1, 3.2, 3.3**

- [x] 5. Enhance LLMIntegrator to use failure context

  - Modify `generateActions()` to accept optional `failureContext` parameter
  - Build enhanced prompt that includes previous attempts, failures, and patterns
  - Add explicit instructions to try different approaches
  - Format failure history in a clear, actionable way for the LLM
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5.1 Write property test for failure pattern summarization

  - **Property 11: Failure pattern summarization**
  - **Validates: Requirements 3.4**

- [x] 5.2 Write property test for different approach instruction

  - **Property 12: Different approach instruction**
  - **Validates: Requirements 3.5**

- [x] 6. Enhance DecisionEngine with detailed evaluation

  - Implement `evaluateWithDetails()` method that returns `DetailedEvaluation`
  - Include per-criterion results with evidence
  - Identify missing elements and generate suggestions
  - Ensure evaluation includes file checks, command validation, and content verification
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6.1 Write property test for post-execution evaluation

  - **Property 6: Post-execution evaluation**
  - **Validates: Requirements 2.1**

- [x] 6.2 Write property test for confidence threshold

  - **Property 7: Confidence threshold for completion**
  - **Validates: Requirements 2.2**

- [x] 6.3 Write property test for low confidence reasoning

  - **Property 8: Low confidence reasoning**
  - **Validates: Requirements 2.3**

- [x] 6.4 Write property test for evaluation error handling

  - **Property 9: Evaluation error handling**
  - **Validates: Requirements 2.4**

- [x] 6.5 Write property test for comprehensive evaluation checks

  - **Property 10: Comprehensive evaluation checks**
  - **Validates: Requirements 2.5**

- [x] 7. Implement failure pattern detection

  - Add `detectFailurePatterns()` method to ContextManager
  - Implement logic to identify repeated error messages across iterations
  - Track pattern occurrences with timestamps
  - Return structured `FailurePattern` objects
  - _Requirements: 6.1, 6.5_

- [x] 7.1 Write property test for persistent failure detection

  - **Property 21: Persistent failure detection**
  - **Validates: Requirements 6.1**

- [x] 7.2 Write property test for session-level pattern tracking

  - **Property 24: Session-level pattern tracking**
  - **Validates: Requirements 6.5**

- [x] 8. Implement persistent failure escalation

  - Add persistent failure detection to `executeWithReflection()`
  - Pause execution when persistent failure threshold is reached
  - Show VS Code dialog requesting user guidance
  - Provide summary of attempted approaches and failure reasons
  - Incorporate user guidance into next iteration
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 8.1 Write property test for user escalation

  - **Property 22: User escalation on persistent failure**
  - **Validates: Requirements 6.2, 6.3**

- [x] 8.2 Write property test for user guidance incorporation

  - **Property 23: User guidance incorporation**
  - **Validates: Requirements 6.4**

- [x] 9. Add reflection configuration support

  - Define `ReflectionConfig` with all configuration options
  - Add configuration to ExecutionEngine constructor
  - Implement configuration validation and defaults
  - Support enabling/disabling reflection entirely
  - Add configuration for max iterations, confidence threshold, pattern detection
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 9.1 Write property test for max iterations configuration

  - **Property 17: Max iterations configuration**
  - **Validates: Requirements 5.1**

- [x] 9.2 Write property test for confidence threshold configuration

  - **Property 18: Confidence threshold configuration**
  - **Validates: Requirements 5.2**

- [x] 9.3 Write property test for reflection toggle

  - **Property 19: Reflection toggle**
  - **Validates: Requirements 5.3, 5.4**

- [x] 10. Implement reflection logging and observability

  - Add iteration logging to `executeWithReflection()`
  - Log iteration number, actions, results, and evaluation details
  - Emit events for reflection start, iteration, and completion
  - Include metrics (iterations used, success rate) in events
  - _Requirements: 1.5, 7.1, 7.2, 7.3, 7.4, 5.5_

- [x] 10.1 Write property test for iteration logging

  - **Property 5: Iteration logging**
  - **Validates: Requirements 1.5, 7.1, 7.2, 7.3**
  - **Status: PASSED** (100 runs)

- [x] 10.2 Write property test for reflection completion event

  - **Property 25: Reflection completion event**
  - **Validates: Requirements 7.4**
  - **Status: PASSED** (100 runs)

- [x] 10.3 Write property test for reflection metrics emission

  - **Property 20: Reflection metrics emission**
  - **Validates: Requirements 5.5**
  - **Status: PASSED** (100 runs)

- [x] 11. Enhance SessionManager with reflection persistence

  - Implement `logReflectionIteration()` to log each iteration
  - Implement `getReflectionStats()` to retrieve reflection metrics
  - Create reflection.md file format and writer
  - Persist reflection data to failures.json
  - Ensure all reflection activity is in session history
  - _Requirements: 7.5_

- [x] 11.1 Write property test for session history persistence

  - **Property 26: Session history persistence**
  - **Validates: Requirements 7.5**

- [x] 12. Implement transient vs strategic error classification

  - Add `isTransientError()` helper function to ExecutionEngine
  - Classify errors based on type, exit code, and error message patterns
  - Ensure transient errors use standard retry before reflection
  - Ensure strategic errors go directly to reflection
  - _Requirements: 8.1, 8.4_

- [x] 12.1 Write property test for transient error retry precedence

  - **Property 27: Transient error retry precedence**
  - **Validates: Requirements 8.1**

- [x] 12.2 Write property test for error classification

  - **Property 30: Error classification**
  - **Validates: Requirements 8.4**

- [x] 13. Implement retry to reflection handoff

  - Modify `executeCommand()` to track retry exhaustion
  - Pass failure context from retry to reflection when exhausted
  - Ensure reflection is not invoked if retry succeeds
  - Log which mechanism (retry or reflection) was used
  - _Requirements: 8.2, 8.3, 8.5_

- [x] 13.1 Write property test for retry success short-circuit

  - **Property 28: Retry success short-circuit**
  - **Validates: Requirements 8.2**

- [x] 13.2 Write property test for retry to reflection handoff

  - **Property 29: Retry to reflection handoff**
  - **Validates: Requirements 8.3**

- [x] 13.3 Write property test for retry mechanism logging

  - **Property 31: Retry mechanism logging**
  - **Validates: Requirements 8.5**

- [x] 14. Update AutonomousExecutor with reflection and chat UI integration

  - Replace `executePlan()` calls with `executeWithReflection()`
  - Pass reflection configuration from session config
  - Subscribe to reflection events in `setupEventHandlers()`:
    - `reflectionStarted`: Show notification and update status bar
    - `reflectionIteration`: Stream progress updates to chat/output
    - `reflectionCompleted`: Show final result with iteration count
  - Update status bar to show iteration progress (e.g., "🔄 Iteration 2/3")
  - Stream reflection updates to Copilot Chat when chat is active:
    - "🔄 Iteration 1/3: Trying initial approach..."
    - "❌ Failed: [error]. Analyzing and adjusting strategy..."
    - "🔄 Iteration 2/3: Trying alternative approach..."
    - "✅ Success after 2 iterations!"
  - Show user-friendly notifications for reflection milestones
  - Consider chat-based guidance input for persistent failures (instead of modal dialogs)
  - Ensure reflection activity is visible and non-intrusive
  - Ensure all new functionality is tested
  - _Requirements: 1.1, 5.1, 5.2, 5.3, 7.1, 7.2, 7.3, 7.4_

- [x] 15. Checkpoint - Ensure all tests pass

  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Add integration tests for complete reflection flow

  - Test execute → fail → re-plan → succeed flow
  - Test multiple iterations with different failures
  - Test persistent failure detection and user escalation
  - Test failure pattern recognition across iterations
  - Test environment state tracking across attempts
  - _Requirements: All_

- [x] 16.1 Write integration test for complete reflection flow

  - Test full cycle from initial failure to eventual success

- [x] 16.2 Write integration test for persistent failure escalation

  - Test that repeated failures trigger user prompt

- [x] 16.3 Write integration test for failure pattern recognition

  - Test that patterns are detected and summarized

- [x] 17. Add E2E tests for real execution scenarios

  - Test task that fails initially, succeeds on retry with adjusted approach
  - Test task that fails persistently, user is prompted for guidance
  - Test reflection loop disabled, falls back to single attempt
  - Test multiple tasks with reflection in parallel session
  - Test session recovery after crash during reflection
  - _Requirements: All_

- [x] 17.1 Write E2E test for adaptive retry success

  - Test real task execution with reflection leading to success

- [x] 17.2 Write E2E test for persistent failure user prompt

  - Test that user is prompted when failures persist

- [x] 17.3 Write E2E test for reflection disabled fallback

  - Test that disabling reflection uses single-attempt execution

- [x] 18. Update documentation

  - Update EXECUTION-ENGINE-ARCHITECTURE.md with reflection loop details
  - Update src/execution/README.md with reflection configuration
  - Add reflection loop examples to documentation
  - Document failure pattern detection and user escalation
  - Update showcase/ features/documentation
  - Update root readme for vscode marketplace documentation.

- - _Requirements: All_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests validate multi-component workflows
- E2E tests validate real-world execution scenarios
- The implementation builds incrementally: core loop → context → patterns → observability → integration
