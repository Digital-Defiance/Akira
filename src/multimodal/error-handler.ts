/**
 * Centralized Error Handler for Multimodal Input Support
 * Requirements: REQ-6.2
 * 
 * Provides centralized error handling with detailed messages and recovery actions.
 * Handles model validation errors with endpoint error code and model id.
 */

import { AnalysisError, AnalysisErrorCode } from "./types";

/**
 * Model validation error response from inference endpoint
 */
export interface ModelValidationErrorResponse {
  errorCode: string;
  message: string;
  modelId?: string;
  details?: Record<string, unknown>;
}

/**
 * Formatted error message with recovery action
 */
export interface FormattedError {
  title: string;
  message: string;
  details: string[];
  recoveryAction: string;
  originalError: AnalysisError;
}

/**
 * Recovery action definitions for each error code
 */
const RECOVERY_ACTIONS: Record<AnalysisErrorCode, string> = {
  INVALID_MIME_TYPE: "Please select an image file with one of the supported formats: PNG, JPEG, WebP, or GIF.",
  FILE_TOO_LARGE: "Please select a smaller image file or reduce the image size before analysis.",
  FILE_NOT_FOUND: "Please verify the file path and ensure the image file exists.",
  INVALID_SETTING: "Please correct the invalid settings in the extension configuration.",
  ENDPOINT_UNREACHABLE: "Check your network connection and verify the endpoint URL is correct.",
  ENDPOINT_ERROR_5XX: "The server is experiencing issues. Please try again later.",
  ENDPOINT_ERROR_4XX: "Check the request parameters and ensure the model ID is valid.",
  LOCAL_ENGINE_NOT_FOUND: "Ensure the local analysis binary is installed and available in your PATH.",
  LOCAL_ENGINE_TIMEOUT: "Try analyzing a smaller image or increase the timeout setting.",
  STORAGE_WRITE_FAILED: "Check file permissions and available disk space.",
  ENCRYPTION_FAILED: "Verify the encryption key is correctly configured.",
  PLUGIN_LOAD_FAILED: "Check the plugin configuration and ensure the plugin file exists.",
  PLUGIN_EXECUTION_ERROR: "Review the plugin code for errors. Check the output pane for details.",
  CONSENT_REQUIRED: "Please provide consent to use external inference endpoints.",
};

/**
 * Error titles for user-friendly display
 */
const ERROR_TITLES: Record<AnalysisErrorCode, string> = {
  INVALID_MIME_TYPE: "Unsupported Image Format",
  FILE_TOO_LARGE: "Image File Too Large",
  FILE_NOT_FOUND: "Image File Not Found",
  INVALID_SETTING: "Invalid Configuration",
  ENDPOINT_UNREACHABLE: "Endpoint Unreachable",
  ENDPOINT_ERROR_5XX: "Server Error",
  ENDPOINT_ERROR_4XX: "Request Error",
  LOCAL_ENGINE_NOT_FOUND: "Local Engine Not Found",
  LOCAL_ENGINE_TIMEOUT: "Analysis Timeout",
  STORAGE_WRITE_FAILED: "Storage Error",
  ENCRYPTION_FAILED: "Encryption Error",
  PLUGIN_LOAD_FAILED: "Plugin Load Error",
  PLUGIN_EXECUTION_ERROR: "Plugin Execution Error",
  CONSENT_REQUIRED: "Consent Required",
};

/**
 * Interface for Error Handler
 */
export interface IErrorHandler {
  /**
   * Create an AnalysisError from a model validation error response
   * @param response - Model validation error response from endpoint
   * @param requestModelId - Model ID used in the original request
   * @param endpointUrl - URL of the endpoint that returned the error
   * @returns AnalysisError with detailed information
   */
  createModelValidationError(
    response: ModelValidationErrorResponse,
    requestModelId: string,
    endpointUrl?: string
  ): AnalysisError;

  /**
   * Format an AnalysisError for user display
   * @param error - The analysis error to format
   * @returns Formatted error with title, message, details, and recovery action
   */
  formatError(error: AnalysisError): FormattedError;

  /**
   * Create a standardized AnalysisError
   * @param code - Error code
   * @param message - Error message
   * @param details - Additional error details
   * @returns AnalysisError with recovery action
   */
  createError(
    code: AnalysisErrorCode,
    message: string,
    details?: AnalysisError["details"]
  ): AnalysisError;

  /**
   * Check if an error is retryable
   * @param error - The error to check
   * @returns True if the error can be retried
   */
  isRetryable(error: AnalysisError): boolean;

  /**
   * Get the recovery action for an error code
   * @param code - Error code
   * @returns Recovery action string
   */
  getRecoveryAction(code: AnalysisErrorCode): string;
}

/**
 * Centralized Error Handler class
 * Implements REQ-6.2 (model validation error handling with endpoint error code and model id)
 */
export class ErrorHandler implements IErrorHandler {
  /**
   * Create an AnalysisError from a model validation error response
   * Requirement: REQ-6.2 - Display endpoint's error code and model identifier
   * 
   * @param response - Model validation error response from endpoint
   * @param requestModelId - Model ID used in the original request
   * @param endpointUrl - URL of the endpoint that returned the error
   * @returns AnalysisError with detailed information including error code and model id
   */
  createModelValidationError(
    response: ModelValidationErrorResponse,
    requestModelId: string,
    endpointUrl?: string
  ): AnalysisError {
    // Use the model ID from the response if available, otherwise use the request model ID
    const modelId = response.modelId || requestModelId;
    
    // Build the error message including the endpoint's error code and model id
    const message = this.buildModelValidationMessage(response.errorCode, modelId, response.message);

    return {
      code: "ENDPOINT_ERROR_4XX",
      message,
      details: {
        modelId,
        endpointUrl,
        httpStatus: 400, // Model validation errors are typically 4xx
      },
      recoveryAction: this.getRecoveryAction("ENDPOINT_ERROR_4XX"),
      retryable: false,
    };
  }

  /**
   * Build a detailed message for model validation errors
   * @param errorCode - Error code from the endpoint
   * @param modelId - Model identifier
   * @param originalMessage - Original error message from endpoint
   * @returns Formatted error message
   */
  private buildModelValidationMessage(
    errorCode: string,
    modelId: string,
    originalMessage: string
  ): string {
    return `Model validation failed [${errorCode}]: ${originalMessage} (Model ID: ${modelId})`;
  }

  /**
   * Format an AnalysisError for user display
   * @param error - The analysis error to format
   * @returns Formatted error with title, message, details, and recovery action
   */
  formatError(error: AnalysisError): FormattedError {
    const title = ERROR_TITLES[error.code] || "Analysis Error";
    const details = this.buildErrorDetails(error);
    const recoveryAction = error.recoveryAction || this.getRecoveryAction(error.code);

    return {
      title,
      message: error.message,
      details,
      recoveryAction,
      originalError: error,
    };
  }

  /**
   * Build detailed error information array
   * @param error - The analysis error
   * @returns Array of detail strings
   */
  private buildErrorDetails(error: AnalysisError): string[] {
    const details: string[] = [];

    if (error.details) {
      if (error.details.modelId) {
        details.push(`Model ID: ${error.details.modelId}`);
      }
      if (error.details.endpointUrl) {
        details.push(`Endpoint: ${error.details.endpointUrl}`);
      }
      if (error.details.httpStatus) {
        details.push(`HTTP Status: ${error.details.httpStatus}`);
      }
      if (error.details.detectedMimeType) {
        details.push(`Detected MIME Type: ${error.details.detectedMimeType}`);
      }
      if (error.details.acceptedMimeTypes && error.details.acceptedMimeTypes.length > 0) {
        details.push(`Accepted MIME Types: ${error.details.acceptedMimeTypes.join(", ")}`);
      }
      if (error.details.maxSizeBytes) {
        details.push(`Max Size: ${(error.details.maxSizeBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
      if (error.details.actualSizeBytes) {
        details.push(`Actual Size: ${(error.details.actualSizeBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
      if (error.details.pluginId) {
        details.push(`Plugin ID: ${error.details.pluginId}`);
      }
    }

    return details;
  }

  /**
   * Create a standardized AnalysisError
   * @param code - Error code
   * @param message - Error message
   * @param details - Additional error details
   * @returns AnalysisError with recovery action
   */
  createError(
    code: AnalysisErrorCode,
    message: string,
    details?: AnalysisError["details"]
  ): AnalysisError {
    return {
      code,
      message,
      details,
      recoveryAction: this.getRecoveryAction(code),
      retryable: this.isCodeRetryable(code),
    };
  }

  /**
   * Check if an error is retryable
   * @param error - The error to check
   * @returns True if the error can be retried
   */
  isRetryable(error: AnalysisError): boolean {
    return error.retryable;
  }

  /**
   * Check if an error code is retryable
   * @param code - Error code
   * @returns True if the error code is retryable
   */
  private isCodeRetryable(code: AnalysisErrorCode): boolean {
    const retryableCodes: AnalysisErrorCode[] = [
      "ENDPOINT_ERROR_5XX",
      "ENDPOINT_UNREACHABLE",
      "LOCAL_ENGINE_TIMEOUT",
    ];
    return retryableCodes.includes(code);
  }

  /**
   * Get the recovery action for an error code
   * @param code - Error code
   * @returns Recovery action string
   */
  getRecoveryAction(code: AnalysisErrorCode): string {
    return RECOVERY_ACTIONS[code] || "Please try again or contact support if the issue persists.";
  }

  /**
   * Get the error title for an error code
   * @param code - Error code
   * @returns Error title string
   */
  getErrorTitle(code: AnalysisErrorCode): string {
    return ERROR_TITLES[code] || "Analysis Error";
  }

  /**
   * Parse a model validation error from endpoint response body
   * @param responseBody - Raw response body from endpoint
   * @param requestModelId - Model ID used in the request
   * @param endpointUrl - URL of the endpoint
   * @returns AnalysisError if response contains a model validation error, null otherwise
   */
  parseModelValidationError(
    responseBody: string,
    requestModelId: string,
    endpointUrl?: string
  ): AnalysisError | null {
    try {
      const parsed = JSON.parse(responseBody);
      
      // Check if this is a model validation error response
      if (parsed.error && typeof parsed.error === "object") {
        const errorResponse: ModelValidationErrorResponse = {
          errorCode: parsed.error.code || "UNKNOWN_ERROR",
          message: parsed.error.message || "Unknown model validation error",
          modelId: parsed.error.modelId || parsed.modelId,
          details: parsed.error.details,
        };
        
        return this.createModelValidationError(errorResponse, requestModelId, endpointUrl);
      }
      
      // Check for top-level error code (alternative format)
      if (parsed.errorCode && parsed.message) {
        const errorResponse: ModelValidationErrorResponse = {
          errorCode: parsed.errorCode,
          message: parsed.message,
          modelId: parsed.modelId,
          details: parsed.details,
        };
        
        return this.createModelValidationError(errorResponse, requestModelId, endpointUrl);
      }
      
      return null;
    } catch {
      // Not a valid JSON response or not a model validation error
      return null;
    }
  }
}

/**
 * Default singleton instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Create an error handler instance
 */
export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}
