/**
 * Concurrency Manager for Multimodal Input Support
 * Requirements: REQ-7.3
 * 
 * Manages concurrent analysis requests with configurable limits and FIFO queuing.
 * Limits concurrent analyses to 10 per workspace and queues up to 5 additional requests.
 */

import { AnalysisRequest, AnalysisResult } from "./types";

/**
 * Configuration for the Concurrency Manager
 */
export interface ConcurrencyManagerConfig {
  /** Maximum number of concurrent analyses per workspace (default: 10) */
  maxConcurrent: number;
  /** Maximum number of queued requests beyond the concurrency limit (default: 5) */
  queueLimit: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyManagerConfig = {
  maxConcurrent: 10,
  queueLimit: 5,
};

/**
 * Error codes for concurrency-related failures
 */
export type ConcurrencyErrorCode = "QUEUE_FULL" | "REQUEST_CANCELLED";

/**
 * Error thrown when concurrency limits are exceeded
 */
export class ConcurrencyError extends Error {
  code: ConcurrencyErrorCode;
  details: {
    maxConcurrent: number;
    queueLimit: number;
    currentActive: number;
    currentQueued: number;
  };

  constructor(
    code: ConcurrencyErrorCode,
    message: string,
    details: {
      maxConcurrent: number;
      queueLimit: number;
      currentActive: number;
      currentQueued: number;
    }
  ) {
    super(message);
    this.name = "ConcurrencyError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Queued request entry
 */
interface QueuedRequest {
  id: string;
  request: AnalysisRequest;
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Analysis executor function type
 */
export type AnalysisExecutor = (request: AnalysisRequest) => Promise<AnalysisResult>;

/**
 * Interface for Concurrency Manager
 */
export interface IConcurrencyManager {
  /**
   * Submit an analysis request for execution
   * @param request - Analysis request to execute
   * @param executor - Function to execute the analysis
   * @returns Promise resolving to analysis result
   * @throws ConcurrencyError if queue is full
   */
  submit(request: AnalysisRequest, executor: AnalysisExecutor): Promise<AnalysisResult>;

  /**
   * Get the number of currently active analyses for a workspace
   * @param workspaceRoot - Workspace root path
   * @returns Number of active analyses
   */
  getActiveCount(workspaceRoot: string): number;

  /**
   * Get the number of queued requests for a workspace
   * @param workspaceRoot - Workspace root path
   * @returns Number of queued requests
   */
  getQueuedCount(workspaceRoot: string): number;

  /**
   * Check if a new request can be accepted
   * @param workspaceRoot - Workspace root path
   * @returns True if request can be accepted (either immediately or queued)
   */
  canAccept(workspaceRoot: string): boolean;

  /**
   * Cancel all pending requests for a workspace
   * @param workspaceRoot - Workspace root path
   */
  cancelAll(workspaceRoot: string): void;
}

/**
 * ConcurrencyManager class for managing concurrent analysis requests
 * Implements REQ-7.3 (concurrency limits and FIFO queuing)
 */
export class ConcurrencyManager implements IConcurrencyManager {
  private config: ConcurrencyManagerConfig;
  
  // Track active analyses per workspace
  private activeAnalyses: Map<string, Set<string>> = new Map();
  
  // FIFO queue per workspace
  private requestQueues: Map<string, QueuedRequest[]> = new Map();
  
  // Counter for generating unique request IDs
  private requestIdCounter = 0;

  constructor(config: Partial<ConcurrencyManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONCURRENCY_CONFIG,
      ...config,
    };
  }

  /**
   * Submit an analysis request for execution
   * Requirement: REQ-7.3
   * @param request - Analysis request to execute
   * @param executor - Function to execute the analysis
   * @returns Promise resolving to analysis result
   * @throws ConcurrencyError if queue is full
   */
  async submit(request: AnalysisRequest, executor: AnalysisExecutor): Promise<AnalysisResult> {
    const { workspaceRoot } = request;
    
    // Initialize workspace tracking if needed
    this.ensureWorkspaceTracking(workspaceRoot);
    
    const activeCount = this.getActiveCount(workspaceRoot);
    const queuedCount = this.getQueuedCount(workspaceRoot);
    
    // Check if we can accept this request
    if (activeCount >= this.config.maxConcurrent) {
      // Need to queue the request
      if (queuedCount >= this.config.queueLimit) {
        // Queue is full, reject the request
        throw new ConcurrencyError(
          "QUEUE_FULL",
          `Cannot accept request: maximum concurrent analyses (${this.config.maxConcurrent}) reached and queue is full (${this.config.queueLimit} queued)`,
          {
            maxConcurrent: this.config.maxConcurrent,
            queueLimit: this.config.queueLimit,
            currentActive: activeCount,
            currentQueued: queuedCount,
          }
        );
      }
      
      // Queue the request and wait for execution
      return this.queueRequest(request, executor);
    }
    
    // Execute immediately
    return this.executeRequest(request, executor);
  }

  /**
   * Get the number of currently active analyses for a workspace
   * @param workspaceRoot - Workspace root path
   * @returns Number of active analyses
   */
  getActiveCount(workspaceRoot: string): number {
    const active = this.activeAnalyses.get(workspaceRoot);
    return active ? active.size : 0;
  }

  /**
   * Get the number of queued requests for a workspace
   * @param workspaceRoot - Workspace root path
   * @returns Number of queued requests
   */
  getQueuedCount(workspaceRoot: string): number {
    const queue = this.requestQueues.get(workspaceRoot);
    return queue ? queue.length : 0;
  }

  /**
   * Check if a new request can be accepted
   * @param workspaceRoot - Workspace root path
   * @returns True if request can be accepted (either immediately or queued)
   */
  canAccept(workspaceRoot: string): boolean {
    const activeCount = this.getActiveCount(workspaceRoot);
    const queuedCount = this.getQueuedCount(workspaceRoot);
    
    // Can accept if under concurrent limit OR if queue has space
    return activeCount < this.config.maxConcurrent || 
           queuedCount < this.config.queueLimit;
  }

  /**
   * Cancel all pending requests for a workspace
   * @param workspaceRoot - Workspace root path
   */
  cancelAll(workspaceRoot: string): void {
    const queue = this.requestQueues.get(workspaceRoot);
    if (queue) {
      // Reject all queued requests
      for (const queuedRequest of queue) {
        queuedRequest.reject(
          new ConcurrencyError(
            "REQUEST_CANCELLED",
            "Request was cancelled",
            {
              maxConcurrent: this.config.maxConcurrent,
              queueLimit: this.config.queueLimit,
              currentActive: this.getActiveCount(workspaceRoot),
              currentQueued: queue.length,
            }
          )
        );
      }
      // Clear the queue
      this.requestQueues.set(workspaceRoot, []);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): ConcurrencyManagerConfig {
    return { ...this.config };
  }

  /**
   * Ensure workspace tracking structures are initialized
   */
  private ensureWorkspaceTracking(workspaceRoot: string): void {
    if (!this.activeAnalyses.has(workspaceRoot)) {
      this.activeAnalyses.set(workspaceRoot, new Set());
    }
    if (!this.requestQueues.has(workspaceRoot)) {
      this.requestQueues.set(workspaceRoot, []);
    }
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `req-${++this.requestIdCounter}-${Date.now()}`;
  }

  /**
   * Queue a request for later execution (FIFO order)
   */
  private queueRequest(request: AnalysisRequest, executor: AnalysisExecutor): Promise<AnalysisResult> {
    const { workspaceRoot } = request;
    const requestId = this.generateRequestId();
    
    return new Promise<AnalysisResult>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: requestId,
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      };
      
      // Add to end of queue (FIFO)
      const queue = this.requestQueues.get(workspaceRoot)!;
      queue.push(queuedRequest);
      
      // Store the executor for later use
      (queuedRequest as QueuedRequest & { executor: AnalysisExecutor }).executor = executor;
    });
  }

  /**
   * Execute a request immediately
   */
  private async executeRequest(request: AnalysisRequest, executor: AnalysisExecutor): Promise<AnalysisResult> {
    const { workspaceRoot } = request;
    const requestId = this.generateRequestId();
    
    // Mark as active
    const active = this.activeAnalyses.get(workspaceRoot)!;
    active.add(requestId);
    
    try {
      // Execute the analysis
      const result = await executor(request);
      return result;
    } finally {
      // Remove from active set
      active.delete(requestId);
      
      // Process next queued request if any
      this.processNextInQueue(workspaceRoot);
    }
  }

  /**
   * Process the next request in the queue (FIFO)
   */
  private processNextInQueue(workspaceRoot: string): void {
    const queue = this.requestQueues.get(workspaceRoot);
    if (!queue || queue.length === 0) {
      return;
    }
    
    const activeCount = this.getActiveCount(workspaceRoot);
    if (activeCount >= this.config.maxConcurrent) {
      return;
    }
    
    // Get the first request from queue (FIFO)
    const queuedRequest = queue.shift()!;
    const executor = (queuedRequest as QueuedRequest & { executor: AnalysisExecutor }).executor;
    
    // Execute the queued request
    this.executeRequest(queuedRequest.request, executor)
      .then(result => queuedRequest.resolve(result))
      .catch(error => queuedRequest.reject(error));
  }
}

/**
 * Create a concurrency manager with the given configuration
 */
export function createConcurrencyManager(
  config: Partial<ConcurrencyManagerConfig> = {}
): ConcurrencyManager {
  return new ConcurrencyManager(config);
}
