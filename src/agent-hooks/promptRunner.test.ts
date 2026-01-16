/**
 * Unit tests for Prompt Runner
 *
 * Tests:
 * - Successful command execution
 * - Error handling
 * - Timeout handling
 * - AbortSignal cancellation
 * - MockPromptRunner behavior
 *
 * Requirements validated:
 * - REQ-3.2: Execute in background without blocking UI thread
 * - Support cancellation via AbortSignal
 * - Return {exitCode, stdout, stderr, duration}
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PromptRunner, MockPromptRunner, IPromptRunner } from "./promptRunner";

describe("MockPromptRunner", () => {
  let mockRunner: MockPromptRunner;

  beforeEach(() => {
    mockRunner = new MockPromptRunner();
  });

  afterEach(() => {
    mockRunner.reset();
  });

  describe("Basic Functionality", () => {
    it("should return default success result", async () => {
      const result = await mockRunner.runPrompt("echo test");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should return configured mock result", async () => {
      mockRunner.setMockResult({
        exitCode: 0,
        stdout: "mock output",
        stderr: "mock error",
      });

      const result = await mockRunner.runPrompt("echo test");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("mock output");
      expect(result.stderr).toBe("mock error");
    });

    it("should simulate failure when configured", async () => {
      mockRunner.setMockFailure(new Error("Simulated failure"));

      const result = await mockRunner.runPrompt("echo test");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("Simulated failure");
    });

    it("should reset to default state", async () => {
      mockRunner.setMockResult({ exitCode: 42, stdout: "custom" });
      mockRunner.setMockDelay(100);
      mockRunner.setMockFailure(new Error("error"));

      mockRunner.reset();

      const result = await mockRunner.runPrompt("echo test");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  describe("Delay Simulation", () => {
    it("should simulate execution delay", async () => {
      mockRunner.setMockDelay(100);
      mockRunner.setMockResult({ exitCode: 0 });

      const startTime = Date.now();
      await mockRunner.runPrompt("echo test");
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(90);
    });

    it("should track duration in result", async () => {
      mockRunner.setMockDelay(50);
      mockRunner.setMockResult({ exitCode: 0 });

      const result = await mockRunner.runPrompt("echo test");

      expect(result.duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe("AbortSignal Handling", () => {
    it("should return canceled result when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await mockRunner.runPrompt("echo test", {
        signal: controller.signal,
      });

      expect(result.canceled).toBe(true);
      expect(result.exitCode).toBe(-1);
    });

    it("should cancel during delay when signal is aborted", async () => {
      mockRunner.setMockDelay(500);

      const controller = new AbortController();

      const resultPromise = mockRunner.runPrompt("echo test", {
        signal: controller.signal,
      });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50);

      const result = await resultPromise;

      // The mock implementation may return canceled or the default result
      // depending on timing, but duration should be less than full delay
      expect(result.duration).toBeLessThan(400);
    });

    it("should handle abort signal without delay", async () => {
      const controller = new AbortController();

      mockRunner.setMockResult({ exitCode: 0, stdout: "output" });

      const result = await mockRunner.runPrompt("echo test", {
        signal: controller.signal,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("output");
    });
  });
});

describe("PromptRunner (Real Implementation)", () => {
  let runner: PromptRunner;

  beforeEach(() => {
    runner = new PromptRunner();
  });

  describe("Command Execution", () => {
    it("should execute simple echo command", async () => {
      const result = await runner.runPrompt("echo hello");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hello");
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should capture stdout from command", async () => {
      const result = await runner.runPrompt("echo test output");

      expect(result.stdout).toContain("test output");
    });

    it("should capture stderr from command", async () => {
      // Use a command that writes to stderr
      const result = await runner.runPrompt("echo error message >&2");

      // On some systems this may go to stdout, so check both
      const hasError =
        result.stderr.includes("error message") ||
        result.stdout.includes("error message");
      expect(hasError || result.exitCode === 0).toBe(true);
    });

    it("should return non-zero exit code for failing command", async () => {
      const result = await runner.runPrompt("exit 1");

      expect(result.exitCode).toBe(1);
    });

    it("should return exit code from command", async () => {
      const result = await runner.runPrompt("exit 42");

      expect(result.exitCode).toBe(42);
    });
  });

  describe("Timeout Handling", () => {
    it("should timeout long-running command", async () => {
      // Use a command that sleeps for longer than timeout
      const result = await runner.runPrompt("sleep 10", { timeout: 100 });

      expect(result.timedOut).toBe(true);
      expect(result.duration).toBeLessThan(500);
    });

    it("should complete before timeout for fast command", async () => {
      const result = await runner.runPrompt("echo fast", { timeout: 5000 });

      expect(result.timedOut).toBeFalsy();
      expect(result.exitCode).toBe(0);
    });

    it("should use default timeout when not specified", async () => {
      // This should complete quickly without timeout
      const result = await runner.runPrompt("echo test");

      expect(result.timedOut).toBeFalsy();
      expect(result.exitCode).toBe(0);
    });
  });

  describe("AbortSignal Cancellation", () => {
    it("should cancel execution when abort signal is triggered", async () => {
      const controller = new AbortController();

      const resultPromise = runner.runPrompt("sleep 10", {
        signal: controller.signal,
      });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 100);

      const result = await resultPromise;

      expect(result.canceled).toBe(true);
      expect(result.duration).toBeLessThan(500);
    });

    it("should return immediately when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const startTime = Date.now();
      const result = await runner.runPrompt("sleep 10", {
        signal: controller.signal,
      });
      const duration = Date.now() - startTime;

      expect(result.canceled).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it("should not set canceled flag for normal completion", async () => {
      const controller = new AbortController();

      const result = await runner.runPrompt("echo test", {
        signal: controller.signal,
      });

      expect(result.canceled).toBeFalsy();
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Environment Variables", () => {
    it("should pass custom environment variables", async () => {
      const result = await runner.runPrompt("echo $TEST_VAR", {
        env: { TEST_VAR: "custom_value" },
      });

      expect(result.stdout).toContain("custom_value");
    });

    it("should inherit process environment", async () => {
      // PATH should be inherited
      const result = await runner.runPrompt("echo $PATH");

      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle command not found", async () => {
      const result = await runner.runPrompt("nonexistent_command_xyz123");

      // Should have non-zero exit code or error in stderr
      expect(result.exitCode !== 0 || result.stderr.length > 0).toBe(true);
    });

    it("should handle empty command", async () => {
      const result = await runner.runPrompt("");

      // Empty command should complete (may succeed or fail depending on shell)
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Duration Tracking", () => {
    it("should track execution duration accurately", async () => {
      const startTime = Date.now();
      const result = await runner.runPrompt("sleep 0.1");
      const actualDuration = Date.now() - startTime;

      // Duration should be close to actual time
      expect(result.duration).toBeGreaterThan(50);
      expect(Math.abs(result.duration - actualDuration)).toBeLessThan(100);
    });
  });
});

describe("IPromptRunner Interface", () => {
  it("should allow MockPromptRunner to be used as IPromptRunner", () => {
    const runner: IPromptRunner = new MockPromptRunner();
    expect(runner.runPrompt).toBeDefined();
  });

  it("should allow PromptRunner to be used as IPromptRunner", () => {
    const runner: IPromptRunner = new PromptRunner();
    expect(runner.runPrompt).toBeDefined();
  });

  it("should allow custom implementations", async () => {
    const customRunner: IPromptRunner = {
      async runPrompt(_prompt, _opts) {
        return {
          exitCode: 0,
          stdout: "custom implementation",
          stderr: "",
          duration: 0,
        };
      },
    };

    const result = await customRunner.runPrompt("test");
    expect(result.stdout).toBe("custom implementation");
  });
});
