/**
 * Analysis Router for Multimodal Input Support
 * Requirements: REQ-3.1, REQ-3.2, REQ-3.4
 * 
 * Routes analysis requests to the appropriate backend (local or cloud)
 * based on the configured inference mode.
 */

import * as fs from "fs";
import {
  AnalysisRequest,
  AnalysisResult,
  InferenceMode,
  AnalysisError,
} from "./types";
import { LocalEngineAdapter, ILocalEngineAdapter } from "./local-engine-adapter";
import { CloudEndpointAdapter, ICloudEndpointAdapter } from "./cloud-endpoint-adapter";

/**
 * Interface for Analysis Router
 */
export interface IAnalysisRouter {
  /**
   * Route analysis request to appropriate backend
   * @param request - Analysis request with configuration
   * @returns Analysis result from selected backend
   */
  route(request: AnalysisRequest): Promise<AnalysisResult>;

  /**
   * Check if the configured backend is available
   * @param mode - Inference mode to check
   * @returns True if backend is available
   */
  isBackendAvailable(mode: InferenceMode): Promise<boolean>;
}

/**
 * Configuration for the Analysis Router
 */
export interface AnalysisRouterConfig {
  localEngineAdapter?: ILocalEngineAdapter;
  cloudEndpointAdapter?: ICloudEndpointAdapter;
}

/**
 * AnalysisRouter class for routing requests to appropriate backends
 * Implements REQ-3.1 (cloud inference routing)
 * Implements REQ-3.2 (local engine routing)
 * Implements REQ-3.4 (mode persistence and immediate application)
 */
export class AnalysisRouter implements IAnalysisRouter {
  private localEngineAdapter: ILocalEngineAdapter;
  private cloudEndpointAdapter: ICloudEndpointAdapter;
  
  // Track the last used mode for persistence verification
  private lastUsedMode: InferenceMode | null = null;

  constructor(config: AnalysisRouterConfig = {}) {
    this.localEngineAdapter = config.localEngineAdapter || new LocalEngineAdapter();
    this.cloudEndpointAdapter = config.cloudEndpointAdapter || new CloudEndpointAdapter();
  }

  /**
   * Route analysis request to appropriate backend based on inference mode
   * Requirement: REQ-3.1, REQ-3.2, REQ-3.4
   * @param request - Analysis request with configuration
   * @returns Analysis result from selected backend
   */
  async route(request: AnalysisRequest): Promise<AnalysisResult> {
    const { inferenceMode, imagePath, modelId } = request;

    // Validate image path exists
    if (!fs.existsSync(imagePath)) {
      throw this.createError(
        "FILE_NOT_FOUND",
        `Image file not found: ${imagePath}`,
        { modelId }
      );
    }

    // Check backend availability before routing
    const isAvailable = await this.isBackendAvailable(inferenceMode);
    if (!isAvailable) {
      const backendName = inferenceMode === "cloud" ? "Cloud endpoint" : "Local engine";
      throw this.createError(
        inferenceMode === "cloud" ? "ENDPOINT_UNREACHABLE" : "LOCAL_ENGINE_NOT_FOUND",
        `${backendName} is not available. Please check your configuration.`,
        { modelId }
      );
    }

    // Update last used mode for persistence tracking (REQ-3.4)
    this.lastUsedMode = inferenceMode;

    // Route to appropriate backend
    let result: AnalysisResult;
    
    if (inferenceMode === "cloud") {
      // Route to cloud endpoint (REQ-3.1)
      const imageData = await this.readImageAsBase64(imagePath);
      result = await this.cloudEndpointAdapter.analyze(imageData, modelId);
      // Set the image path since cloud adapter doesn't have it
      result.imagePath = imagePath;
    } else {
      // Route to local engine (REQ-3.2)
      result = await this.localEngineAdapter.analyze(imagePath, modelId);
    }

    return result;
  }

  /**
   * Check if the configured backend is available
   * @param mode - Inference mode to check
   * @returns True if backend is available
   */
  async isBackendAvailable(mode: InferenceMode): Promise<boolean> {
    if (mode === "cloud") {
      return this.cloudEndpointAdapter.isAvailable();
    } else {
      return this.localEngineAdapter.isAvailable();
    }
  }

  /**
   * Get the last used inference mode
   * Useful for verifying mode persistence (REQ-3.4)
   */
  getLastUsedMode(): InferenceMode | null {
    return this.lastUsedMode;
  }

  /**
   * Read image file and encode as base64
   * @param imagePath - Path to image file
   * @returns Base64 encoded image data
   */
  private async readImageAsBase64(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          reject(this.createError(
            "FILE_NOT_FOUND",
            `Failed to read image file: ${err.message}`,
            {}
          ));
          return;
        }
        resolve(data.toString("base64"));
      });
    });
  }

  /**
   * Create a standardized AnalysisError
   */
  private createError(
    code: "FILE_NOT_FOUND" | "ENDPOINT_UNREACHABLE" | "LOCAL_ENGINE_NOT_FOUND",
    message: string,
    details?: {
      modelId?: string;
      endpointUrl?: string;
    }
  ): AnalysisError {
    const recoveryActions: Record<string, string> = {
      FILE_NOT_FOUND: "Verify the image file exists and the path is correct.",
      ENDPOINT_UNREACHABLE: "Check your network connection and verify the cloud endpoint URL is configured correctly.",
      LOCAL_ENGINE_NOT_FOUND: "Ensure the local analysis binary is installed and available in your PATH.",
    };

    return {
      code,
      message,
      details,
      recoveryAction: recoveryActions[code],
      retryable: code === "ENDPOINT_UNREACHABLE",
    };
  }

  /**
   * Update the local engine adapter
   */
  setLocalEngineAdapter(adapter: ILocalEngineAdapter): void {
    this.localEngineAdapter = adapter;
  }

  /**
   * Update the cloud endpoint adapter
   */
  setCloudEndpointAdapter(adapter: ICloudEndpointAdapter): void {
    this.cloudEndpointAdapter = adapter;
  }
}

/**
 * Create an analysis router with the given configuration
 */
export function createAnalysisRouter(
  config: AnalysisRouterConfig = {}
): AnalysisRouter {
  return new AnalysisRouter(config);
}
