/**
 * Multimodal Configuration Manager
 * Handles reading and validating multimodal input configuration settings
 * Requirements: REQ-4.1, REQ-4.2, REQ-4.3
 */

import { MultimodalInputConfig, InferenceMode } from "./types";

// Conditionally import vscode only when available
let vscode: typeof import("vscode") | undefined;

// Allow tests to inject vscode mock
export function __setVSCodeForTesting(vscodeMock: unknown): void {
  vscode = vscodeMock as typeof vscode;
}

try {
  vscode = require("vscode");
} catch {
  try {
    const requireFunc = eval("require");
    vscode = requireFunc("vscode");
  } catch {
    vscode = undefined;
  }
}

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Minimum allowed value for maxImageSizeMB setting
 * Requirement: REQ-4.2
 */
export const MIN_MAX_IMAGE_SIZE_MB = 0.5;

/**
 * Maximum allowed value for maxImageSizeMB setting
 * Requirement: REQ-4.2
 */
export const MAX_MAX_IMAGE_SIZE_MB = 100;

/**
 * Minimum allowed value for confidenceThreshold setting
 * Requirement: REQ-4.2
 */
export const MIN_CONFIDENCE_THRESHOLD = 0;

/**
 * Maximum allowed value for confidenceThreshold setting
 * Requirement: REQ-4.2
 */
export const MAX_CONFIDENCE_THRESHOLD = 100;

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error for a specific setting
 */
export interface SettingValidationError {
  setting: string;
  value: unknown;
  message: string;
  validRange?: {
    min: number;
    max: number;
  };
}

/**
 * Result of configuration validation
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: SettingValidationError[];
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_MULTIMODAL_CONFIG: MultimodalInputConfig = {
  inferenceMode: "local",
  cloudEndpointUrl: "",
  localEnginePath: "",
  modelId: "default",
  maxImageSizeMB: 25,
  confidenceThreshold: 50,
  localOnlyMode: false,
  encryptAnalysisStorage: false,
  userConsentGiven: false,
  telemetryEnabled: false,
  telemetryEndpoint: "",
  maxConcurrentAnalyses: 10,
  queueLimit: 5,
};

// ============================================================================
// MultimodalConfigManager Class
// ============================================================================

/**
 * Configuration Manager for Multimodal Input Support
 * Provides access to extension configuration settings with validation
 * Requirements: REQ-4.1, REQ-4.2, REQ-4.3
 */
export class MultimodalConfigManager {
  private static readonly CONFIG_SECTION = "akira.multimodal";
  
  private cachedConfig: MultimodalInputConfig | null = null;
  private cachedValidation: ConfigValidationResult | null = null;
  private disposables: { dispose: () => void }[] = [];

  constructor() {
    // Listen for configuration changes
    if (this.isVSCodeAvailable() && vscode) {
      const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(MultimodalConfigManager.CONFIG_SECTION)) {
          this.invalidateCache();
        }
      });
      this.disposables.push(disposable);
    }
  }

  /**
   * Check if vscode is available
   */
  private isVSCodeAvailable(): boolean {
    return !!(vscode && vscode.workspace);
  }

  /**
   * Invalidate cached configuration
   */
  private invalidateCache(): void {
    this.cachedConfig = null;
    this.cachedValidation = null;
  }

  /**
   * Get the current multimodal configuration
   * Requirement: REQ-4.1
   */
  public getConfig(): MultimodalInputConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    if (this.isVSCodeAvailable() && vscode) {
      const config = vscode.workspace.getConfiguration(MultimodalConfigManager.CONFIG_SECTION);
      this.cachedConfig = {
        inferenceMode: config.get<InferenceMode>("inferenceMode", DEFAULT_MULTIMODAL_CONFIG.inferenceMode),
        cloudEndpointUrl: config.get<string>("cloudEndpointUrl", DEFAULT_MULTIMODAL_CONFIG.cloudEndpointUrl),
        localEnginePath: config.get<string>("localEnginePath", DEFAULT_MULTIMODAL_CONFIG.localEnginePath),
        modelId: config.get<string>("modelId", DEFAULT_MULTIMODAL_CONFIG.modelId),
        maxImageSizeMB: config.get<number>("maxImageSizeMB", DEFAULT_MULTIMODAL_CONFIG.maxImageSizeMB),
        confidenceThreshold: config.get<number>("confidenceThreshold", DEFAULT_MULTIMODAL_CONFIG.confidenceThreshold),
        localOnlyMode: config.get<boolean>("localOnlyMode", DEFAULT_MULTIMODAL_CONFIG.localOnlyMode),
        encryptAnalysisStorage: config.get<boolean>("encryptAnalysisStorage", DEFAULT_MULTIMODAL_CONFIG.encryptAnalysisStorage),
        userConsentGiven: config.get<boolean>("userConsentGiven", DEFAULT_MULTIMODAL_CONFIG.userConsentGiven),
        telemetryEnabled: config.get<boolean>("telemetryEnabled", DEFAULT_MULTIMODAL_CONFIG.telemetryEnabled),
        telemetryEndpoint: config.get<string>("telemetryEndpoint", DEFAULT_MULTIMODAL_CONFIG.telemetryEndpoint),
        maxConcurrentAnalyses: config.get<number>("maxConcurrentAnalyses", DEFAULT_MULTIMODAL_CONFIG.maxConcurrentAnalyses),
        queueLimit: config.get<number>("queueLimit", DEFAULT_MULTIMODAL_CONFIG.queueLimit),
      };
    } else {
      // Fallback to environment variables or defaults
      this.cachedConfig = {
        inferenceMode: (process.env.MULTIMODAL_INFERENCE_MODE as InferenceMode) || DEFAULT_MULTIMODAL_CONFIG.inferenceMode,
        cloudEndpointUrl: process.env.MULTIMODAL_CLOUD_ENDPOINT_URL || DEFAULT_MULTIMODAL_CONFIG.cloudEndpointUrl,
        localEnginePath: process.env.MULTIMODAL_LOCAL_ENGINE_PATH || DEFAULT_MULTIMODAL_CONFIG.localEnginePath,
        modelId: process.env.MULTIMODAL_MODEL_ID || DEFAULT_MULTIMODAL_CONFIG.modelId,
        maxImageSizeMB: parseFloat(process.env.MULTIMODAL_MAX_IMAGE_SIZE_MB || "") || DEFAULT_MULTIMODAL_CONFIG.maxImageSizeMB,
        confidenceThreshold: parseFloat(process.env.MULTIMODAL_CONFIDENCE_THRESHOLD || "") || DEFAULT_MULTIMODAL_CONFIG.confidenceThreshold,
        localOnlyMode: process.env.MULTIMODAL_LOCAL_ONLY_MODE === "true",
        encryptAnalysisStorage: process.env.MULTIMODAL_ENCRYPT_STORAGE === "true",
        userConsentGiven: process.env.MULTIMODAL_USER_CONSENT === "true",
        telemetryEnabled: process.env.MULTIMODAL_TELEMETRY_ENABLED === "true",
        telemetryEndpoint: process.env.MULTIMODAL_TELEMETRY_ENDPOINT || DEFAULT_MULTIMODAL_CONFIG.telemetryEndpoint,
        maxConcurrentAnalyses: parseInt(process.env.MULTIMODAL_MAX_CONCURRENT || "", 10) || DEFAULT_MULTIMODAL_CONFIG.maxConcurrentAnalyses,
        queueLimit: parseInt(process.env.MULTIMODAL_QUEUE_LIMIT || "", 10) || DEFAULT_MULTIMODAL_CONFIG.queueLimit,
      };
    }

    return this.cachedConfig;
  }

  /**
   * Validate a maxImageSizeMB value
   * Requirement: REQ-4.2
   * @param value - The value to validate
   * @returns Validation error if invalid, undefined if valid
   */
  public validateMaxImageSizeMB(value: number): SettingValidationError | undefined {
    if (typeof value !== "number" || isNaN(value)) {
      return {
        setting: "maxImageSizeMB",
        value,
        message: `maxImageSizeMB must be a number, got ${typeof value}`,
        validRange: { min: MIN_MAX_IMAGE_SIZE_MB, max: MAX_MAX_IMAGE_SIZE_MB },
      };
    }

    if (value < MIN_MAX_IMAGE_SIZE_MB || value > MAX_MAX_IMAGE_SIZE_MB) {
      return {
        setting: "maxImageSizeMB",
        value,
        message: `maxImageSizeMB must be between ${MIN_MAX_IMAGE_SIZE_MB} and ${MAX_MAX_IMAGE_SIZE_MB} MB, got ${value}`,
        validRange: { min: MIN_MAX_IMAGE_SIZE_MB, max: MAX_MAX_IMAGE_SIZE_MB },
      };
    }

    return undefined;
  }

  /**
   * Validate a confidenceThreshold value
   * Requirement: REQ-4.2
   * @param value - The value to validate
   * @returns Validation error if invalid, undefined if valid
   */
  public validateConfidenceThreshold(value: number): SettingValidationError | undefined {
    if (typeof value !== "number" || isNaN(value)) {
      return {
        setting: "confidenceThreshold",
        value,
        message: `confidenceThreshold must be a number, got ${typeof value}`,
        validRange: { min: MIN_CONFIDENCE_THRESHOLD, max: MAX_CONFIDENCE_THRESHOLD },
      };
    }

    if (value < MIN_CONFIDENCE_THRESHOLD || value > MAX_CONFIDENCE_THRESHOLD) {
      return {
        setting: "confidenceThreshold",
        value,
        message: `confidenceThreshold must be between ${MIN_CONFIDENCE_THRESHOLD} and ${MAX_CONFIDENCE_THRESHOLD}%, got ${value}`,
        validRange: { min: MIN_CONFIDENCE_THRESHOLD, max: MAX_CONFIDENCE_THRESHOLD },
      };
    }

    return undefined;
  }

  /**
   * Validate the current configuration
   * Requirement: REQ-4.2, REQ-4.3
   * @returns Validation result with any errors
   */
  public validateConfig(): ConfigValidationResult {
    if (this.cachedValidation) {
      return this.cachedValidation;
    }

    const config = this.getConfig();
    const errors: SettingValidationError[] = [];

    // Validate maxImageSizeMB
    const maxImageSizeError = this.validateMaxImageSizeMB(config.maxImageSizeMB);
    if (maxImageSizeError) {
      errors.push(maxImageSizeError);
    }

    // Validate confidenceThreshold
    const confidenceError = this.validateConfidenceThreshold(config.confidenceThreshold);
    if (confidenceError) {
      errors.push(confidenceError);
    }

    this.cachedValidation = {
      valid: errors.length === 0,
      errors,
    };

    return this.cachedValidation;
  }

  /**
   * Check if analysis can be initiated with current settings
   * Requirement: REQ-4.3
   * @returns true if settings are valid and analysis can proceed
   */
  public canInitiateAnalysis(): boolean {
    const validation = this.validateConfig();
    return validation.valid;
  }

  /**
   * Get validation errors that are blocking analysis
   * Requirement: REQ-4.3
   * @returns Array of validation errors, empty if none
   */
  public getBlockingErrors(): SettingValidationError[] {
    const validation = this.validateConfig();
    return validation.errors;
  }

  /**
   * Check if the configuration has invalid settings
   * Requirement: REQ-4.3
   * @returns true if there are invalid settings
   */
  public hasInvalidSettings(): boolean {
    return !this.canInitiateAnalysis();
  }

  /**
   * Register a callback for configuration changes
   * @param callback - Function to call when configuration changes
   * @returns Disposable to unregister the listener
   */
  public onConfigurationChanged(
    callback: (config: MultimodalInputConfig, validation: ConfigValidationResult) => void
  ): { dispose: () => void } {
    if (!this.isVSCodeAvailable() || !vscode) {
      return { dispose: () => {} };
    }

    const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(MultimodalConfigManager.CONFIG_SECTION)) {
        this.invalidateCache();
        callback(this.getConfig(), this.validateConfig());
      }
    });

    this.disposables.push(disposable);
    return disposable;
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.invalidateCache();
  }
}

