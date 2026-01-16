/**
 * Hook Execution Engine
 * Schedules and executes hooks with concurrency, timeouts, retries, and redaction
 *
 * Requirements:
 * - REQ-3.1: Enqueue matching enabled hooks within 1000ms
 * - REQ-3.2: Execute in background without blocking UI thread
 * - REQ-3.3: Execute hooks concurrently up to configured limit (default 4)
 * - REQ-3.4: Abort execution on timeout and record to output pane
 * - REQ-4.2: Redact secrets from prompts and logs
 * - REQ-4.3: Retry on failure according to retry policy
 */

import {
  Hook,
  HookRuntime,
  HookTriggerContext,
  ExecutionRecord,
  ExecutionId,
  PromptResult,
} from "./types";
import { IPromptRunner } from "./promptRunner";
import { OutputLogger } from "./outputLogger";
import { redact } from "./secretsRedactor";
import { MetricsCollector, MetricsSnapshot } from "./metricsCollector";

/**
 * Semaphore for controlling concurrent access
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next?.();
    } else {
      this.permits++;
    }
  }

  get availablePermits(): number {
    return this.permits;
  }

  get queueLength(): number {
    return this.waitQueue.length;
  }
}

/**
 * Options for the execution engine
 */
export interface ExecutionEngineOptions {
  promptRunner: IPromptRunner;
  outputLogger: OutputLogger;
  defaultConcurrency?: number;
  defaultTimeout?: number;
  metricsCollector?: MetricsCollector;
}

/**
 * Hook Execution Engine
 * Manages scheduling and execution of hooks with concurrency control
 */
export class HookExecutionEngine {
  private promptRunner: IPromptRunner;
  private outputLogger: OutputLogger;
  private defaultConcurrency: number;
  private defaultTimeout: number;
  private metricsCollector: MetricsCollector;

  /** Per-workspace semaphores for concurrency control */
  private workspaceSemaphores = new Map<string, Map<string, Semaphore>>();

  /** Active executions tracking */
  private activeExecutions = new Map<ExecutionId, AbortController>();

  /** Execution records for tracking */
  private executionRecords = new Map<ExecutionId, ExecutionRecord>();

  /** Shutdown flag */
  private isShuttingDown = false;

  /** Counter for generating unique execution IDs */
  private executionCounter = 0;

  constructor(options: ExecutionEngineOptions) {
    this.promptRunner = options.promptRunner;
    this.outputLogger = options.outputLogger;
    this.defaultConcurrency = options.defaultConcurrency ?? 4;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.metricsCollector = options.metricsCollector ?? new MetricsCollector();
  }

  /**
   * Generate a unique execution ID
   */
  private generateExecutionId(): ExecutionId {
    this.executionCounter++;
    return `exec-${Date.now()}-${this.executionCounter}`;
  }

  /**
   * Get or create a semaphore for a hook in a workspace
   */
  private getSemaphore(workspaceRoot: string, hookId: string, concurrency: number): Semaphore {
    let workspaceMap = this.workspaceSemaphores.get(workspaceRoot);
    if (!workspaceMap) {
      workspaceMap = new Map();
      this.workspaceSemaphores.set(workspaceRoot, workspaceMap);
    }

    let semaphore = workspaceMap.get(hookId);
    if (!semaphore) {
      semaphore = new Semaphore(concurrency);
      workspaceMap.set(hookId, semaphore);
    }

    return semaphore;
  }

  /**
   * Get secret patterns from hook as RegExp array
   */
  private getSecretPatterns(hook: Hook | HookRuntime): RegExp[] {
    if (!hook.secretPatterns || hook.secretPatterns.length === 0) {
      return [];
    }

    const patterns: RegExp[] = [];
    for (const pattern of hook.secretPatterns) {
      try {
        patterns.push(new RegExp(pattern, "g"));
      } catch {
        // Invalid pattern - skip
      }
    }
    return patterns;
  }

  /**
   * Calculate backoff delay with optional jitter
   */
  private calculateBackoff(
    attempt: number,
    backoffMs: number,
    jitter: boolean
  ): number {
    // Exponential backoff: backoffMs * 2^(attempt-1)
    const baseDelay = backoffMs * Math.pow(2, attempt - 1);

    if (jitter) {
      // Add random jitter between 0-50% of base delay
      const jitterAmount = baseDelay * Math.random() * 0.5;
      return Math.floor(baseDelay + jitterAmount);
    }

    return baseDelay;
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create initial execution record
   */
  private createExecutionRecord(
    executionId: ExecutionId,
    hook: Hook | HookRuntime,
    context: HookTriggerContext
  ): ExecutionRecord {
    return {
      id: executionId,
      hookId: hook.id,
      context,
      status: "queued",
      attempt: 0,
      startTime: new Date().toISOString(),
    };
  }

  /**
   * Enqueue a hook for execution
   * Returns immediately with an execution ID
   */
  async enqueue(
    hook: Hook | HookRuntime,
    context: HookTriggerContext
  ): Promise<ExecutionId> {
    if (this.isShuttingDown) {
      throw new Error("Execution engine is shutting down");
    }

    const executionId = this.generateExecutionId();
    const record = this.createExecutionRecord(executionId, hook, context);

    this.executionRecords.set(executionId, record);
    this.outputLogger.logExecution(record);

    // Track metrics: hook enqueued
    this.metricsCollector.incrementEnqueued();

    // Start execution in background (non-blocking)
    this.executeHook(executionId, hook, context).catch((error) => {
      this.outputLogger.logError(context, error);
    });

    return executionId;
  }

  /**
   * Execute a hook with concurrency control, timeout, and retry logic
   */
  private async executeHook(
    executionId: ExecutionId,
    hook: Hook | HookRuntime,
    context: HookTriggerContext
  ): Promise<void> {
    const concurrency = (hook as HookRuntime).concurrency ?? this.defaultConcurrency;
    const timeout = (hook as HookRuntime).timeout ?? this.defaultTimeout;
    const retryConfig = (hook as HookRuntime).retry ?? {
      maxAttempts: 3,
      backoffMs: 1000,
      jitter: true,
    };

    const semaphore = this.getSemaphore(context.workspaceRoot, hook.id, concurrency);
    const secretPatterns = this.getSecretPatterns(hook);

    // Acquire semaphore slot
    await semaphore.acquire();

    try {
      await this.runWithRetry(
        executionId,
        hook,
        context,
        timeout,
        retryConfig,
        secretPatterns
      );
    } finally {
      semaphore.release();
    }
  }

  /**
   * Run hook execution with retry logic
   */
  private async runWithRetry(
    executionId: ExecutionId,
    hook: Hook | HookRuntime,
    context: HookTriggerContext,
    timeout: number,
    retryConfig: { maxAttempts: number; backoffMs: number; jitter: boolean },
    secretPatterns: RegExp[]
  ): Promise<void> {
    const record = this.executionRecords.get(executionId);
    if (!record) {
      return;
    }

    const maxAttempts = retryConfig.maxAttempts;
    let lastResult: PromptResult | null = null;

    // Track metrics: execution started (moved from queue to active)
    this.metricsCollector.incrementActive();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.isShuttingDown) {
        this.updateRecord(executionId, {
          status: "canceled",
          endTime: new Date().toISOString(),
          error: "Execution engine shutdown",
        });
        // Track metrics: canceled
        this.metricsCollector.recordCanceled();
        return;
      }

      // Update record for this attempt
      this.updateRecord(executionId, {
        status: "running",
        attempt,
      });

      // Create abort controller for this attempt
      const abortController = new AbortController();
      this.activeExecutions.set(executionId, abortController);

      try {
        // Get the prompt to execute
        const prompt = hook.action.prompt || hook.action.command || "";

        // Redact secrets from prompt before execution
        const redactedPrompt = redact(prompt, secretPatterns);

        // Execute with timeout
        lastResult = await this.executeWithTimeout(
          redactedPrompt,
          timeout,
          abortController.signal,
          abortController
        );

        // Check result
        if (lastResult.canceled) {
          this.updateRecord(executionId, {
            status: "canceled",
            endTime: new Date().toISOString(),
            duration: lastResult.duration,
          });
          // Track metrics: canceled
          this.metricsCollector.recordCanceled();
          return;
        }

        if (lastResult.timedOut) {
          this.updateRecord(executionId, {
            status: "timeout",
            endTime: new Date().toISOString(),
            duration: lastResult.duration,
            stdout: redact(lastResult.stdout, secretPatterns),
            stderr: redact(lastResult.stderr, secretPatterns),
          });

          // Log timeout with timestamps
          this.outputLogger.logInfo(
            context,
            `Hook ${hook.id} timed out after ${timeout}ms (attempt ${attempt}/${maxAttempts})`
          );

          // Track metrics: timeout
          this.metricsCollector.recordTimeout();

          // Don't retry on timeout - it's a definitive failure
          return;
        }

        // Check for success (exit code 0)
        if (lastResult.exitCode === 0) {
          this.updateRecord(executionId, {
            status: "success",
            endTime: new Date().toISOString(),
            duration: lastResult.duration,
            exitCode: lastResult.exitCode,
            stdout: redact(lastResult.stdout, secretPatterns),
            stderr: redact(lastResult.stderr, secretPatterns),
          });
          // Track metrics: success
          this.metricsCollector.recordSuccess();
          return;
        }

        // Non-zero exit code - may retry
        this.outputLogger.logInfo(
          context,
          `Hook ${hook.id} failed with exit code ${lastResult.exitCode} (attempt ${attempt}/${maxAttempts})`
        );

        // If this was the last attempt, record failure
        if (attempt >= maxAttempts) {
          this.updateRecord(executionId, {
            status: "failure",
            endTime: new Date().toISOString(),
            duration: lastResult.duration,
            exitCode: lastResult.exitCode,
            stdout: redact(lastResult.stdout, secretPatterns),
            stderr: redact(lastResult.stderr, secretPatterns),
            error: `Failed after ${maxAttempts} attempts`,
          });
          // Track metrics: failure
          this.metricsCollector.recordFailure();
          return;
        }

        // Calculate backoff and wait before retry
        const backoffDelay = this.calculateBackoff(
          attempt,
          retryConfig.backoffMs,
          retryConfig.jitter
        );
        this.outputLogger.logInfo(
          context,
          `Retrying hook ${hook.id} in ${backoffDelay}ms...`
        );
        await this.sleep(backoffDelay);
      } catch (error) {
        // Unexpected error during execution
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt >= maxAttempts) {
          this.updateRecord(executionId, {
            status: "failure",
            endTime: new Date().toISOString(),
            error: redact(errorMessage, secretPatterns),
          });
          // Track metrics: failure
          this.metricsCollector.recordFailure();
          return;
        }

        // Wait before retry
        const backoffDelay = this.calculateBackoff(
          attempt,
          retryConfig.backoffMs,
          retryConfig.jitter
        );
        await this.sleep(backoffDelay);
      } finally {
        this.activeExecutions.delete(executionId);
      }
    }
  }

  /**
   * Execute prompt with timeout enforcement
   */
  private async executeWithTimeout(
    prompt: string,
    timeout: number,
    signal: AbortSignal,
    abortController: AbortController
  ): Promise<PromptResult> {
    // Set up our own timeout to abort the execution
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeout);

    try {
      const result = await this.promptRunner.runPrompt(prompt, {
        timeout,
        signal,
      });
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Update an execution record and log it
   */
  private updateRecord(
    executionId: ExecutionId,
    updates: Partial<ExecutionRecord>
  ): void {
    const record = this.executionRecords.get(executionId);
    if (!record) {
      return;
    }

    Object.assign(record, updates);
    this.outputLogger.logExecution(record);
  }

  /**
   * Get an execution record by ID
   */
  getExecutionRecord(executionId: ExecutionId): ExecutionRecord | undefined {
    return this.executionRecords.get(executionId);
  }

  /**
   * Get all execution records
   */
  getAllExecutionRecords(): ExecutionRecord[] {
    return Array.from(this.executionRecords.values());
  }

  /**
   * Cancel a specific execution
   */
  cancelExecution(executionId: ExecutionId): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Shutdown the execution engine
   * Cancels all active executions and waits for them to complete
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel all active executions
    for (const [executionId, controller] of this.activeExecutions) {
      controller.abort();
      this.updateRecord(executionId, {
        status: "canceled",
        endTime: new Date().toISOString(),
        error: "Execution engine shutdown",
      });
    }

    // Wait a short time for executions to clean up
    await this.sleep(100);

    // Clear all state
    this.activeExecutions.clear();
    this.workspaceSemaphores.clear();
    this.executionRecords.clear();

    this.outputLogger.logInfo(null, "Execution engine shutdown complete");
  }

  /**
   * Get statistics about the execution engine
   */
  getStats(): {
    activeExecutions: number;
    totalExecutions: number;
    isShuttingDown: boolean;
  } {
    return {
      activeExecutions: this.activeExecutions.size,
      totalExecutions: this.executionRecords.size,
      isShuttingDown: this.isShuttingDown,
    };
  }

  /**
   * Get metrics snapshot from the metrics collector
   * Returns comprehensive metrics including queue length, active executions,
   * and success/failure/timeout/canceled counts
   */
  getMetrics(): MetricsSnapshot {
    return this.metricsCollector.getMetrics();
  }

  /**
   * Get metrics in Prometheus exposition format
   * Returns a string suitable for a Prometheus scrape endpoint
   */
  getPrometheusMetrics(): string {
    return this.metricsCollector.getPrometheusMetrics();
  }

  /**
   * Get the metrics collector instance
   * Useful for testing or direct metrics manipulation
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }
}
