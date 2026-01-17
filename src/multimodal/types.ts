/**
 * Core type definitions for Multimodal Input Support
 * Requirements: REQ-1.1, REQ-2.1, REQ-2.2, REQ-5.1
 */

// ============================================================================
// MIME Types and Inference Modes
// ============================================================================

/**
 * Supported image MIME types for analysis
 * Requirement: REQ-1.1
 */
export type SupportedMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

/**
 * Array of all supported MIME types for validation
 */
export const SUPPORTED_MIME_TYPES: readonly SupportedMimeType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * Inference mode selection - local or cloud processing
 */
export type InferenceMode = "local" | "cloud";

// ============================================================================
// Bounding Box and Detection Types
// ============================================================================

/**
 * Bounding box coordinates for detected objects
 * Requirement: REQ-2.1
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Individual detection label with confidence score
 * Requirement: REQ-2.1
 */
export interface DetectionLabel {
  label: string;
  confidence: number;
  boundingBox?: BoundingBox;
}

// ============================================================================
// Analysis Request and Result Types
// ============================================================================

/**
 * Analysis request input containing all parameters for image analysis
 */
export interface AnalysisRequest {
  imagePath: string;
  mimeType: SupportedMimeType;
  fileSize: number;
  modelId: string;
  confidenceThreshold: number;
  inferenceMode: InferenceMode;
  workspaceRoot: string;
}

/**
 * Complete analysis result from inference backend
 * Requirement: REQ-2.2
 */
export interface AnalysisResult {
  id: string;
  imagePath: string;
  timestamp: string;
  modelId: string;
  inferenceMode: InferenceMode;
  duration: number;
  labels: DetectionLabel[];
  ocrText?: string;
  rawResponse?: unknown;
}

// ============================================================================
// Persistence Types
// ============================================================================

/**
 * Summary of analysis results for persistence
 * Requirement: REQ-5.1
 */
export interface ResultsSummary {
  labelCount: number;
  topLabels: string[];
  hasOcrText: boolean;
}

/**
 * Persisted result entry in results.json
 * Requirement: REQ-5.1
 */
export interface PersistedResult {
  imagePath: string;
  timestamp: string;
  resultsSummary: ResultsSummary;
  modelId: string;
  fullResult: AnalysisResult;
}

/**
 * Results file structure for workspace storage
 * Requirement: REQ-5.1
 */
export interface ResultsFile {
  version: string;
  results: PersistedResult[];
}


// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for image validation failures
 */
export type ImageValidationErrorCode =
  | "INVALID_MIME_TYPE"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_FOUND";

/**
 * Error codes for analysis failures
 */
export type AnalysisErrorCode =
  | ImageValidationErrorCode
  | "INVALID_SETTING"
  | "ENDPOINT_UNREACHABLE"
  | "ENDPOINT_ERROR_5XX"
  | "ENDPOINT_ERROR_4XX"
  | "LOCAL_ENGINE_NOT_FOUND"
  | "LOCAL_ENGINE_TIMEOUT"
  | "STORAGE_WRITE_FAILED"
  | "ENCRYPTION_FAILED"
  | "PLUGIN_LOAD_FAILED"
  | "PLUGIN_EXECUTION_ERROR"
  | "CONSENT_REQUIRED";

/**
 * Detailed error information for validation failures
 */
export interface ImageValidationError {
  code: ImageValidationErrorCode;
  message: string;
  detectedMimeType?: string;
  acceptedMimeTypes?: SupportedMimeType[];
  maxSizeBytes?: number;
  actualSizeBytes?: number;
}

/**
 * Complete analysis error with recovery information
 */
export interface AnalysisError {
  code: AnalysisErrorCode;
  message: string;
  details?: {
    detectedMimeType?: string;
    acceptedMimeTypes?: string[];
    maxSizeBytes?: number;
    actualSizeBytes?: number;
    endpointUrl?: string;
    httpStatus?: number;
    modelId?: string;
    pluginId?: string;
    stackTrace?: string;
  };
  recoveryAction?: string;
  retryable: boolean;
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Result of image validation
 */
export interface ImageValidationResult {
  valid: boolean;
  mimeType?: SupportedMimeType;
  fileSize?: number;
  error?: ImageValidationError;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Local engine adapter configuration
 */
export interface LocalEngineConfig {
  binaryPath: string;
  timeout: number;
}

/**
 * Cloud endpoint adapter configuration
 */
export interface CloudEndpointConfig {
  endpointUrl: string;
  timeout: number;
  retryConfig: RetryConfig;
}

/**
 * Retry configuration for network requests
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number[];
  retryableErrors: string[];
}

/**
 * Persistence service configuration
 */
export interface PersistenceConfig {
  maxFileSizeMB: number;
  encryptionEnabled: boolean;
  encryptionKey?: string;
}

/**
 * Annotation visibility settings
 */
export interface AnnotationVisibility {
  labels: boolean;
  ocrText: boolean;
  boundingBoxes: boolean;
}

/**
 * Complete multimodal input configuration
 */
export interface MultimodalInputConfig {
  // Inference settings
  inferenceMode: InferenceMode;
  cloudEndpointUrl: string;
  localEnginePath: string;

  // Analysis parameters
  modelId: string;
  maxImageSizeMB: number;
  confidenceThreshold: number;

  // Privacy settings
  localOnlyMode: boolean;
  encryptAnalysisStorage: boolean;
  userConsentGiven: boolean;

  // Telemetry
  telemetryEnabled: boolean;
  telemetryEndpoint: string;

  // Concurrency
  maxConcurrentAnalyses: number;
  queueLimit: number;
}

// ============================================================================
// Plugin Types
// ============================================================================

/**
 * Plugin interface for image analysis post-processing
 */
export interface ImageAnalysisPlugin {
  id: string;
  name: string;
  version: string;
  processImage(
    imagePath: string,
    results: AnalysisResult
  ): Promise<AnalysisResult>;
}

/**
 * Model preset configuration
 */
export interface ModelPreset {
  id: string;
  name: string;
  modelId: string;
  confidenceThreshold: number;
  plugins: string[];
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default retry configuration for cloud endpoints
 */
export const DEFAULT_CLOUD_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3, // Initial + 2 retries
  backoffMs: [1000, 2000], // 1s, 2s exponential backoff
  retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
};

/**
 * Default retry configuration for telemetry
 */
export const DEFAULT_TELEMETRY_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 4, // Initial + 3 retries
  backoffMs: [1000, 2000, 4000],
  retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
};

/**
 * Maximum image file size in bytes (25 MB)
 */
export const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Maximum results file size in bytes (50 MB)
 */
export const MAX_RESULTS_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Results file version
 */
export const RESULTS_FILE_VERSION = "1.0.0";
