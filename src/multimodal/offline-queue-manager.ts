/**
 * Offline Queue Manager for Multimodal Input Support
 * Requirements: REQ-6.3
 * 
 * Manages cloud analysis requests when offline by queuing them locally
 * and processing them when network connectivity returns.
 */

import { AnalysisRequest, AnalysisResult } from "./types";

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
// Types
// ============================================================================

/**
 * Network connectivity state
 */
export type NetworkState = "online" | "offline" | "unknown";

/**
 * Queued request entry with metadata
 */
export interface QueuedCloudRequest {
  /** Unique identifier for the queued request */
  id: string;
  /** The original analysis request */
  request: AnalysisRequest;
  /** Timestamp when the request was queued (ISO string) */
  queuedAt: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Promise resolve function */
  resolve: (result: AnalysisResult) => void;
  /** Promise reject function */
  reject: (error: Error) => void;
}

/**
 * Configuration for the Offline Queue Manager
 */
export interface OfflineQueueManagerConfig {
  /** Maximum number of requests to queue (default: 50) */
  maxQueueSize: number;
  /** Interval in ms to check network connectivity (default: 5000) */
  connectivityCheckInterval: number;
  /** Maximum retry attempts per request (default: 3) */
  maxRetryAttempts: number;
}

/**
 * Status bar update callback type
 */
export type StatusBarUpdateCallback = (queuedCount: number, networkState: NetworkState) => void;

/**
 * Cloud request executor function type
 */
export type CloudRequestExecutor = (request: AnalysisRequest) => Promise<AnalysisResult>;

/**
 * Network connectivity checker function type
 */
export type NetworkConnectivityChecker = () => Promise<boolean>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_OFFLINE_QUEUE_CONFIG: OfflineQueueManagerConfig = {
  maxQueueSize: 50,
  connectivityCheckInterval: 5000,
  maxRetryAttempts: 3,
};

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for offline queue failures
 */
export type OfflineQueueErrorCode = "QUEUE_FULL" | "REQUEST_EXPIRED" | "MAX_RETRIES_EXCEEDED";

/**
 * Error thrown when offline queue operations fail
 */
export class OfflineQueueError extends Error {
  code: OfflineQueueErrorCode;
  details: {
    queueSize: number;
    maxQueueSize: number;
    requestId?: string;
    retryCount?: number;
  };

  constructor(
    code: OfflineQueueErrorCode,
    message: string,
    details: {
      queueSize: number;
      maxQueueSize: number;
      requestId?: string;
      retryCount?: number;
    }
  ) {
    super(message);
    this.name = "OfflineQueueError";
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Interface for Offline Queue Manager
 */
export interface IOfflineQueueManager {
  /**
   * Submit a cloud request, queuing it if offline
   * @param request - Analysis request to submit
   * @param executor - Function to execute the cloud request
   * @returns Promise resolving to analysis result
   */
  submitCloudRequest(
    request: AnalysisRequest,
    executor: CloudRequestExecutor
  ): Promise<AnalysisResult>;

  /**
   * Get the current network connectivity state
   * @returns Current network state
   */
  getNetworkState(): NetworkState;

  /**
   * Get the number of queued requests
   * @returns Number of requests in the queue
   */
  getQueuedCount(): number;

  /**
   * Check if the system is currently online
   * @returns true if online
   */
  isOnline(): boolean;

  /**
   * Start monitoring network connectivity
   */
  startMonitoring(): void;

  /**
   * Stop monitoring network connectivity
   */
  stopMonitoring(): void;

  /**
   * Set callback for status bar updates
   * @param callback - Function to call when queue state changes
   */
  setStatusBarCallback(callback: StatusBarUpdateCallback): void;

  /**
   * Clear all queued requests
   */
  clearQueue(): void;

  /**
   * Dispose of resources
   */
  dispose(): void;
}

// ============================================================================
// OfflineQueueManager Class
// ============================================================================

/**
 * OfflineQueueManager class for managing cloud requests when offline
 * Implements REQ-6.3 (offline request queuing and retry on connectivity return)
 */
export class OfflineQueueManager implements IOfflineQueueManager {
  private config: OfflineQueueManagerConfig;
  private networkState: NetworkState = "unknown";
  private queue: QueuedCloudRequest[] = [];
  private statusBarCallback: StatusBarUpdateCallback | null = null;
  private connectivityChecker: NetworkConnectivityChecker | null = null;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private requestIdCounter = 0;
  private statusBarItem: { text: string; show: () => void; hide: () => void; dispose: () => void } | null = null;
  private isProcessingQueue = false;

  constructor(config: Partial<OfflineQueueManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_OFFLINE_QUEUE_CONFIG,
      ...config,
    };
    this.initializeStatusBar();
  }

  /**
   * Initialize VS Code status bar item
   */
  private initializeStatusBar(): void {
    if (vscode && vscode.window) {
      this.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
    }
  }

  /**
   * Set a custom network connectivity checker (for testing)
   * @param checker - Function that returns true if online
   */
  setConnectivityChecker(checker: NetworkConnectivityChecker): void {
    this.connectivityChecker = checker;
  }

  /**
   * Check network connectivity
   * @returns true if online
   */
  private async checkConnectivity(): Promise<boolean> {
    // Use custom checker if provided (for testing)
    if (this.connectivityChecker) {
      return this.connectivityChecker();
    }

    // Default implementation: try to reach a known endpoint
    try {
      // In Node.js environment, use dns lookup or http request
      const dns = await import("dns").catch(() => null);
      if (dns) {
        return new Promise<boolean>((resolve) => {
          dns.lookup("dns.google", (err) => {
            resolve(!err);
          });
        });
      }
      // Fallback: assume online
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update network state and trigger queue processing if needed
   * @param isOnline - Whether the network is online
   */
  private async updateNetworkState(isOnline: boolean): Promise<void> {
    const previousState = this.networkState;
    this.networkState = isOnline ? "online" : "offline";

    // If we just came online and have queued requests, process them
    if (previousState === "offline" && isOnline && this.queue.length > 0) {
      await this.processQueue();
    }

    // Update status bar
    this.updateStatusBar();
  }

  /**
   * Update the status bar with current queue state
   * Requirement: REQ-6.3 (notify user of queued state in status bar)
   */
  private updateStatusBar(): void {
    const queuedCount = this.queue.length;

    // Call custom callback if set
    if (this.statusBarCallback) {
      this.statusBarCallback(queuedCount, this.networkState);
    }

    // Update VS Code status bar
    if (this.statusBarItem) {
      if (this.networkState === "offline" || queuedCount > 0) {
        if (this.networkState === "offline") {
          this.statusBarItem.text = `$(cloud-offline) Offline${queuedCount > 0 ? ` (${queuedCount} queued)` : ""}`;
        } else {
          this.statusBarItem.text = `$(sync~spin) Processing ${queuedCount} queued request${queuedCount !== 1 ? "s" : ""}`;
        }
        this.statusBarItem.show();
      } else {
        this.statusBarItem.hide();
      }
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `offline-req-${++this.requestIdCounter}-${Date.now()}`;
  }

  /**
   * Submit a cloud request, queuing it if offline
   * Requirement: REQ-6.3
   * @param request - Analysis request to submit
   * @param executor - Function to execute the cloud request
   * @returns Promise resolving to analysis result
   */
  async submitCloudRequest(
    request: AnalysisRequest,
    executor: CloudRequestExecutor
  ): Promise<AnalysisResult> {
    // Check current connectivity
    const isOnline = await this.checkConnectivity();
    await this.updateNetworkState(isOnline);

    // If online, execute immediately
    if (isOnline) {
      try {
        return await executor(request);
      } catch (error) {
        // If execution fails due to network error, queue the request
        if (this.isNetworkError(error)) {
          await this.updateNetworkState(false);
          return this.queueRequest(request, executor);
        }
        throw error;
      }
    }

    // Offline: queue the request
    return this.queueRequest(request, executor);
  }

  /**
   * Check if an error is a network-related error
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const networkErrorPatterns = [
        "ENOTFOUND",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENETUNREACH",
        "ENDPOINT_UNREACHABLE",
        "network",
        "offline",
      ];
      const errorCode = (error as { code?: string }).code;
      return networkErrorPatterns.some(
        (pattern) =>
          error.message.toLowerCase().includes(pattern.toLowerCase()) ||
          errorCode === pattern
      );
    }
    return false;
  }

  /**
   * Queue a request for later execution
   * @param request - Analysis request to queue
   * @param executor - Function to execute the request
   * @returns Promise that resolves when the request is eventually executed
   */
  private queueRequest(
    request: AnalysisRequest,
    executor: CloudRequestExecutor
  ): Promise<AnalysisResult> {
    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new OfflineQueueError(
        "QUEUE_FULL",
        `Cannot queue request: maximum queue size (${this.config.maxQueueSize}) reached`,
        {
          queueSize: this.queue.length,
          maxQueueSize: this.config.maxQueueSize,
        }
      );
    }

    return new Promise<AnalysisResult>((resolve, reject) => {
      const queuedRequest: QueuedCloudRequest = {
        id: this.generateRequestId(),
        request,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
        resolve,
        reject,
      };

      // Store executor with the request for later use
      (queuedRequest as QueuedCloudRequest & { executor: CloudRequestExecutor }).executor = executor;

      // Add to queue (FIFO)
      this.queue.push(queuedRequest);

      // Update status bar
      this.updateStatusBar();
    });
  }

  /**
   * Process all queued requests when connectivity returns
   * Requirement: REQ-6.3
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.updateStatusBar();

    try {
      // Process requests in FIFO order
      while (this.queue.length > 0) {
        // Check if still online
        const isOnline = await this.checkConnectivity();
        if (!isOnline) {
          await this.updateNetworkState(false);
          break;
        }

        const queuedRequest = this.queue[0];
        const executor = (queuedRequest as QueuedCloudRequest & { executor: CloudRequestExecutor }).executor;

        try {
          const result = await executor(queuedRequest.request);
          // Remove from queue and resolve
          this.queue.shift();
          queuedRequest.resolve(result);
          this.updateStatusBar();
        } catch (error) {
          queuedRequest.retryCount++;

          if (this.isNetworkError(error)) {
            // Network error: stop processing and wait for connectivity
            await this.updateNetworkState(false);
            break;
          }

          if (queuedRequest.retryCount >= this.config.maxRetryAttempts) {
            // Max retries exceeded: remove from queue and reject
            this.queue.shift();
            queuedRequest.reject(
              new OfflineQueueError(
                "MAX_RETRIES_EXCEEDED",
                `Request failed after ${this.config.maxRetryAttempts} attempts`,
                {
                  queueSize: this.queue.length,
                  maxQueueSize: this.config.maxQueueSize,
                  requestId: queuedRequest.id,
                  retryCount: queuedRequest.retryCount,
                }
              )
            );
            this.updateStatusBar();
          } else {
            // Non-network error with retries remaining: reject immediately
            this.queue.shift();
            queuedRequest.reject(error as Error);
            this.updateStatusBar();
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
      this.updateStatusBar();
    }
  }

  /**
   * Get the current network connectivity state
   * @returns Current network state
   */
  getNetworkState(): NetworkState {
    return this.networkState;
  }

  /**
   * Get the number of queued requests
   * @returns Number of requests in the queue
   */
  getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Check if the system is currently online
   * @returns true if online
   */
  isOnline(): boolean {
    return this.networkState === "online";
  }

  /**
   * Start monitoring network connectivity
   * Requirement: REQ-6.3
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    // Initial check
    this.checkConnectivity().then((isOnline) => {
      this.updateNetworkState(isOnline);
    });

    // Set up periodic checks
    this.monitoringInterval = setInterval(async () => {
      const isOnline = await this.checkConnectivity();
      await this.updateNetworkState(isOnline);
    }, this.config.connectivityCheckInterval);
  }

  /**
   * Stop monitoring network connectivity
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Set callback for status bar updates
   * @param callback - Function to call when queue state changes
   */
  setStatusBarCallback(callback: StatusBarUpdateCallback): void {
    this.statusBarCallback = callback;
  }

  /**
   * Clear all queued requests
   */
  clearQueue(): void {
    // Reject all pending requests
    for (const queuedRequest of this.queue) {
      queuedRequest.reject(
        new OfflineQueueError(
          "REQUEST_EXPIRED",
          "Request was cancelled due to queue clear",
          {
            queueSize: this.queue.length,
            maxQueueSize: this.config.maxQueueSize,
            requestId: queuedRequest.id,
          }
        )
      );
    }
    this.queue = [];
    this.updateStatusBar();
  }

  /**
   * Get all queued requests (for testing/inspection)
   * @returns Array of queued request metadata
   */
  getQueuedRequests(): Array<{ id: string; queuedAt: string; retryCount: number; imagePath: string }> {
    return this.queue.map((req) => ({
      id: req.id,
      queuedAt: req.queuedAt,
      retryCount: req.retryCount,
      imagePath: req.request.imagePath,
    }));
  }

  /**
   * Force a connectivity check and queue processing
   * @returns true if online after check
   */
  async forceConnectivityCheck(): Promise<boolean> {
    const isOnline = await this.checkConnectivity();
    await this.updateNetworkState(isOnline);
    return isOnline;
  }

  /**
   * Get the current configuration
   */
  getConfig(): OfflineQueueManagerConfig {
    return { ...this.config };
  }

  /**
   * Manually set network state (for testing)
   * @param state - Network state to set
   */
  setNetworkState(state: NetworkState): void {
    this.networkState = state;
    this.updateStatusBar();
  }

  /**
   * Manually trigger queue processing (for testing)
   */
  async triggerQueueProcessing(): Promise<void> {
    if (this.networkState === "online") {
      await this.processQueue();
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.clearQueue();
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
  }
}

/**
 * Create an offline queue manager with the given configuration
 */
export function createOfflineQueueManager(
  config: Partial<OfflineQueueManagerConfig> = {}
): OfflineQueueManager {
  return new OfflineQueueManager(config);
}
