/**
 * Multimodal Input Support Module
 * 
 * This module provides image analysis and understanding capabilities
 * within VS Code, supporting both local and cloud inference backends.
 */

// Core types - export all types from the types module
export * from "./types";

// Image validation
export { ImageValidator } from "./image-validator";

// Configuration
export { MultimodalConfigManager } from "./config-manager";

// Adapters
export { LocalEngineAdapter } from "./local-engine-adapter";
export { CloudEndpointAdapter } from "./cloud-endpoint-adapter";

// Routing
export { AnalysisRouter } from "./analysis-router";

// Persistence
export { PersistenceService } from "./persistence-service";

// Results management
export { ResultsManager } from "./results-manager";

// UI components
export { AnnotationRenderer } from "./annotation-renderer";
export type { AnnotationContent } from "./annotation-renderer";
export { ResultsPanel } from "./results-panel";

// Privacy and consent
export { ConsentManager } from "./consent-manager";

// Concurrency
export { ConcurrencyManager } from "./concurrency-manager";

// Offline support
export { OfflineQueueManager } from "./offline-queue-manager";
export type { NetworkState } from "./offline-queue-manager";

// Plugin system
export { PluginLoader } from "./plugin-loader";
export { PresetManager } from "./preset-manager";

// Telemetry
export { TelemetryService } from "./telemetry-service";

// Events
export { MultimodalEventBus } from "./event-bus";
export type { MultimodalEvent } from "./event-bus";

// Main orchestrator
export { ImageAnalyzer, createImageAnalyzer } from "./image-analyzer";

// Error handling
export { ErrorHandler, errorHandler, createErrorHandler } from "./error-handler";
export type { ModelValidationErrorResponse, FormattedError, IErrorHandler } from "./error-handler";

// Extension integration
export { 
  MultimodalExtensionIntegration, 
  activateMultimodalExtension,
  MULTIMODAL_COMMANDS,
  SUPPORTED_IMAGE_EXTENSIONS,
  getPackageJsonContributions 
} from "./extension-integration";
export type { MultimodalExtensionConfig } from "./extension-integration";
