/**
 * Unit tests for Metrics Collector
 *
 * Task 4.7: Telemetry & metrics hooks
 * Tests:
 * - All counter increments/decrements
 * - Metrics snapshot
 * - Reset functionality
 * - Prometheus format output
 * - Integration with execution engine
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MetricsCollector, MetricsSnapshot } from "./metricsCollector";

describe("MetricsCollector", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe("Initial State", () => {
    it("should start with all counters at zero", () => {
      const metrics = collector.getMetrics();

      expect(metrics.queueLength).toBe(0);
      expect(metrics.activeExecutions).toBe(0);
      expect(metrics.totalEnqueued).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.timeoutCount).toBe(0);
      expect(metrics.canceledCount).toBe(0);
    });

    it("should include timestamp in metrics snapshot", () => {
      const metrics = collector.getMetrics();

      expect(metrics.timestamp).toBeDefined();
      expect(() => new Date(metrics.timestamp)).not.toThrow();
    });
  });

  describe("incrementEnqueued", () => {
    it("should increment queue length", () => {
      collector.incrementEnqueued();

      expect(collector.queueLength).toBe(1);
    });

    it("should increment total enqueued", () => {
      collector.incrementEnqueued();

      expect(collector.totalEnqueued).toBe(1);
    });

    it("should increment both counters on multiple calls", () => {
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementEnqueued();

      expect(collector.queueLength).toBe(3);
      expect(collector.totalEnqueued).toBe(3);
    });
  });

  describe("incrementActive", () => {
    it("should decrement queue length and increment active executions", () => {
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();

      expect(collector.queueLength).toBe(1);
      expect(collector.activeExecutions).toBe(1);
    });

    it("should not decrement queue length below zero", () => {
      collector.incrementActive();

      expect(collector.queueLength).toBe(0);
      expect(collector.activeExecutions).toBe(1);
    });

    it("should handle multiple active executions", () => {
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.incrementActive();

      expect(collector.queueLength).toBe(1);
      expect(collector.activeExecutions).toBe(2);
    });
  });

  describe("decrementActive", () => {
    it("should decrement active executions", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.decrementActive();

      expect(collector.activeExecutions).toBe(0);
    });

    it("should not decrement below zero", () => {
      collector.decrementActive();

      expect(collector.activeExecutions).toBe(0);
    });
  });

  describe("recordSuccess", () => {
    it("should increment success count", () => {
      collector.recordSuccess();

      expect(collector.successCount).toBe(1);
    });

    it("should decrement active executions", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();

      expect(collector.activeExecutions).toBe(0);
    });

    it("should track multiple successes", () => {
      collector.recordSuccess();
      collector.recordSuccess();
      collector.recordSuccess();

      expect(collector.successCount).toBe(3);
    });
  });

  describe("recordFailure", () => {
    it("should increment failure count", () => {
      collector.recordFailure();

      expect(collector.failureCount).toBe(1);
    });

    it("should decrement active executions", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordFailure();

      expect(collector.activeExecutions).toBe(0);
    });

    it("should track multiple failures", () => {
      collector.recordFailure();
      collector.recordFailure();

      expect(collector.failureCount).toBe(2);
    });
  });

  describe("recordTimeout", () => {
    it("should increment timeout count", () => {
      collector.recordTimeout();

      expect(collector.timeoutCount).toBe(1);
    });

    it("should decrement active executions", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordTimeout();

      expect(collector.activeExecutions).toBe(0);
    });

    it("should track multiple timeouts", () => {
      collector.recordTimeout();
      collector.recordTimeout();

      expect(collector.timeoutCount).toBe(2);
    });
  });

  describe("recordCanceled", () => {
    it("should increment canceled count", () => {
      collector.recordCanceled();

      expect(collector.canceledCount).toBe(1);
    });

    it("should decrement active executions", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordCanceled();

      expect(collector.activeExecutions).toBe(0);
    });

    it("should track multiple cancellations", () => {
      collector.recordCanceled();
      collector.recordCanceled();
      collector.recordCanceled();

      expect(collector.canceledCount).toBe(3);
    });
  });

  describe("getMetrics", () => {
    it("should return complete metrics snapshot", () => {
      // Simulate some activity
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();
      collector.incrementActive();
      collector.recordFailure();

      const metrics = collector.getMetrics();

      expect(metrics.queueLength).toBe(1);
      expect(metrics.activeExecutions).toBe(0);
      expect(metrics.totalEnqueued).toBe(3);
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.timeoutCount).toBe(0);
      expect(metrics.canceledCount).toBe(0);
      expect(metrics.timestamp).toBeDefined();
    });

    it("should return a new snapshot each time", () => {
      const metrics1 = collector.getMetrics();
      collector.incrementEnqueued();
      const metrics2 = collector.getMetrics();

      expect(metrics1.totalEnqueued).toBe(0);
      expect(metrics2.totalEnqueued).toBe(1);
    });
  });

  describe("reset", () => {
    it("should reset all counters to zero", () => {
      // Set up some state
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();
      collector.recordFailure();
      collector.recordTimeout();
      collector.recordCanceled();

      // Reset
      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.queueLength).toBe(0);
      expect(metrics.activeExecutions).toBe(0);
      expect(metrics.totalEnqueued).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.timeoutCount).toBe(0);
      expect(metrics.canceledCount).toBe(0);
    });

    it("should allow metrics collection to continue after reset", () => {
      collector.incrementEnqueued();
      collector.reset();
      collector.incrementEnqueued();
      collector.incrementEnqueued();

      expect(collector.totalEnqueued).toBe(2);
    });
  });

  describe("getPrometheusMetrics", () => {
    it("should return valid Prometheus format", () => {
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();

      const prometheusOutput = collector.getPrometheusMetrics();

      // Check for required Prometheus format elements
      expect(prometheusOutput).toContain("# HELP agent_hooks_queue_length");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_queue_length gauge");
      expect(prometheusOutput).toContain("agent_hooks_queue_length 1");

      expect(prometheusOutput).toContain("# HELP agent_hooks_active_executions");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_active_executions gauge");
      expect(prometheusOutput).toContain("agent_hooks_active_executions 0");

      expect(prometheusOutput).toContain("# HELP agent_hooks_total_enqueued");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_total_enqueued counter");
      expect(prometheusOutput).toContain("agent_hooks_total_enqueued 2");

      expect(prometheusOutput).toContain("# HELP agent_hooks_success_total");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_success_total counter");
      expect(prometheusOutput).toContain("agent_hooks_success_total 1");

      expect(prometheusOutput).toContain("# HELP agent_hooks_failure_total");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_failure_total counter");
      expect(prometheusOutput).toContain("agent_hooks_failure_total 0");

      expect(prometheusOutput).toContain("# HELP agent_hooks_timeout_total");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_timeout_total counter");
      expect(prometheusOutput).toContain("agent_hooks_timeout_total 0");

      expect(prometheusOutput).toContain("# HELP agent_hooks_canceled_total");
      expect(prometheusOutput).toContain("# TYPE agent_hooks_canceled_total counter");
      expect(prometheusOutput).toContain("agent_hooks_canceled_total 0");
    });

    it("should update Prometheus output when metrics change", () => {
      const output1 = collector.getPrometheusMetrics();
      expect(output1).toContain("agent_hooks_success_total 0");

      collector.recordSuccess();
      collector.recordSuccess();

      const output2 = collector.getPrometheusMetrics();
      expect(output2).toContain("agent_hooks_success_total 2");
    });

    it("should include all metric types", () => {
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordFailure();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordTimeout();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordCanceled();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();

      const output = collector.getPrometheusMetrics();

      expect(output).toContain("agent_hooks_failure_total 1");
      expect(output).toContain("agent_hooks_timeout_total 1");
      expect(output).toContain("agent_hooks_canceled_total 1");
      expect(output).toContain("agent_hooks_success_total 1");
    });
  });

  describe("Individual Getters", () => {
    it("should provide individual metric getters", () => {
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordSuccess();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordFailure();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordTimeout();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.recordCanceled();

      expect(collector.queueLength).toBe(1);
      expect(collector.activeExecutions).toBe(0);
      expect(collector.totalEnqueued).toBe(5);
      expect(collector.successCount).toBe(1);
      expect(collector.failureCount).toBe(1);
      expect(collector.timeoutCount).toBe(1);
      expect(collector.canceledCount).toBe(1);
    });
  });

  describe("Realistic Workflow Scenarios", () => {
    it("should track a typical successful execution workflow", () => {
      // Hook is enqueued
      collector.incrementEnqueued();
      expect(collector.queueLength).toBe(1);
      expect(collector.totalEnqueued).toBe(1);

      // Execution starts
      collector.incrementActive();
      expect(collector.queueLength).toBe(0);
      expect(collector.activeExecutions).toBe(1);

      // Execution succeeds
      collector.recordSuccess();
      expect(collector.activeExecutions).toBe(0);
      expect(collector.successCount).toBe(1);
    });

    it("should track a failed execution with retries", () => {
      // Hook is enqueued
      collector.incrementEnqueued();

      // First attempt starts
      collector.incrementActive();
      expect(collector.activeExecutions).toBe(1);

      // First attempt fails (but will retry, so we don't record failure yet)
      // In real implementation, we only record final outcome
      // For this test, simulate final failure after retries
      collector.recordFailure();

      expect(collector.activeExecutions).toBe(0);
      expect(collector.failureCount).toBe(1);
    });

    it("should track multiple concurrent executions", () => {
      // Enqueue 5 hooks
      for (let i = 0; i < 5; i++) {
        collector.incrementEnqueued();
      }
      expect(collector.queueLength).toBe(5);
      expect(collector.totalEnqueued).toBe(5);

      // Start 3 executions (concurrency limit)
      collector.incrementActive();
      collector.incrementActive();
      collector.incrementActive();
      expect(collector.queueLength).toBe(2);
      expect(collector.activeExecutions).toBe(3);

      // First execution succeeds
      collector.recordSuccess();
      expect(collector.activeExecutions).toBe(2);
      expect(collector.successCount).toBe(1);

      // Start another from queue
      collector.incrementActive();
      expect(collector.queueLength).toBe(1);
      expect(collector.activeExecutions).toBe(3);

      // Second execution times out
      collector.recordTimeout();
      expect(collector.activeExecutions).toBe(2);
      expect(collector.timeoutCount).toBe(1);

      // Third execution fails
      collector.recordFailure();
      expect(collector.activeExecutions).toBe(1);
      expect(collector.failureCount).toBe(1);

      // Start last from queue
      collector.incrementActive();
      expect(collector.queueLength).toBe(0);
      expect(collector.activeExecutions).toBe(2);

      // Fourth execution canceled
      collector.recordCanceled();
      expect(collector.activeExecutions).toBe(1);
      expect(collector.canceledCount).toBe(1);

      // Fifth execution succeeds
      collector.recordSuccess();
      expect(collector.activeExecutions).toBe(0);
      expect(collector.successCount).toBe(2);

      // Final state
      const metrics = collector.getMetrics();
      expect(metrics.totalEnqueued).toBe(5);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.timeoutCount).toBe(1);
      expect(metrics.canceledCount).toBe(1);
    });

    it("should handle shutdown scenario", () => {
      // Enqueue and start some executions
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementEnqueued();
      collector.incrementActive();
      collector.incrementActive();

      expect(collector.queueLength).toBe(1);
      expect(collector.activeExecutions).toBe(2);

      // Shutdown cancels active executions
      collector.recordCanceled();
      collector.recordCanceled();

      expect(collector.activeExecutions).toBe(0);
      expect(collector.canceledCount).toBe(2);
      // Queue length remains (hooks that never started)
      expect(collector.queueLength).toBe(1);
    });
  });
});
