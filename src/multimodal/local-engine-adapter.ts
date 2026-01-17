/**
 * Local Engine Adapter for Multimodal Input Support
 * Requirements: REQ-3.2
 * 
 * Invokes a local analysis binary via CLI to perform image analysis
 * without sending data to external endpoints.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as crypto from "crypto";
import {
  AnalysisResult,
  LocalEngineConfig,
  AnalysisError,
} from "./types";

/**
 * Default configuration for local engine
 */
export const DEFAULT_LOCAL_ENGINE_CONFIG: LocalEngineConfig = {
  binaryPath: "image-analyzer",
  timeout: 30000, // 30 seconds
};

/**
 * Interface for Local Engine Adapter
 */
export interface ILocalEngineAdapter {
  /**
   * Execute local analysis binary
   * @param imagePath - Path to image file
   * @param modelId - Model identifier
   * @returns Analysis result from local engine
   */
  analyze(imagePath: string, modelId: string): Promise<AnalysisResult>;

  /**
   * Check if local engine binary is available
   * @returns True if binary exists and is executable
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Raw response structure expected from the local engine CLI
 */
interface LocalEngineRawResponse {
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
  error?: string;
}

/**
 * LocalEngineAdapter class for invoking local analysis binary
 * Implements REQ-3.2 (local engine invocation via documented CLI)
 */
export class LocalEngineAdapter implements ILocalEngineAdapter {
  private config: LocalEngineConfig;

  constructor(config: Partial<LocalEngineConfig> = {}) {
    this.config = { ...DEFAULT_LOCAL_ENGINE_CONFIG, ...config };
  }

  /**
   * Build CLI arguments for the local engine binary
   * @param imagePath - Path to image file
   * @param modelId - Model identifier
   * @returns Array of CLI arguments
   */
  buildCliArguments(imagePath: string, modelId: string): string[] {
    return [
      "--image", imagePath,
      "--model", modelId,
      "--output", "json"
    ];
  }

  /**
   * Parse the JSON output from the local engine
   * @param stdout - Raw stdout from the process
   * @param imagePath - Original image path
   * @param modelId - Model identifier used
   * @param duration - Analysis duration in milliseconds
   * @returns Parsed AnalysisResult
   */
  parseResult(
    stdout: string,
    imagePath: string,
    modelId: string,
    duration: number
  ): AnalysisResult {
    let rawResponse: LocalEngineRawResponse;
    
    try {
      rawResponse = JSON.parse(stdout.trim());
    } catch {
      throw this.createError(
        "LOCAL_ENGINE_NOT_FOUND",
        `Failed to parse local engine output as JSON: ${stdout.substring(0, 100)}`,
        { modelId }
      );
    }

    if (rawResponse.error) {
      throw this.createError(
        "LOCAL_ENGINE_NOT_FOUND",
        `Local engine returned error: ${rawResponse.error}`,
        { modelId }
      );
    }

    return {
      id: crypto.randomUUID(),
      imagePath,
      timestamp: new Date().toISOString(),
      modelId: rawResponse.modelId || modelId,
      inferenceMode: "local",
      duration,
      labels: rawResponse.labels || [],
      ocrText: rawResponse.ocrText,
      rawResponse,
    };
  }

  /**
   * Execute local analysis binary
   * @param imagePath - Path to image file
   * @param modelId - Model identifier
   * @returns Analysis result from local engine
   */
  async analyze(imagePath: string, modelId: string): Promise<AnalysisResult> {
    // Verify image file exists
    if (!fs.existsSync(imagePath)) {
      throw this.createError(
        "LOCAL_ENGINE_NOT_FOUND",
        `Image file not found: ${imagePath}`,
        { modelId }
      );
    }

    const startTime = Date.now();
    const args = this.buildCliArguments(imagePath, modelId);

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const process = spawn(this.config.binaryPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        process.kill("SIGTERM");
      }, this.config.timeout);

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("error", (err) => {
        clearTimeout(timeoutId);
        
        // Handle ENOENT (binary not found)
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(this.createError(
            "LOCAL_ENGINE_NOT_FOUND",
            `Local analysis binary not found: ${this.config.binaryPath}. Please ensure the binary is installed and available in PATH.`,
            { modelId }
          ));
        } else {
          reject(this.createError(
            "LOCAL_ENGINE_NOT_FOUND",
            `Failed to execute local engine: ${err.message}`,
            { modelId, stackTrace: err.stack }
          ));
        }
      });

      process.on("close", (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (timedOut) {
          reject(this.createError(
            "LOCAL_ENGINE_TIMEOUT",
            `Local engine analysis timed out after ${this.config.timeout}ms`,
            { modelId }
          ));
          return;
        }

        if (code !== 0) {
          reject(this.createError(
            "LOCAL_ENGINE_NOT_FOUND",
            `Local engine exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
            { modelId }
          ));
          return;
        }

        try {
          const result = this.parseResult(stdout, imagePath, modelId, duration);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Check if local engine binary is available
   * @returns True if binary exists and is executable
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.config.binaryPath, ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      process.on("error", () => {
        resolve(false);
      });

      process.on("close", (code) => {
        resolve(code === 0);
      });

      // Set a short timeout for availability check
      setTimeout(() => {
        process.kill("SIGTERM");
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Create a standardized AnalysisError
   */
  private createError(
    code: "LOCAL_ENGINE_NOT_FOUND" | "LOCAL_ENGINE_TIMEOUT",
    message: string,
    details?: {
      modelId?: string;
      stackTrace?: string;
    }
  ): AnalysisError {
    const recoveryActions: Record<string, string> = {
      LOCAL_ENGINE_NOT_FOUND: "Ensure the local analysis binary is installed and available in your PATH, or configure the correct binary path in settings.",
      LOCAL_ENGINE_TIMEOUT: "Try analyzing a smaller image or increase the timeout setting.",
    };

    return {
      code,
      message,
      details,
      recoveryAction: recoveryActions[code],
      retryable: code === "LOCAL_ENGINE_TIMEOUT",
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): LocalEngineConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  updateConfig(config: Partial<LocalEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default singleton instance
 */
export const localEngineAdapter = new LocalEngineAdapter();
