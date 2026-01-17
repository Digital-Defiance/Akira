/**
 * Telemetry Service for Multimodal Input Support
 * Requirements: REQ-8.1, REQ-8.3
 * 
 * Emits telemetry events when enabled, including anonymized payload size,
 * model id, inference mode, and duration. Implements non-blocking retry
 * behavior that never blocks analysis result display.
 */

import * as https from "https";
import {
  AnalysisResult,
  InferenceMode,
  RetryConfig,
  DEFAULT_TELEMETRY_RETRY_CONFIG,
} from "./types";

// ============================================================================
// Telemetry Types
// ============================================================================

/**
 * Telemetry event payload sent to the telemetry endpoint
 * Requirement: REQ-8.1
 */
export interface TelemetryEvent {
  /** Unique event identifier */
  eventId: string;
  /** Event type identifier */
  eventType: "analysis_completed";
  /** ISO timestamp of when the event occurred */
  timestamp: string;
  /** Anonymized payload size in bytes (rounded to nearest KB) */
  payloadSizeBytes: number;
  /** Model identifier used for analysis */
  modelId: string;
  /** Inference mode used (local or cloud) */
  inferenceMode: InferenceMode;
  /** Analysis duration in milliseconds */
  durationMs: number;
}

/**
 * Configuration for the telemetry service
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** HTTPS endpoint URL for telemetry submission */
  endpointUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Retry configuration */
  retryConfig: RetryConfig;
}

/**
 * Result of a telemetry submission attempt
 */
export interface TelemetrySubmissionResult {
  /** Whether the submission was successful */
  success: boolean;
  /** Number of attempts made */
  attempts: number;
  /** Error message if failed */
  error?: string;
  /** Whether the event was dropped after max retries */
  dropped: boolean;
}

/**
 * Interface for telemetry service
 */
export interface ITelemetryService {
  /**
   * Emit a telemetry event for a completed analysis
   * @param result - The analysis result to emit telemetry for
   * @param payloadSizeBytes - Size of the original image payload in bytes
   * @returns Promise that resolves when submission completes (never rejects)
   */
  emitAnalysisCompleted(
    result: AnalysisResult,
    payloadSizeBytes: number
  ): Promise<TelemetrySubmissionResult>;

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean;

  /**
   * Get pending submission count (for testing)
   */
  getPendingCount(): number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false,
  endpointUrl: "",
  timeout: 10000, // 10 seconds
  retryConfig: DEFAULT_TELEMETRY_RETRY_CONFIG,
};

// ============================================================================
// TelemetryService Class
// ============================================================================

/**
 * TelemetryService for emitting analysis telemetry events
 * Implements REQ-8.1 (telemetry event emission with required fields)
 * Implements REQ-8.3 (non-blocking retry behavior)
 */
export class TelemetryService implements ITelemetryService {
  private config: TelemetryConfig;
  private pendingSubmissions: number = 0;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = {
      ...DEFAULT_TELEMETRY_CONFIG,
      ...config,
      retryConfig: {
        ...DEFAULT_TELEMETRY_RETRY_CONFIG,
        ...config.retryConfig,
      },
    };
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.endpointUrl;
  }

  /**
   * Get pending submission count
   */
  getPendingCount(): number {
    return this.pendingSubmissions;
  }

  /**
   * Anonymize payload size by rounding to nearest KB
   * Requirement: REQ-8.1 (anonymized payload size)
   * @param sizeBytes - Original size in bytes
   * @returns Anonymized size rounded to nearest KB
   */
  anonymizePayloadSize(sizeBytes: number): number {
    // Round to nearest KB (1024 bytes)
    const kb = Math.round(sizeBytes / 1024);
    return kb * 1024;
  }

  /**
   * Create a telemetry event from an analysis result
   * Requirement: REQ-8.1
   * @param result - Analysis result
   * @param payloadSizeBytes - Original payload size in bytes
   * @returns TelemetryEvent with required fields
   */
  createTelemetryEvent(
    result: AnalysisResult,
    payloadSizeBytes: number
  ): TelemetryEvent {
    return {
      eventId: this.generateEventId(),
      eventType: "analysis_completed",
      timestamp: new Date().toISOString(),
      payloadSizeBytes: this.anonymizePayloadSize(payloadSizeBytes),
      modelId: result.modelId,
      inferenceMode: result.inferenceMode,
      durationMs: result.duration,
    };
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sleep for a specified duration
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Make an HTTPS POST request to the telemetry endpoint
   * @param event - Telemetry event to send
   * @returns Promise resolving to status code or rejecting on error
   */
  private makeRequest(event: TelemetryEvent): Promise<number> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(this.config.endpointUrl);
      } catch {
        reject(new Error(`Invalid telemetry endpoint URL: ${this.config.endpointUrl}`));
        return;
      }

      // Ensure HTTPS
      if (url.protocol !== "https:") {
        reject(new Error("Telemetry endpoint must use HTTPS"));
        return;
      }

      const requestBody = JSON.stringify(event);

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
        minVersion: "TLSv1.2",
      };

      const req = https.request(options, (res) => {
        // Consume response body to free up resources
        res.on("data", () => {});
        res.on("end", () => {
          resolve(res.statusCode || 0);
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timed out after ${this.config.timeout}ms`));
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Submit telemetry event with retry logic
   * Requirement: REQ-8.3 (retry up to 3 times asynchronously)
   * @param event - Telemetry event to submit
   * @returns Submission result
   */
  private async submitWithRetry(
    event: TelemetryEvent
  ): Promise<TelemetrySubmissionResult> {
    const { maxAttempts, backoffMs } = this.config.retryConfig;
    let attempts = 0;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;
      try {
        const statusCode = await this.makeRequest(event);

        // Success on 2xx response
        if (statusCode >= 200 && statusCode < 300) {
          return {
            success: true,
            attempts,
            dropped: false,
          };
        }

        // Non-retryable client error (4xx)
        if (statusCode >= 400 && statusCode < 500) {
          return {
            success: false,
            attempts,
            error: `Client error: HTTP ${statusCode}`,
            dropped: true,
          };
        }

        // Server error (5xx) - retry if attempts remain
        lastError = `Server error: HTTP ${statusCode}`;
        if (attempt < maxAttempts - 1) {
          const backoffTime = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
          await this.sleep(backoffTime);
        }
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt < maxAttempts - 1) {
          const backoffTime = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
          await this.sleep(backoffTime);
        }
      }
    }

    // All retries exhausted - drop the record (REQ-8.3)
    return {
      success: false,
      attempts,
      error: lastError,
      dropped: true,
    };
  }

  /**
   * Emit a telemetry event for a completed analysis
   * Requirement: REQ-8.1, REQ-8.3
   * 
   * This method is non-blocking and will never throw. It returns immediately
   * after starting the async submission process, ensuring analysis results
   * are never blocked by telemetry.
   * 
   * @param result - The analysis result to emit telemetry for
   * @param payloadSizeBytes - Size of the original image payload in bytes
   * @returns Promise that resolves when submission completes (never rejects)
   */
  async emitAnalysisCompleted(
    result: AnalysisResult,
    payloadSizeBytes: number
  ): Promise<TelemetrySubmissionResult> {
    // If telemetry is disabled, return immediately
    if (!this.isEnabled()) {
      return {
        success: false,
        attempts: 0,
        error: "Telemetry is disabled",
        dropped: true,
      };
    }

    // Create the telemetry event
    const event = this.createTelemetryEvent(result, payloadSizeBytes);

    // Track pending submission
    this.pendingSubmissions++;

    try {
      // Submit with retry (non-blocking to caller since we catch all errors)
      const result = await this.submitWithRetry(event);
      return result;
    } catch {
      // Should never reach here, but handle gracefully
      return {
        success: false,
        attempts: 0,
        error: "Unexpected error during telemetry submission",
        dropped: true,
      };
    } finally {
      this.pendingSubmissions--;
    }
  }

  /**
   * Emit telemetry without waiting for result (fire-and-forget)
   * This is the truly non-blocking version that returns immediately
   * Requirement: REQ-8.3 (never block analysis result display)
   * 
   * @param result - The analysis result to emit telemetry for
   * @param payloadSizeBytes - Size of the original image payload in bytes
   */
  emitAnalysisCompletedAsync(
    result: AnalysisResult,
    payloadSizeBytes: number
  ): void {
    // Fire and forget - don't await
    this.emitAnalysisCompleted(result, payloadSizeBytes).catch(() => {
      // Silently ignore errors - telemetry should never affect main flow
    });
  }

  /**
   * Get the current configuration
   */
  getConfig(): TelemetryConfig {
    return {
      ...this.config,
      retryConfig: { ...this.config.retryConfig },
    };
  }

  /**
   * Update the configuration
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      retryConfig: {
        ...this.config.retryConfig,
        ...config.retryConfig,
      },
    };
  }
}

/**
 * Create a telemetry service with the given configuration
 */
export function createTelemetryService(
  config: Partial<TelemetryConfig> = {}
): TelemetryService {
  return new TelemetryService(config);
}
