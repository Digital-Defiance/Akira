# Implementation Plan: Multimodal Input Support

## Overview

This implementation plan breaks down the multimodal input feature into discrete coding tasks. The implementation follows a bottom-up approach, starting with core types and validators, then building up to the full analysis pipeline with persistence, plugins, and telemetry.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Create multimodal directory structure and core type definitions
    - Create `src/multimodal/` directory
    - Define `SupportedMimeType`, `InferenceMode`, `AnalysisRequest`, `AnalysisResult`, `PersistedResult` types
    - Define `BoundingBox`, `DetectionLabel`, `ResultsFile` types
    - Define error types and configuration interfaces
    - _Requirements: REQ-1.1, REQ-2.1, REQ-2.2, REQ-5.1_

- [x] 2. Implement Image Validator
  - [x] 2.1 Implement ImageValidator class with MIME type and size validation
    - Implement `validate(imagePath, maxSizeMB)` method
    - Support image/png, image/jpeg, image/webp, image/gif MIME types
    - Return detailed error with detected MIME type and accepted types on failure
    - Return file size in validation result
    - _Requirements: REQ-1.1, REQ-1.4, REQ-6.1_
  - [x] 2.2 Write property test for MIME type validation
    - **Property 1: MIME Type Validation**
    - **Validates: Requirements REQ-1.1**
  - [x] 2.3 Write property test for file size validation
    - **Property 2: File Size Validation**
    - **Validates: Requirements REQ-1.4**
  - [x] 2.4 Write property test for invalid format error message content
    - **Property 16: Invalid Format Error Message Content**
    - **Validates: Requirements REQ-6.1**

- [x] 3. Checkpoint - Ensure validator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Configuration Manager
  - [x] 4.1 Implement MultimodalConfigManager with settings validation
    - Define configuration schema in package.json contributes.configuration
    - Implement settings validation for maxImageSizeMB (0.5-100 range)
    - Implement settings validation for confidenceThreshold (0-100 range)
    - Track invalid settings state to block analysis
    - _Requirements: REQ-4.1, REQ-4.2, REQ-4.3_
  - [x] 4.2 Write property test for settings validation boundaries
    - **Property 11: Settings Validation Boundaries**
    - **Validates: Requirements REQ-4.2**
  - [x] 4.3 Write property test for analysis blocking on invalid settings
    - **Property 12: Analysis Blocking on Invalid Settings**
    - **Validates: Requirements REQ-4.3**

- [x] 5. Implement Local Engine Adapter
  - [x] 5.1 Implement LocalEngineAdapter with CLI invocation
    - Implement `analyze(imagePath, modelId)` method
    - Invoke local binary with documented CLI arguments
    - Parse stdout as JSON result
    - Handle timeout and exit code errors
    - _Requirements: REQ-3.2_
  - [x] 5.2 Write unit tests for LocalEngineAdapter
    - Test CLI argument construction
    - Test result parsing
    - Test error handling for missing binary
    - _Requirements: REQ-3.2_

- [x] 6. Implement Cloud Endpoint Adapter
  - [x] 6.1 Implement CloudEndpointAdapter with HTTPS POST and retry logic
    - Implement `analyze(imageData, modelId)` method
    - Send HTTPS POST to configured endpoint URL
    - Implement retry with exponential backoff (1s, 2s) for 5xx errors
    - Ensure TLS 1.2+ and no tokens in query parameters
    - _Requirements: REQ-3.1, REQ-3.3, REQ-9.4_
  - [x] 6.2 Write property test for cloud endpoint retry behavior
    - **Property 9: Cloud Endpoint Retry Behavior**
    - **Validates: Requirements REQ-3.3**
  - [x] 6.3 Write property test for transport security
    - **Property 25: Transport Security**
    - **Validates: Requirements REQ-9.4**

- [x] 7. Implement Analysis Router
  - [x] 7.1 Implement AnalysisRouter with mode-based routing
    - Implement `route(request)` method
    - Route to CloudEndpointAdapter when mode is "cloud"
    - Route to LocalEngineAdapter when mode is "local"
    - Check backend availability before routing
    - _Requirements: REQ-3.1, REQ-3.2, REQ-3.4_
  - [x] 7.2 Write property test for analysis routing by mode
    - **Property 8: Analysis Routing by Mode**
    - **Validates: Requirements REQ-3.1, REQ-3.2**
  - [x] 7.3 Write property test for settings mode persistence
    - **Property 10: Settings Mode Persistence**
    - **Validates: Requirements REQ-3.4**

- [x] 8. Checkpoint - Ensure routing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Persistence Service
  - [x] 9.1 Implement PersistenceService with JSON storage and rotation
    - Implement `writeResult(workspaceRoot, result)` method
    - Create .vscode/image-analysis/results.json if not exists
    - Append results to single file per workspace
    - Implement file rotation when size exceeds 50MB
    - _Requirements: REQ-5.1, REQ-5.2, REQ-5.3_
  - [x] 9.2 Implement AES-256 encryption for results file
    - Encrypt file when 'Encrypt Analysis Storage' setting is true
    - Implement encryption/decryption with workspace-scoped key
    - _Requirements: REQ-9.3_
  - [x] 9.3 Write property test for persistence format completeness
    - **Property 13: Persistence Format Completeness**
    - **Validates: Requirements REQ-5.1**
  - [x] 9.4 Write property test for single results file per workspace
    - **Property 14: Single Results File Per Workspace**
    - **Validates: Requirements REQ-5.2**
  - [x] 9.5 Write property test for results file rotation
    - **Property 15: Results File Rotation**
    - **Validates: Requirements REQ-5.3**
  - [x] 9.6 Write property test for storage encryption round-trip
    - **Property 24: Storage Encryption Round-Trip**
    - **Validates: Requirements REQ-9.3**

- [x] 10. Implement Results Manager
  - [x] 10.1 Implement ResultsManager with result processing pipeline
    - Implement `processResult(result)` method
    - Coordinate persistence, annotations, and event emission
    - Implement `getHistory(workspaceRoot)` and `clearHistory(workspaceRoot)` methods
    - _Requirements: REQ-5.1, REQ-8.2_
  - [x] 10.2 Write property test for results JSON serialization round-trip
    - **Property 6: Results JSON Serialization Round-Trip**
    - **Validates: Requirements REQ-2.2**

- [x] 11. Checkpoint - Ensure persistence tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement Annotation Renderer
  - [x] 12.1 Implement AnnotationRenderer with VS Code editor decorations
    - Implement `render(result, visibility)` method
    - Render labels with confidence percentages
    - Render bounding box coordinates
    - Render OCR text when available
    - _Requirements: REQ-2.1_
  - [x] 12.2 Implement visibility toggle functionality
    - Implement `updateVisibility(visibility)` method
    - Support independent toggling of labels, OCR text, and bounding boxes
    - Implement `clear()` method
    - _Requirements: REQ-2.3_
  - [x] 12.3 Write property test for annotation content completeness
    - **Property 5: Annotation Content Completeness**
    - **Validates: Requirements REQ-2.1**
  - [x] 12.4 Write property test for annotation visibility independence
    - **Property 7: Annotation Visibility Independence**
    - **Validates: Requirements REQ-2.3**

- [x] 13. Implement Results Panel
  - [x] 13.1 Implement ResultsPanel webview with JSON display
    - Create webview panel for 'Image Analysis' results
    - Display JSON-serializable results object
    - Include labels, confidences, OCR text, and timestamps
    - _Requirements: REQ-2.2_
  - [x] 13.2 Write unit tests for ResultsPanel
    - Test panel creation and content population
    - Test JSON serialization of results
    - _Requirements: REQ-2.2_

- [x] 14. Implement Consent and Privacy Controls
  - [x] 14.1 Implement ConsentManager with opt-in dialog
    - Implement one-time consent dialog for external endpoints
    - Persist consent state in workspace settings
    - Block external requests without consent
    - _Requirements: REQ-9.1_
  - [x] 14.2 Implement local-only mode enforcement
    - Disable cloud endpoint UI controls in local-only mode
    - Persist local-only choice in workspace settings
    - Block all external calls when enabled
    - _Requirements: REQ-9.2_
  - [x] 14.3 Write property test for external call consent enforcement
    - **Property 23: External Call Consent Enforcement**
    - **Validates: Requirements REQ-9.1, REQ-9.2**

- [x] 15. Checkpoint - Ensure privacy tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Concurrency Manager
  - [x] 16.1 Implement ConcurrencyManager with request queuing
    - Limit concurrent analyses to 10 per workspace
    - Queue up to 5 additional requests in FIFO order
    - Reject requests beyond queue limit
    - _Requirements: REQ-7.3_
  - [x] 16.2 Write property test for concurrency limit and FIFO queuing
    - **Property 19: Concurrency Limit and FIFO Queuing**
    - **Validates: Requirements REQ-7.3**

- [x] 17. Implement Offline Queue Manager
  - [x] 17.1 Implement OfflineQueueManager for cloud requests
    - Detect network connectivity state
    - Queue cloud requests when offline
    - Process queued requests when connectivity returns
    - Update status bar with queued state
    - _Requirements: REQ-6.3_
  - [x] 17.2 Write property test for offline request queuing
    - **Property 18: Offline Request Queuing**
    - **Validates: Requirements REQ-6.3**

- [x] 18. Implement Plugin System
  - [x] 18.1 Implement PluginLoader with workspace plugin discovery
    - Load plugins from workspace-local plugins directory
    - Validate plugin interface (id, name, version, processImage)
    - Execute plugins synchronously in listed order
    - _Requirements: REQ-10.1_
  - [x] 18.2 Implement plugin exception isolation
    - Catch exceptions from plugin execution
    - Log plugin id and stack trace to output pane
    - Continue executing remaining plugins after exception
    - _Requirements: REQ-10.3_
  - [x] 18.3 Write property test for plugin execution order
    - **Property 26: Plugin Execution Order**
    - **Validates: Requirements REQ-10.1**
  - [x] 18.4 Write property test for plugin exception isolation
    - **Property 28: Plugin Exception Isolation**
    - **Validates: Requirements REQ-10.3**

- [x] 19. Implement Preset Manager
  - [x] 19.1 Implement PresetManager with preset application
    - Implement `getPresets()`, `applyPreset(presetId, request)`, `savePreset(preset)` methods
    - Apply preset's model id, confidence threshold, and plugin list
    - Persist preset selection per workspace
    - _Requirements: REQ-10.2_
  - [x] 19.2 Write property test for preset application
    - **Property 27: Preset Application**
    - **Validates: Requirements REQ-10.2**

- [x] 20. Checkpoint - Ensure plugin tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Implement Telemetry Service
  - [x] 21.1 Implement TelemetryService with event emission
    - Emit telemetry events when enabled
    - Include anonymized payload size, model id, inference mode, duration
    - Send via HTTPS to configured endpoint
    - _Requirements: REQ-8.1_
  - [x] 21.2 Implement telemetry retry with non-blocking behavior
    - Retry failed submissions up to 3 times asynchronously
    - Drop telemetry record after max retries
    - Never block analysis result display
    - _Requirements: REQ-8.3_
  - [x] 21.3 Write property test for telemetry event content
    - **Property 20: Telemetry Event Content**
    - **Validates: Requirements REQ-8.1**
  - [x] 21.4 Write property test for telemetry retry non-blocking
    - **Property 22: Telemetry Retry Non-Blocking**
    - **Validates: Requirements REQ-8.3**

- [x] 22. Implement Event Bus Integration
  - [x] 22.1 Implement workspace event emission on analysis completion
    - Emit VS Code workspace event with results object
    - Use extension event bus for external consumers
    - _Requirements: REQ-8.2_
  - [x] 22.2 Write property test for workspace event emission
    - **Property 21: Workspace Event Emission**
    - **Validates: Requirements REQ-8.2**

- [x] 23. Implement Image Analyzer Orchestrator
  - [x] 23.1 Implement ImageAnalyzer as main orchestration component
    - Coordinate validation, routing, results processing
    - Implement `analyzeImage(imagePath)` command handler
    - Emit analysis start within 500ms of command invocation
    - Update progress indicator every 500ms during analysis
    - _Requirements: REQ-1.2, REQ-1.3_
  - [x] 23.2 Write property test for analysis initiation latency
    - **Property 3: Analysis Initiation Latency**
    - **Validates: Requirements REQ-1.2**
  - [x] 23.3 Write property test for progress update frequency
    - **Property 4: Progress Update Frequency**
    - **Validates: Requirements REQ-1.3**

- [x] 24. Implement Error Handler
  - [x] 24.1 Implement centralized error handling with detailed messages
    - Handle model validation errors with endpoint error code and model id
    - Format error messages with recovery actions
    - _Requirements: REQ-6.2_
  - [x] 24.2 Write property test for model validation error propagation
    - **Property 17: Model Validation Error Propagation**
    - **Validates: Requirements REQ-6.2**

- [x] 25. Register VS Code Commands and UI
  - [x] 25.1 Register 'Analyze Image' command and context menu
    - Register command in package.json
    - Add context menu item for image files in explorer
    - Wire command to ImageAnalyzer
    - _Requirements: REQ-1.2_
  - [x] 25.2 Register status bar progress indicator
    - Create status bar item for analysis progress
    - Update progress at 500ms intervals
    - Show queued state when offline
    - _Requirements: REQ-1.3, REQ-6.3_
  - [x] 25.3 Register 'Image Analysis' panel command
    - Register panel open command
    - Wire to ResultsPanel webview
    - _Requirements: REQ-2.2_

- [x] 26. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Implementation uses TypeScript following existing Akira extension patterns
