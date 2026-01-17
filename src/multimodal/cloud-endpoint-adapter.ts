/**
 * Cloud Endpoint Adapter for Multimodal Input Support
 * Requirements: REQ-3.1, REQ-3.3, REQ-9.4
 * 
 * Sends images to cloud inference endpoints via HTTPS POST with retry logic.
 * Ensures TLS 1.2+ and no tokens in query parameters for security.
 */

import * as https from "https";
import * as crypto from "crypto";
import {
  AnalysisResult,
  CloudEndpointConfig,
  RetryConfig,
  AnalysisError,
  DEFAULT_CLOUD_RETRY_CONFIG,
} from "./types";

/**
 * Default configuration for cloud endpoint
 */
export const DEFAULT_CLOUD_ENDPOINT_CONFIG: CloudEndpointConfig = {
  endpointUrl: "",
  timeout: 30000, // 30 seconds
  retryConfig: DEFAULT_CLOUD_RETRY_CONFIG,
};

/**
 * Interface for Cloud Endpoint Adapter
 */
export interface ICloudEndpointAdapter {
  /**
   * Send image to cloud inference endpoint
   * @param imageData - Base64 encoded image data
   * @param modelId - Model identifier
   * @returns Analysis result from cloud endpoint
   */
  analyze(imageData: string, modelId: string): Promise<AnalysisResult>;

  /**
   * Check endpoint health
   * @returns True if endpoint is reachable
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Raw response structure expected from the cloud endpoint
 */
interface CloudEndpointRawResponse {
  labels?: Array<{
    label: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  ocrText?: string;
  modelId?: string;
  error?: {
    code: string;
    message: string;
  };
}


/**
 * CloudEndpointAdapter class for sending images to cloud inference endpoints
 * Implements REQ-3.1 (cloud inference via HTTPS POST)
 * Implements REQ-3.3 (retry with exponential backoff for 5xx errors)
 * Implements REQ-9.4 (TLS 1.2+ and no tokens in query parameters)
 */
export class CloudEndpointAdapter implements ICloudEndpointAdapter {
  private config: CloudEndpointConfig;

  constructor(config: Partial<CloudEndpointConfig> = {}) {
    this.config = { 
      ...DEFAULT_CLOUD_ENDPOINT_CONFIG, 
      ...config,
      retryConfig: {
        ...DEFAULT_CLOUD_RETRY_CONFIG,
        ...config.retryConfig,
      }
    };
  }

  /**
   * Validate that the endpoint URL uses HTTPS (TLS 1.2+)
   * Requirement: REQ-9.4
   * @param url - URL to validate
   * @throws AnalysisError if URL is not HTTPS or contains query parameters with tokens
   */
  validateEndpointUrl(url: string): void {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw this.createError(
        "ENDPOINT_UNREACHABLE",
        `Invalid endpoint URL: ${url}`,
        { endpointUrl: url }
      );
    }

    // Ensure HTTPS protocol (TLS 1.2+)
    if (parsedUrl.protocol !== "https:") {
      throw this.createError(
        "ENDPOINT_UNREACHABLE",
        `Endpoint URL must use HTTPS for secure transport: ${url}`,
        { endpointUrl: url }
      );
    }

    // Check for authentication tokens in query parameters (REQ-9.4)
    const sensitiveParams = ["token", "api_key", "apikey", "key", "secret", "auth", "password", "access_token"];
    for (const param of sensitiveParams) {
      if (parsedUrl.searchParams.has(param)) {
        throw this.createError(
          "ENDPOINT_UNREACHABLE",
          `Authentication tokens must not be included in query parameters. Found: ${param}`,
          { endpointUrl: url }
        );
      }
    }
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make an HTTPS POST request to the endpoint
   * @param imageData - Base64 encoded image data
   * @param modelId - Model identifier
   * @returns Raw response from the endpoint
   */
  private async makeRequest(
    imageData: string,
    modelId: string
  ): Promise<{ statusCode: number; body: string }> {
    const url = new URL(this.config.endpointUrl);
    
    const requestBody = JSON.stringify({
      image: imageData,
      modelId: modelId,
    });

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
      timeout: this.config.timeout,
      // Enforce TLS 1.2 minimum (REQ-9.4)
      minVersion: "TLSv1.2",
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body,
          });
        });
      });

      req.on("error", (err) => {
        reject(this.createError(
          "ENDPOINT_UNREACHABLE",
          `Failed to connect to endpoint: ${err.message}`,
          { endpointUrl: this.config.endpointUrl }
        ));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(this.createError(
          "ENDPOINT_UNREACHABLE",
          `Request timed out after ${this.config.timeout}ms`,
          { endpointUrl: this.config.endpointUrl }
        ));
      });

      req.write(requestBody);
      req.end();
    });
  }


  /**
   * Parse the JSON response from the cloud endpoint
   * @param body - Raw response body
   * @param modelId - Model identifier used
   * @param duration - Analysis duration in milliseconds
   * @returns Parsed AnalysisResult
   */
  parseResult(
    body: string,
    modelId: string,
    duration: number
  ): AnalysisResult {
    let rawResponse: CloudEndpointRawResponse;
    
    try {
      rawResponse = JSON.parse(body);
    } catch {
      throw this.createError(
        "ENDPOINT_ERROR_4XX",
        `Failed to parse endpoint response as JSON: ${body.substring(0, 100)}`,
        { endpointUrl: this.config.endpointUrl, modelId }
      );
    }

    if (rawResponse.error) {
      throw this.createError(
        "ENDPOINT_ERROR_4XX",
        `Endpoint returned error: ${rawResponse.error.message}`,
        { 
          endpointUrl: this.config.endpointUrl, 
          modelId,
          httpStatus: 400,
        }
      );
    }

    return {
      id: crypto.randomUUID(),
      imagePath: "", // Will be set by caller
      timestamp: new Date().toISOString(),
      modelId: rawResponse.modelId || modelId,
      inferenceMode: "cloud",
      duration,
      labels: rawResponse.labels || [],
      ocrText: rawResponse.ocrText,
      rawResponse,
    };
  }

  /**
   * Send image to cloud inference endpoint with retry logic
   * Implements REQ-3.3 (retry with exponential backoff for 5xx errors)
   * @param imageData - Base64 encoded image data
   * @param modelId - Model identifier
   * @returns Analysis result from cloud endpoint
   */
  async analyze(imageData: string, modelId: string): Promise<AnalysisResult> {
    // Validate endpoint URL before making request
    this.validateEndpointUrl(this.config.endpointUrl);

    const { maxAttempts, backoffMs } = this.config.retryConfig;
    let lastError: AnalysisError | null = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest(imageData, modelId);
        const duration = Date.now() - startTime;

        // Handle successful response (2xx)
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return this.parseResult(response.body, modelId, duration);
        }

        // Handle client errors (4xx) - don't retry
        if (response.statusCode >= 400 && response.statusCode < 500) {
          throw this.createError(
            "ENDPOINT_ERROR_4XX",
            `Endpoint returned client error: HTTP ${response.statusCode}`,
            { 
              endpointUrl: this.config.endpointUrl, 
              httpStatus: response.statusCode,
              modelId,
            }
          );
        }

        // Handle server errors (5xx) - retry with backoff
        if (response.statusCode >= 500) {
          lastError = this.createError(
            "ENDPOINT_ERROR_5XX",
            `Endpoint returned server error: HTTP ${response.statusCode}`,
            { 
              endpointUrl: this.config.endpointUrl, 
              httpStatus: response.statusCode,
              modelId,
            }
          );

          // If we have more attempts, wait and retry
          if (attempt < maxAttempts - 1) {
            const backoffTime = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
            await this.sleep(backoffTime);
            continue;
          }
        }
      } catch (err) {
        // If it's already an AnalysisError, check if retryable
        if (this.isAnalysisError(err)) {
          if (!err.retryable || attempt >= maxAttempts - 1) {
            throw err;
          }
          lastError = err;
          const backoffTime = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
          await this.sleep(backoffTime);
          continue;
        }
        // Unknown error, wrap and throw
        throw this.createError(
          "ENDPOINT_UNREACHABLE",
          `Unexpected error: ${(err as Error).message}`,
          { endpointUrl: this.config.endpointUrl, modelId }
        );
      }
    }

    // All retries exhausted
    if (lastError) {
      lastError.message = `${lastError.message} (after ${maxAttempts} attempts)`;
      lastError.retryable = false;
      throw lastError;
    }

    throw this.createError(
      "ENDPOINT_UNREACHABLE",
      `Failed to reach endpoint after ${maxAttempts} attempts`,
      { endpointUrl: this.config.endpointUrl, modelId }
    );
  }


  /**
   * Check if endpoint is reachable
   * @returns True if endpoint is reachable
   */
  async isAvailable(): Promise<boolean> {
    if (!this.config.endpointUrl) {
      return false;
    }

    try {
      this.validateEndpointUrl(this.config.endpointUrl);
    } catch {
      return false;
    }

    const url = new URL(this.config.endpointUrl);
    
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "HEAD",
        timeout: 5000,
        minVersion: "TLSv1.2",
      };

      const req = https.request(options, (res) => {
        // Any response means the endpoint is reachable
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });

      req.on("error", () => {
        resolve(false);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Type guard for AnalysisError
   */
  private isAnalysisError(err: unknown): err is AnalysisError {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      "message" in err &&
      "retryable" in err
    );
  }

  /**
   * Create a standardized AnalysisError
   */
  private createError(
    code: "ENDPOINT_UNREACHABLE" | "ENDPOINT_ERROR_5XX" | "ENDPOINT_ERROR_4XX",
    message: string,
    details?: {
      endpointUrl?: string;
      httpStatus?: number;
      modelId?: string;
      stackTrace?: string;
    }
  ): AnalysisError {
    const recoveryActions: Record<string, string> = {
      ENDPOINT_UNREACHABLE: "Check your network connection and verify the endpoint URL is correct.",
      ENDPOINT_ERROR_5XX: "The server is experiencing issues. Please try again later.",
      ENDPOINT_ERROR_4XX: "Check the request parameters and ensure the model ID is valid.",
    };

    return {
      code,
      message,
      details,
      recoveryAction: recoveryActions[code],
      retryable: code === "ENDPOINT_ERROR_5XX" || code === "ENDPOINT_UNREACHABLE",
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): CloudEndpointConfig {
    return { 
      ...this.config,
      retryConfig: { ...this.config.retryConfig }
    };
  }

  /**
   * Update the configuration
   */
  updateConfig(config: Partial<CloudEndpointConfig>): void {
    this.config = { 
      ...this.config, 
      ...config,
      retryConfig: {
        ...this.config.retryConfig,
        ...config.retryConfig,
      }
    };
  }

  /**
   * Get retry configuration (for testing)
   */
  getRetryConfig(): RetryConfig {
    return { ...this.config.retryConfig };
  }
}

/**
 * Create a cloud endpoint adapter with the given configuration
 */
export function createCloudEndpointAdapter(
  config: Partial<CloudEndpointConfig> = {}
): CloudEndpointAdapter {
  return new CloudEndpointAdapter(config);
}
