/**
 * Metrics Collector for Agent Hooks
 * Tracks telemetry and metrics for hook execution
 *
 * Task 4.7: Telemetry & metrics hooks
 * - Tracks queueLength, activeExecutions, success/failure counts
 * - Exposes metrics via OutputLogger.logInfo
 * - Optionally provides Prometheus-like endpoint format
 */

/**
 * Metrics snapshot interface
 */
export interface MetricsSnapshot {
  /** Number of hooks waiting to execute */
  queueLength: number;
  /** Number of hooks currently executing */
  activeExecutions: number;
  /** Total hooks enqueued since startup */
  totalEnqueued: number;
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  failureCount: number;
  /** Number of timed out executions */
  timeoutCount: number;
  /** Number of canceled executions */
  canceledCount: number;
  /** Timestamp when metrics were collected */
  timestamp: string;
}

/**
 * Metrics Collector class
 * Provides centralized metrics tracking for the hook execution system
 */
export class MetricsCollector {
  private _queueLength: number = 0;
  private _activeExecutions: number = 0;
  private _totalEnqueued: number = 0;
  private _successCount: number = 0;
  private _failureCount: number = 0;
  private _timeoutCount: number = 0;
  private _canceledCount: number = 0;

  /**
   * Increment the queue length and total enqueued count
   * Called when a hook is enqueued for execution
   */
  incrementEnqueued(): void {
    this._queueLength++;
    this._totalEnqueued++;
  }

  /**
   * Decrement queue length and increment active executions
   * Called when execution starts (hook moves from queue to active)
   */
  incrementActive(): void {
    if (this._queueLength > 0) {
      this._queueLength--;
    }
    this._activeExecutions++;
  }

  /**
   * Decrement active executions count
   * Called when execution ends (regardless of outcome)
   */
  decrementActive(): void {
    if (this._activeExecutions > 0) {
      this._activeExecutions--;
    }
  }

  /**
   * Record a successful execution
   * Called when a hook execution completes successfully
   */
  recordSuccess(): void {
    this._successCount++;
    this.decrementActive();
  }

  /**
   * Record a failed execution
   * Called when a hook execution fails (non-zero exit code or error)
   */
  recordFailure(): void {
    this._failureCount++;
    this.decrementActive();
  }

  /**
   * Record a timed out execution
   * Called when a hook execution times out
   */
  recordTimeout(): void {
    this._timeoutCount++;
    this.decrementActive();
  }

  /**
   * Record a canceled execution
   * Called when a hook execution is canceled
   */
  recordCanceled(): void {
    this._canceledCount++;
    this.decrementActive();
  }

  /**
   * Get current metrics snapshot
   * Returns all current metric values with timestamp
   */
  getMetrics(): MetricsSnapshot {
    return {
      queueLength: this._queueLength,
      activeExecutions: this._activeExecutions,
      totalEnqueued: this._totalEnqueued,
      successCount: this._successCount,
      failureCount: this._failureCount,
      timeoutCount: this._timeoutCount,
      canceledCount: this._canceledCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset all counters to zero
   * Useful for testing or when restarting the metrics collection
   */
  reset(): void {
    this._queueLength = 0;
    this._activeExecutions = 0;
    this._totalEnqueued = 0;
    this._successCount = 0;
    this._failureCount = 0;
    this._timeoutCount = 0;
    this._canceledCount = 0;
  }

  /**
   * Get metrics in Prometheus exposition format
   * Returns a string suitable for a Prometheus scrape endpoint
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Queue length (gauge)
    lines.push("# HELP agent_hooks_queue_length Number of hooks waiting to execute");
    lines.push("# TYPE agent_hooks_queue_length gauge");
    lines.push(`agent_hooks_queue_length ${metrics.queueLength}`);
    lines.push("");

    // Active executions (gauge)
    lines.push("# HELP agent_hooks_active_executions Number of hooks currently executing");
    lines.push("# TYPE agent_hooks_active_executions gauge");
    lines.push(`agent_hooks_active_executions ${metrics.activeExecutions}`);
    lines.push("");

    // Total enqueued (counter)
    lines.push("# HELP agent_hooks_total_enqueued Total hooks enqueued since startup");
    lines.push("# TYPE agent_hooks_total_enqueued counter");
    lines.push(`agent_hooks_total_enqueued ${metrics.totalEnqueued}`);
    lines.push("");

    // Success count (counter)
    lines.push("# HELP agent_hooks_success_total Total successful executions");
    lines.push("# TYPE agent_hooks_success_total counter");
    lines.push(`agent_hooks_success_total ${metrics.successCount}`);
    lines.push("");

    // Failure count (counter)
    lines.push("# HELP agent_hooks_failure_total Total failed executions");
    lines.push("# TYPE agent_hooks_failure_total counter");
    lines.push(`agent_hooks_failure_total ${metrics.failureCount}`);
    lines.push("");

    // Timeout count (counter)
    lines.push("# HELP agent_hooks_timeout_total Total timed out executions");
    lines.push("# TYPE agent_hooks_timeout_total counter");
    lines.push(`agent_hooks_timeout_total ${metrics.timeoutCount}`);
    lines.push("");

    // Canceled count (counter)
    lines.push("# HELP agent_hooks_canceled_total Total canceled executions");
    lines.push("# TYPE agent_hooks_canceled_total counter");
    lines.push(`agent_hooks_canceled_total ${metrics.canceledCount}`);

    return lines.join("\n");
  }

  // Getters for individual metrics (useful for testing)
  get queueLength(): number {
    return this._queueLength;
  }

  get activeExecutions(): number {
    return this._activeExecutions;
  }

  get totalEnqueued(): number {
    return this._totalEnqueued;
  }

  get successCount(): number {
    return this._successCount;
  }

  get failureCount(): number {
    return this._failureCount;
  }

  get timeoutCount(): number {
    return this._timeoutCount;
  }

  get canceledCount(): number {
    return this._canceledCount;
  }
}
