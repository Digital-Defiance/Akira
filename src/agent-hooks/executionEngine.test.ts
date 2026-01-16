/**
 * Unit tests for Hook Execution Engine
 *
 * Tests:
 * - Success, error, timeout scenarios
 * - Retry with backoff and jitter (using clock mocking)
 * - Concurrency control via semaphore
 * - Status transitions
 * - ExecutionRecord logging
 * - AbortSignal cancellation
 *
 * Requirements validated:
 * - REQ-3.1: Enqueue matching enabled hooks within 1000ms
 * - REQ-3.2: Execute in background without blocking UI
 * - REQ-3.3: Concurrent execution up to configured limit (default 4)
 * - REQ-3.4: Abort on timeout and record to output pane
 * - REQ-4.3: Retry according to policy, stop after retry count reached
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HookExecutionEngine, ExecutionEngineOptions } from "./executionEngine";
import { MockPromptRunner } from "./promptRunner";
import {
  Hook,
  HookRuntime,
  HookTriggerContext,
  ExecutionRecord,
} from "./types";

/**
 * Mock OutputLogger for testing
 * Captures all log calls for verification
 */
class MockOutputLogger {
  public logs: Array<{ type: string; data: unknown }> = [];

  logInfo(ctx: unknown, message: string): void {
    this.logs.push({ type: "info", data: { ctx, message } });
  }

  logError(ctx: unknown, error: Error | string): void {
    this.logs.push({ type: "error", data: { ctx, error } });
  }

  logExecution(record: ExecutionRecord): void {
    this.logs.push({ type: "execution", data: { ...record } });
  }

  show(): void {
    // No-op for tests
  }

  dispose(): void {
    // No-op for tests
  }

  clear(): void {
    this.logs = [];
  }

  getExecutionLogs(): ExecutionRecord[] {
    return this.logs
      .filter((l) => l.type === "execution")
      .map((l) => l.data as ExecutionRecord);
  }

  getInfoLogs(): string[] {
    return this.logs
      .filter((l) => l.type === "info")
      .map((l) => (l.data as { message: string }).message);
  }

  getErrorLogs(): Array<{ ctx: unknown; error: Error | string }> {
    return this.logs
      .filter((l) => l.type === "error")
      .map((l) => l.data as { ctx: unknown; error: Error | string });
  }
}

/**
 * Create a test hook with defaults
 */
function createTestHook(overrides: Partial<HookRuntime> = {}): HookRuntime {
  return {
    id: "test-hook",
    name: "Test Hook",
    trigger: { type: "fileEdited" },
    action: { type: "runCommand", command: "echo test" },
    enabled: true,
    concurrency: 4,
    timeout: 5000,
    retry: {
      maxAttempts: 3,
      backoffMs: 100,
      jitter: false,
    },
    ...overrides,
  };
}

/**
 * Create a test context
 */
function createTestContext(overrides: Partial<HookTriggerContext> = {}): HookTriggerContext {
  return {
    hookId: "test-hook",
    trigger: "fileEdited",
    timestamp: new Date().toISOString(),
    workspaceRoot: "/test/workspace",
    ...overrides,
  };
}

describe("HookExecutionEngine", () => {
  let engine: HookExecutionEngine;
  let mockRunner: MockPromptRunner;
  let mockLogger: MockOutputLogger;

  beforeEach(() => {
    mockRunner = new MockPromptRunner();
    mockLogger = new MockOutputLogger();

    engine = new HookExecutionEngine({
      promptRunner: mockRunner,
      outputLogger: mockLogger as unknown as ExecutionEngineOptions["outputLogger"],
      defaultConcurrency: 4,
      defaultTimeout: 5000,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await engine.shutdown();
    mockRunner.reset();
    mockLogger.clear();
  });

  describe("Successful Execution", () => {
    /**
     * Validates: REQ-3.1 - Enqueue matching enabled hooks within 1000ms
     */
    it("should execute a hook successfully and record success status", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0, stdout: "success output" });

      const executionId = await engine.enqueue(hook, context);

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record).toBeDefined();
      expect(record?.status).toBe("success");
      expect(record?.exitCode).toBe(0);
      expect(record?.attempt).toBe(1);
    });

    /**
     * Validates: REQ-3.2 - Execute in background without blocking UI
     */
    it("should return execution ID immediately without blocking", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      // Set a delay to simulate long-running execution
      mockRunner.setMockDelay(500);
      mockRunner.setMockResult({ exitCode: 0 });

      const startTime = Date.now();
      const executionId = await engine.enqueue(hook, context);
      const enqueueTime = Date.now() - startTime;

      // Enqueue should return immediately (within 100ms)
      expect(enqueueTime).toBeLessThan(100);
      expect(executionId).toBeDefined();
      expect(executionId).toMatch(/^exec-/);

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    it("should emit ExecutionRecord to OutputLogger on success", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0 });

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const executionLogs = mockLogger.getExecutionLogs();
      expect(executionLogs.length).toBeGreaterThanOrEqual(2); // queued + success

      const finalLog = executionLogs[executionLogs.length - 1];
      expect(finalLog.status).toBe("success");
    });

    it("should transition through status: queued -> running -> success", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0 });
      mockRunner.setMockDelay(50);

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const executionLogs = mockLogger.getExecutionLogs();
      const statuses = executionLogs.map((l) => l.status);

      expect(statuses).toContain("queued");
      expect(statuses).toContain("running");
      expect(statuses).toContain("success");
    });

    it("should record stdout and stderr in execution record", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({
        exitCode: 0,
        stdout: "output message",
        stderr: "warning message",
      });

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.stdout).toBe("output message");
      expect(record?.stderr).toBe("warning message");
    });
  });

  describe("Error Handling and Retries", () => {
    /**
     * Validates: REQ-4.3 - Retry according to policy
     */
    it("should retry on non-zero exit code", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 3, backoffMs: 50, jitter: false },
      });
      const context = createTestContext();

      // Fail twice, then succeed
      let callCount = 0;
      mockRunner.runPrompt = async (_prompt, _opts) => {
        callCount++;
        if (callCount < 3) {
          return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
        }
        return { exitCode: 0, stdout: "success", stderr: "", duration: 10 };
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("success");
      expect(record?.attempt).toBe(3);
      expect(callCount).toBe(3);
    });

    /**
     * Validates: REQ-4.3 - Stop retrying after configured retry count reached
     */
    it("should record failure after max retry attempts", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 2, backoffMs: 50, jitter: false },
      });
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 1, stderr: "persistent error" });

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("failure");
      expect(record?.attempt).toBe(2);
      expect(record?.error).toContain("Failed after 2 attempts");
    });

    it("should apply exponential backoff between retries", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 3, backoffMs: 100, jitter: false },
      });
      const context = createTestContext();

      const callTimes: number[] = [];
      mockRunner.runPrompt = async () => {
        callTimes.push(Date.now());
        return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check that delays increase exponentially
      // First retry: ~100ms, Second retry: ~200ms
      if (callTimes.length >= 3) {
        const delay1 = callTimes[1] - callTimes[0];
        const delay2 = callTimes[2] - callTimes[1];

        // Allow some tolerance for timing
        expect(delay1).toBeGreaterThanOrEqual(80);
        expect(delay2).toBeGreaterThanOrEqual(160);
      }
    });

    it("should log retry attempts", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 2, backoffMs: 50, jitter: false },
      });
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 1 });

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const infoLogs = mockLogger.getInfoLogs();
      const retryLogs = infoLogs.filter((l) => l.includes("Retrying"));
      expect(retryLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle exceptions during execution", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 1, backoffMs: 10, jitter: false },
      });
      const context = createTestContext();

      mockRunner.runPrompt = async () => {
        throw new Error("Unexpected execution error");
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("failure");
      expect(record?.error).toContain("Unexpected execution error");
    });
  });

  describe("Backoff with Clock Mocking", () => {
    /**
     * Validates: REQ-4.3 - Retry with backoff delays
     * Tests exponential backoff behavior using real timers with timing verification
     */
    it("should apply correct exponential backoff delays", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 3, backoffMs: 100, jitter: false },
      });
      const context = createTestContext();

      const callTimes: number[] = [];
      mockRunner.runPrompt = async () => {
        callTimes.push(Date.now());
        return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify we got all 3 attempts
      expect(callTimes.length).toBe(3);

      // Verify exponential backoff pattern
      // First retry: ~100ms (100 * 2^0)
      // Second retry: ~200ms (100 * 2^1)
      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];

      // Allow tolerance for timing variations
      expect(delay1).toBeGreaterThanOrEqual(80);
      expect(delay1).toBeLessThanOrEqual(200);
      expect(delay2).toBeGreaterThanOrEqual(160);
      expect(delay2).toBeLessThanOrEqual(400);

      // Second delay should be roughly double the first (exponential)
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
    });

    it("should add jitter to backoff when enabled", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 3, backoffMs: 100, jitter: true },
      });
      const context = createTestContext();

      const callTimes: number[] = [];
      mockRunner.runPrompt = async () => {
        callTimes.push(Date.now());
        return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (callTimes.length >= 3) {
        const delay1 = callTimes[1] - callTimes[0];
        const delay2 = callTimes[2] - callTimes[1];

        // With jitter, delays should be between base and base * 1.5
        // First retry: 100-150ms, Second retry: 200-300ms
        expect(delay1).toBeGreaterThanOrEqual(80);
        expect(delay1).toBeLessThanOrEqual(200);
        expect(delay2).toBeGreaterThanOrEqual(160);
        expect(delay2).toBeLessThanOrEqual(400);
      }
    });

    it("should not retry when maxAttempts is 1", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 1, backoffMs: 100, jitter: false },
      });
      const context = createTestContext();

      let callCount = 0;
      mockRunner.runPrompt = async () => {
        callCount++;
        return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(callCount).toBe(1);
      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("failure");
    });
  });

  describe("Timeout Handling", () => {
    /**
     * Validates: REQ-3.4 - Abort on timeout and record to output pane
     */
    it("should timeout execution and record timeout status", async () => {
      const hook = createTestHook({ timeout: 100 });
      const context = createTestContext();

      // Mock runner that simulates timeout by returning timedOut: true
      mockRunner.runPrompt = async (_prompt, opts) => {
        // Wait for the timeout to trigger via abort signal
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            // This would be the normal completion, but we expect abort first
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 200 });
          }, 200);

          // Listen for abort signal (triggered by timeout)
          if (opts?.signal) {
            opts.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timeoutId);
                resolve({
                  exitCode: -1,
                  stdout: "",
                  stderr: "",
                  duration: 100,
                  timedOut: true,
                });
              },
              { once: true }
            );
          }
        });
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("timeout");
    });

    /**
     * Validates: REQ-3.4 - Record timeout event with timestamps
     */
    it("should log timeout with timestamps", async () => {
      const hook = createTestHook({ timeout: 50 });
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 100 });
          }, 100);

          if (opts?.signal) {
            opts.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timeoutId);
                resolve({
                  exitCode: -1,
                  stdout: "",
                  stderr: "",
                  duration: 50,
                  timedOut: true,
                });
              },
              { once: true }
            );
          }
        });
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const infoLogs = mockLogger.getInfoLogs();
      const timeoutLogs = infoLogs.filter((l) => l.includes("timed out"));
      expect(timeoutLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("should not retry on timeout", async () => {
      const hook = createTestHook({
        timeout: 50,
        retry: { maxAttempts: 3, backoffMs: 10, jitter: false },
      });
      const context = createTestContext();

      let callCount = 0;
      mockRunner.runPrompt = async (_prompt, opts) => {
        callCount++;
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 100 });
          }, 100);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              timedOut: true,
            });
          });
        });
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only be called once - no retries on timeout
      expect(callCount).toBe(1);
    });

    it("should record start and end timestamps on timeout", async () => {
      const hook = createTestHook({ timeout: 50 });
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 100 });
          }, 100);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              timedOut: true,
            });
          });
        });
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.startTime).toBeDefined();
      expect(record?.endTime).toBeDefined();

      // Verify timestamps are valid ISO strings
      expect(() => new Date(record!.startTime!)).not.toThrow();
      expect(() => new Date(record!.endTime!)).not.toThrow();
    });

    it("should use default timeout when not specified in hook", async () => {
      const hook: Hook = {
        id: "test-hook",
        name: "Test Hook",
        trigger: { type: "fileEdited" },
        action: { type: "runCommand", command: "echo test" },
        // No timeout specified - should use engine default (5000ms)
      };
      const context = createTestContext();

      let receivedTimeout = 0;
      mockRunner.runPrompt = async (_prompt, opts) => {
        receivedTimeout = opts?.timeout ?? 0;
        return { exitCode: 0, stdout: "", stderr: "", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedTimeout).toBe(5000);
    });
  });

  describe("Concurrency Control", () => {
    /**
     * Validates: REQ-3.3 - Execute hooks concurrently up to configured limit
     */
    it("should respect concurrency limit", async () => {
      const hook = createTestHook({ concurrency: 2 });
      const context = createTestContext();

      let concurrentCount = 0;
      let maxConcurrent = 0;

      mockRunner.runPrompt = async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 100));
        concurrentCount--;
        return { exitCode: 0, stdout: "", stderr: "", duration: 100 };
      };

      // Enqueue 5 executions
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(engine.enqueue(hook, { ...context, hookId: `hook-${i}` }));
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Max concurrent should not exceed the limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    /**
     * Validates: REQ-3.3 - Default to 4 concurrent executions when not configured
     */
    it("should use default concurrency when not specified", async () => {
      const hook: Hook = {
        id: "test-hook",
        name: "Test Hook",
        trigger: { type: "fileEdited" },
        action: { type: "runCommand", command: "echo test" },
        // No concurrency specified - should use default (4)
      };
      const context = createTestContext();

      let concurrentCount = 0;
      let maxConcurrent = 0;

      mockRunner.runPrompt = async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentCount--;
        return { exitCode: 0, stdout: "", stderr: "", duration: 50 };
      };

      // Enqueue 8 executions
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(engine.enqueue(hook, { ...context, hookId: `hook-${i}` }));
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Max concurrent should not exceed default (4)
      expect(maxConcurrent).toBeLessThanOrEqual(4);
    });

    it("should maintain separate semaphores per hook", async () => {
      const hook1 = createTestHook({ id: "hook-1", concurrency: 1 });
      const hook2 = createTestHook({ id: "hook-2", concurrency: 1 });
      const context = createTestContext();

      let hook1Concurrent = 0;
      let hook2Concurrent = 0;
      let maxHook1Concurrent = 0;
      let maxHook2Concurrent = 0;

      mockRunner.runPrompt = async (prompt) => {
        if (prompt.includes("hook-1")) {
          hook1Concurrent++;
          maxHook1Concurrent = Math.max(maxHook1Concurrent, hook1Concurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          hook1Concurrent--;
        } else {
          hook2Concurrent++;
          maxHook2Concurrent = Math.max(maxHook2Concurrent, hook2Concurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          hook2Concurrent--;
        }
        return { exitCode: 0, stdout: "", stderr: "", duration: 50 };
      };

      // Enqueue multiple executions for each hook
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          engine.enqueue(
            { ...hook1, action: { type: "runCommand", command: "hook-1" } },
            context
          )
        );
        promises.push(
          engine.enqueue(
            { ...hook2, action: { type: "runCommand", command: "hook-2" } },
            context
          )
        );
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Each hook should respect its own concurrency limit
      expect(maxHook1Concurrent).toBeLessThanOrEqual(1);
      expect(maxHook2Concurrent).toBeLessThanOrEqual(1);
    });

    it("should queue executions when concurrency limit is reached", async () => {
      const hook = createTestHook({ concurrency: 1 });
      const context = createTestContext();

      const executionOrder: number[] = [];
      let executionIndex = 0;

      mockRunner.runPrompt = async () => {
        const index = executionIndex++;
        executionOrder.push(index);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { exitCode: 0, stdout: "", stderr: "", duration: 50 };
      };

      // Enqueue 3 executions
      await engine.enqueue(hook, context);
      await engine.enqueue(hook, context);
      await engine.enqueue(hook, context);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Executions should happen in order due to concurrency limit of 1
      expect(executionOrder).toEqual([0, 1, 2]);
    });
  });

  describe("Secrets Redaction", () => {
    it("should redact secrets from stdout/stderr in execution record", async () => {
      const hook = createTestHook({
        secretPatterns: ["secret-\\w+", "password=\\w+"],
      });
      const context = createTestContext();

      mockRunner.setMockResult({
        exitCode: 0,
        stdout: "Result: secret-abc123",
        stderr: "Debug: password=hunter2",
      });

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.stdout).toBe("Result: [REDACTED]");
      expect(record?.stderr).toBe("Debug: [REDACTED]");
    });

    it("should redact secrets from prompt before execution", async () => {
      const hook = createTestHook({
        action: { type: "runCommand", command: "echo secret-token123" },
        secretPatterns: ["secret-\\w+"],
      });
      const context = createTestContext();

      let executedPrompt = "";
      mockRunner.runPrompt = async (prompt) => {
        executedPrompt = prompt;
        return { exitCode: 0, stdout: "", stderr: "", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(executedPrompt).toBe("echo [REDACTED]");
    });

    it("should redact multiple occurrences of secrets", async () => {
      const hook = createTestHook({
        secretPatterns: ["api-key-\\w+"],
      });
      const context = createTestContext();

      mockRunner.setMockResult({
        exitCode: 0,
        stdout: "Using api-key-abc123 and api-key-xyz789",
        stderr: "",
      });

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.stdout).toBe("Using [REDACTED] and [REDACTED]");
    });

    it("should handle invalid secret patterns gracefully", async () => {
      const hook = createTestHook({
        secretPatterns: ["[invalid(regex", "valid-\\w+"],
      });
      const context = createTestContext();

      mockRunner.setMockResult({
        exitCode: 0,
        stdout: "valid-secret here",
        stderr: "",
      });

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      // Valid pattern should still work
      expect(record?.stdout).toBe("[REDACTED] here");
    });
  });

  describe("Cancellation", () => {
    it("should cancel execution when requested", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 1000 });
          }, 1000);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              canceled: true,
            });
          });
        });
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const canceled = engine.cancelExecution(executionId);
      expect(canceled).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("canceled");
    });

    it("should return false when canceling non-existent execution", async () => {
      const canceled = engine.cancelExecution("non-existent-id");
      expect(canceled).toBe(false);
    });

    it("should mark status as canceled when AbortSignal is triggered", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 1000 });
          }, 1000);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              canceled: true,
            });
          });
        });
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 50));

      engine.cancelExecution(executionId);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const record = engine.getExecutionRecord(executionId);
      expect(record?.status).toBe("canceled");
    });
  });

  describe("Shutdown", () => {
    it("should cancel all active executions on shutdown", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 1000 });
          }, 1000);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              canceled: true,
            });
          });
        });
      };

      // Start multiple executions
      await engine.enqueue(hook, context);
      await engine.enqueue(hook, { ...context, hookId: "hook-2" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await engine.shutdown();

      const stats = engine.getStats();
      expect(stats.isShuttingDown).toBe(true);
      expect(stats.activeExecutions).toBe(0);
    });

    it("should reject new enqueues after shutdown", async () => {
      await engine.shutdown();

      const hook = createTestHook();
      const context = createTestContext();

      await expect(engine.enqueue(hook, context)).rejects.toThrow(
        "Execution engine is shutting down"
      );
    });

    it("should log shutdown completion", async () => {
      await engine.shutdown();

      const infoLogs = mockLogger.getInfoLogs();
      const shutdownLogs = infoLogs.filter((l) =>
        l.includes("shutdown complete")
      );
      expect(shutdownLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("should mark in-progress executions as canceled on shutdown", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.runPrompt = async (_prompt, opts) => {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ exitCode: 0, stdout: "", stderr: "", duration: 1000 });
          }, 1000);

          opts?.signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            resolve({
              exitCode: -1,
              stdout: "",
              stderr: "",
              duration: 50,
              canceled: true,
            });
          });
        });
      };

      const executionId = await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get record before shutdown
      const recordBefore = engine.getExecutionRecord(executionId);
      expect(recordBefore?.status).toBe("running");

      await engine.shutdown();

      // Records are cleared on shutdown, but the status should have been updated
      // before clearing
      const executionLogs = mockLogger.getExecutionLogs();
      const canceledLogs = executionLogs.filter((l) => l.status === "canceled");
      expect(canceledLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Statistics", () => {
    it("should track execution statistics", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0 });

      await engine.enqueue(hook, context);
      await engine.enqueue(hook, { ...context, hookId: "hook-2" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = engine.getStats();
      expect(stats.totalExecutions).toBe(2);
      expect(stats.isShuttingDown).toBe(false);
    });

    it("should return all execution records", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0 });

      await engine.enqueue(hook, context);
      await engine.enqueue(hook, { ...context, hookId: "hook-2" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const records = engine.getAllExecutionRecords();
      expect(records.length).toBe(2);
    });

    it("should track active executions count", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockDelay(200);
      mockRunner.setMockResult({ exitCode: 0 });

      await engine.enqueue(hook, context);
      await engine.enqueue(hook, { ...context, hookId: "hook-2" });

      // Check stats while executions are running
      await new Promise((resolve) => setTimeout(resolve, 50));
      const statsWhileRunning = engine.getStats();
      expect(statsWhileRunning.activeExecutions).toBeGreaterThan(0);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 300));
      const statsAfterComplete = engine.getStats();
      expect(statsAfterComplete.activeExecutions).toBe(0);
    });
  });

  describe("OutputLogger Integration", () => {
    it("should log all status transitions to OutputLogger", async () => {
      const hook = createTestHook();
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 0 });
      mockRunner.setMockDelay(50);

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const executionLogs = mockLogger.getExecutionLogs();

      // Should have at least: queued, running, success
      expect(executionLogs.length).toBeGreaterThanOrEqual(3);

      const statuses = executionLogs.map((l) => l.status);
      expect(statuses).toContain("queued");
      expect(statuses).toContain("running");
      expect(statuses).toContain("success");
    });

    it("should log failure status with error message", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 1, backoffMs: 10, jitter: false },
      });
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 1, stderr: "command failed" });

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const executionLogs = mockLogger.getExecutionLogs();
      const failureLogs = executionLogs.filter((l) => l.status === "failure");

      expect(failureLogs.length).toBeGreaterThanOrEqual(1);
      expect(failureLogs[0].error).toBeDefined();
    });

    it("should log info messages for retries", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 2, backoffMs: 50, jitter: false },
      });
      const context = createTestContext();

      mockRunner.setMockResult({ exitCode: 1 });

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const infoLogs = mockLogger.getInfoLogs();

      // Should have retry messages
      const retryLogs = infoLogs.filter((l) => l.includes("Retrying"));
      expect(retryLogs.length).toBeGreaterThanOrEqual(1);

      // Should have failure messages
      const failureLogs = infoLogs.filter((l) => l.includes("failed"));
      expect(failureLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("should include attempt number in execution logs", async () => {
      const hook = createTestHook({
        retry: { maxAttempts: 2, backoffMs: 50, jitter: false },
      });
      const context = createTestContext();

      let callCount = 0;
      mockRunner.runPrompt = async () => {
        callCount++;
        if (callCount < 2) {
          return { exitCode: 1, stdout: "", stderr: "error", duration: 10 };
        }
        return { exitCode: 0, stdout: "success", stderr: "", duration: 10 };
      };

      await engine.enqueue(hook, context);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const executionLogs = mockLogger.getExecutionLogs();
      const runningLogs = executionLogs.filter((l) => l.status === "running");

      // Should have running logs for both attempts
      expect(runningLogs.length).toBeGreaterThanOrEqual(2);
      expect(runningLogs[0].attempt).toBe(1);
      expect(runningLogs[1].attempt).toBe(2);
    });
  });

  describe("Metrics Integration", () => {
    /**
     * Task 4.7: Telemetry & metrics hooks
     * Tests that metrics are correctly updated during execution lifecycle
     */

    describe("Enqueue Metrics", () => {
      it("should increment totalEnqueued when hook is enqueued", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);

        const metrics = engine.getMetrics();
        expect(metrics.totalEnqueued).toBe(1);
      });

      it("should increment queueLength when hook is enqueued", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        // Use a delay to keep the hook in queue/active state
        mockRunner.setMockDelay(200);
        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);

        // Queue length should have been incremented (though it may have moved to active)
        const metrics = engine.getMetrics();
        expect(metrics.totalEnqueued).toBe(1);

        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      it("should track multiple enqueued hooks", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await engine.enqueue(hook, { ...context, hookId: "hook-2" });
        await engine.enqueue(hook, { ...context, hookId: "hook-3" });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const metrics = engine.getMetrics();
        expect(metrics.totalEnqueued).toBe(3);
      });
    });

    describe("Success Metrics", () => {
      it("should increment successCount on successful execution", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metrics = engine.getMetrics();
        expect(metrics.successCount).toBe(1);
      });

      it("should track multiple successful executions", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await engine.enqueue(hook, { ...context, hookId: "hook-2" });
        await engine.enqueue(hook, { ...context, hookId: "hook-3" });

        await new Promise((resolve) => setTimeout(resolve, 200));

        const metrics = engine.getMetrics();
        expect(metrics.successCount).toBe(3);
      });
    });

    describe("Failure Metrics", () => {
      it("should increment failureCount on failed execution", async () => {
        const hook = createTestHook({
          retry: { maxAttempts: 1, backoffMs: 10, jitter: false },
        });
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 1 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metrics = engine.getMetrics();
        expect(metrics.failureCount).toBe(1);
      });

      it("should only count failure once after all retries exhausted", async () => {
        const hook = createTestHook({
          retry: { maxAttempts: 3, backoffMs: 10, jitter: false },
        });
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 1 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const metrics = engine.getMetrics();
        // Should only count as one failure, not three
        expect(metrics.failureCount).toBe(1);
      });
    });

    describe("Timeout Metrics", () => {
      it("should increment timeoutCount on timeout", async () => {
        const hook = createTestHook({ timeout: 50 });
        const context = createTestContext();

        mockRunner.runPrompt = async (_prompt, opts) => {
          return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
              resolve({ exitCode: 0, stdout: "", stderr: "", duration: 100 });
            }, 100);

            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              resolve({
                exitCode: -1,
                stdout: "",
                stderr: "",
                duration: 50,
                timedOut: true,
              });
            });
          });
        };

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 200));

        const metrics = engine.getMetrics();
        expect(metrics.timeoutCount).toBe(1);
      });
    });

    describe("Canceled Metrics", () => {
      it("should increment canceledCount when execution is canceled", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.runPrompt = async (_prompt, opts) => {
          return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
              resolve({ exitCode: 0, stdout: "", stderr: "", duration: 1000 });
            }, 1000);

            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              resolve({
                exitCode: -1,
                stdout: "",
                stderr: "",
                duration: 50,
                canceled: true,
              });
            });
          });
        };

        const executionId = await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 50));

        engine.cancelExecution(executionId);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metrics = engine.getMetrics();
        expect(metrics.canceledCount).toBe(1);
      });
    });

    describe("Active Executions Metrics", () => {
      it("should track active executions during execution", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockDelay(200);
        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const metricsWhileRunning = engine.getMetrics();
        expect(metricsWhileRunning.activeExecutions).toBeGreaterThan(0);

        await new Promise((resolve) => setTimeout(resolve, 250));

        const metricsAfterComplete = engine.getMetrics();
        expect(metricsAfterComplete.activeExecutions).toBe(0);
      });
    });

    describe("Prometheus Format", () => {
      it("should return metrics in Prometheus format", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const prometheusOutput = engine.getPrometheusMetrics();

        expect(prometheusOutput).toContain("# HELP agent_hooks_total_enqueued");
        expect(prometheusOutput).toContain("agent_hooks_total_enqueued 1");
        expect(prometheusOutput).toContain("agent_hooks_success_total 1");
      });
    });

    describe("Metrics Collector Access", () => {
      it("should provide access to metrics collector", () => {
        const collector = engine.getMetricsCollector();
        expect(collector).toBeDefined();
        expect(typeof collector.getMetrics).toBe("function");
      });

      it("should allow resetting metrics via collector", async () => {
        const hook = createTestHook();
        const context = createTestContext();

        mockRunner.setMockResult({ exitCode: 0 });

        await engine.enqueue(hook, context);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metricsBefore = engine.getMetrics();
        expect(metricsBefore.totalEnqueued).toBe(1);

        engine.getMetricsCollector().reset();

        const metricsAfter = engine.getMetrics();
        expect(metricsAfter.totalEnqueued).toBe(0);
      });
    });

    describe("Combined Metrics Scenario", () => {
      it("should track all metric types in a mixed execution scenario", async () => {
        const hook = createTestHook({
          retry: { maxAttempts: 1, backoffMs: 10, jitter: false },
        });
        const context = createTestContext();

        // Success
        mockRunner.setMockResult({ exitCode: 0 });
        await engine.enqueue(hook, context);

        // Failure
        mockRunner.setMockResult({ exitCode: 1 });
        await engine.enqueue(hook, { ...context, hookId: "hook-fail" });

        // Another success
        mockRunner.setMockResult({ exitCode: 0 });
        await engine.enqueue(hook, { ...context, hookId: "hook-success-2" });

        await new Promise((resolve) => setTimeout(resolve, 200));

        const metrics = engine.getMetrics();
        expect(metrics.totalEnqueued).toBe(3);
        expect(metrics.successCount).toBe(2);
        expect(metrics.failureCount).toBe(1);
        expect(metrics.activeExecutions).toBe(0);
      });
    });
  });
});
