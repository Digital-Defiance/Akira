/**
 * Context Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ContextManager, ContextEntry } from "./context-manager";
import { getEventBus, resetEventBus } from "./event-bus";
import {
  AttemptRecord,
  ExecutionAction,
  ExecutionResult,
  CheckboxState,
  TaskRecord,
  FailurePattern,
} from "./types";

describe("ContextManager", () => {
  let tempDir: string;
  let contextManager: ContextManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-"));
    contextManager = new ContextManager(tempDir, {
      maxTotalTokens: 1000,
      warningThreshold: 70,
      summarizationThreshold: 80,
      minEntriesBeforeSummarization: 5,
      retainRecentEntries: 2,
    });
    resetEventBus();
  });

  afterEach(() => {
    contextManager.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    resetEventBus();
  });

  describe("initialization", () => {
    it("should initialize with session ID", async () => {
      await contextManager.initialize("test-session-1");
      
      const stats = contextManager.getStats();
      expect(stats.currentTokens).toBe(0);
      expect(stats.entryCount).toBe(0);
      expect(stats.summarized).toBe(false);
    });

    it("should create context directory", async () => {
      await contextManager.initialize("test-session-1");
      
      const contextDir = path.join(tempDir, ".kiro", "context");
      expect(fs.existsSync(contextDir)).toBe(true);
    });
  });

  describe("adding entries", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should add user message entry", async () => {
      await contextManager.addEntry({
        type: "user",
        content: "Please fix the scheduler test hang issue",
      });

      const stats = contextManager.getStats();
      expect(stats.entryCount).toBe(1);
      expect(stats.currentTokens).toBeGreaterThan(0);
    });

    it("should add assistant response entry", async () => {
      await contextManager.addEntry({
        type: "assistant",
        content: "I'll investigate the scheduler test hang.",
      });

      const stats = contextManager.getStats();
      expect(stats.entryCount).toBe(1);
    });

    it("should estimate tokens correctly", async () => {
      // Add a 100 character message
      const content = "a".repeat(100);
      await contextManager.addEntry({
        type: "user",
        content,
      });

      const stats = contextManager.getStats();
      // ~4 chars per token = ~25 tokens
      expect(stats.currentTokens).toBeGreaterThanOrEqual(20);
      expect(stats.currentTokens).toBeLessThanOrEqual(30);
    });

    it("should accumulate token count across multiple entries", async () => {
      await contextManager.addEntry({
        type: "user",
        content: "First message",
      });
      
      const stats1 = contextManager.getStats();
      const tokens1 = stats1.currentTokens;

      await contextManager.addEntry({
        type: "assistant",
        content: "Second message",
      });

      const stats2 = contextManager.getStats();
      expect(stats2.currentTokens).toBeGreaterThan(tokens1);
      expect(stats2.entryCount).toBe(2);
    });
  });

  describe("context limits", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should emit warning when approaching limit", async () => {
      let warningEmitted = false;
      
      getEventBus().subscribe("contextLimitWarning", async () => {
        warningEmitted = true;
      });

      // Add entries to reach 70% (700 tokens out of 1000)
      // Each entry ~175 characters = ~44 tokens
      for (let i = 0; i < 16; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(175),
        });
      }

      expect(warningEmitted).toBe(true);
    });

    it("should trigger summarization at threshold", async () => {
      let summarizationTriggered = false;
      
      getEventBus().subscribe("contextSummarizationTriggered", async () => {
        summarizationTriggered = true;
      });

      // Add entries to reach 80% (800 tokens out of 1000)
      // Each entry ~200 characters = ~50 tokens
      for (let i = 0; i < 16; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      expect(summarizationTriggered).toBe(true);
    });

    it("should only summarize once per session", async () => {
      let summarizationCount = 0;
      
      getEventBus().subscribe("contextSummarizationTriggered", async () => {
        summarizationCount++;
      });

      // Add entries to exceed threshold multiple times
      for (let i = 0; i < 20; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      expect(summarizationCount).toBe(1);
    });
  });

  describe("summarization", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should retain recent entries after summarization", async () => {
      // Add enough entries to trigger summarization (need to reach 80% of 1000 tokens = 800 tokens)
      // Each entry ~200 characters = ~50 tokens, so 16 entries = 800 tokens
      for (let i = 0; i < 16; i++) {
        await contextManager.addEntry({
          type: "user",
          content: `Message ${i}: ${"a".repeat(200)}`,
        });
      }

      const stats = contextManager.getStats();
      
      // Should have summary entry + 2 recent entries = 3 total
      expect(stats.entryCount).toBe(3);
    });

    it("should reduce token count after summarization", async () => {
      // Track token count before summarization
      // Add entries to reach ~75% (750 tokens)
      for (let i = 0; i < 15; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      const statsBeforeSummarization = contextManager.getStats();
      const tokensBeforeSummarization = statsBeforeSummarization.currentTokens;

      // Trigger summarization by adding more entries to reach 80%
      for (let i = 0; i < 2; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      const statsAfterSummarization = contextManager.getStats();
      
      // Token count should be significantly reduced
      expect(statsAfterSummarization.currentTokens).toBeLessThan(tokensBeforeSummarization);
    });

    it("should mark summary entries with metadata", async () => {
      let summaryEvent: any = null;
      
      getEventBus().subscribe("contextSummarized", async (event) => {
        summaryEvent = event;
      });

      // Add entries to trigger summarization (need 80% of 1000 = 800 tokens)
      for (let i = 0; i < 16; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      expect(summaryEvent).toBeDefined();
      expect(summaryEvent.data.originalTokens).toBeGreaterThan(0);
      expect(summaryEvent.data.summaryTokens).toBeGreaterThan(0);
      expect(summaryEvent.data.entriesSummarized).toBeGreaterThan(0);
    });
  });

  describe("persistence", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should save history to disk", async () => {
      await contextManager.addEntry({
        type: "user",
        content: "Test message",
      });

      const historyPath = path.join(
        tempDir,
        ".kiro",
        "context",
        "test-session-1.history.json"
      );

      // Wait a bit for async write
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fs.existsSync(historyPath)).toBe(true);
    });

    it("should load history from disk", async () => {
      // Add some entries
      await contextManager.addEntry({
        type: "user",
        content: "First message",
      });
      await contextManager.addEntry({
        type: "assistant",
        content: "Second message",
      });

      // Wait for persistence
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create new manager and load same session
      const newManager = new ContextManager(tempDir);
      await newManager.initialize("test-session-1");

      const stats = newManager.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.currentTokens).toBeGreaterThan(0);

      newManager.dispose();
    });

    it("should save summary to separate file", async () => {
      // Trigger summarization (need 80% of 1000 = 800 tokens)
      for (let i = 0; i < 16; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(200),
        });
      }

      // Wait for async write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const summaryPath = path.join(
        tempDir,
        ".kiro",
        "context",
        "test-session-1.summary.md"
      );

      expect(fs.existsSync(summaryPath)).toBe(true);
    });
  });

  describe("statistics", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should provide accurate statistics", async () => {
      await contextManager.addEntry({
        type: "user",
        content: "a".repeat(400), // ~100 tokens
      });

      const stats = contextManager.getStats();
      
      expect(stats.currentTokens).toBeGreaterThan(0);
      expect(stats.maxTokens).toBe(1000);
      expect(stats.usagePercentage).toBeGreaterThan(0);
      expect(stats.usagePercentage).toBeLessThan(100);
      expect(stats.entryCount).toBe(1);
      expect(stats.summarized).toBe(false);
    });

    it("should update usage percentage correctly", async () => {
      await contextManager.addEntry({
        type: "user",
        content: "a".repeat(2000), // ~500 tokens = 50%
      });

      const stats = contextManager.getStats();
      
      expect(stats.usagePercentage).toBeGreaterThan(40);
      expect(stats.usagePercentage).toBeLessThan(60);
    });
  });

  describe("force summarization", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    it("should allow manual summarization trigger", async () => {
      // Add several entries with substantial content
      for (let i = 0; i < 10; i++) {
        await contextManager.addEntry({
          type: "user",
          content: `Message ${i}: ${"a".repeat(100)}`,
        });
      }

      const statsBefore = contextManager.getStats();
      
      // Force summarize
      const summary = await contextManager.forceSummarize();
      
      expect(summary.entriesSummarized).toBeGreaterThan(0);
      expect(summary.retainedEntries).toBe(2); // Our config retains 2
      expect(summary.summaryTokenCount).toBeLessThan(summary.originalTokenCount);
    });
  });

  describe("failure tracking", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    describe("Property 13: Attempt tracking", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 10 }),
        fc.array(
          fc.record({
            type: fc.constantFrom("file-write", "file-delete", "command", "llm-generate"),
            target: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.boolean(),
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.float({ min: 0, max: Math.fround(1) }).filter(n => !isNaN(n)),
      ])(
        "should track any execution attempt with timestamp, actions, outcome, and evaluation result",
        async (sessionId, taskId, iteration, actions, success, evaluationReason, confidence) => {
          /**
           * Feature: execution-reflection-loop, Property 13: Attempt tracking
           * Validates: Requirements 4.1
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop13-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          const timestamp = new Date().toISOString();
          const attempt: AttemptRecord = {
            iteration,
            timestamp,
            actions: actions as ExecutionAction[],
            result: {
              success,
              taskId,
              error: success ? undefined : "Test error",
            },
            evaluationReason,
            confidence,
          };

          await testContextManager.trackAttempt(sessionId, taskId, attempt);

          const history = await testContextManager.getFailureHistory(sessionId, taskId);
          
          expect(history).toHaveLength(1);
          expect(history[0].iteration).toBe(iteration);
          expect(history[0].timestamp).toBe(timestamp);
          expect(history[0].actions).toEqual(actions);
          expect(history[0].result.success).toBe(success);
          expect(history[0].evaluationReason).toBe(evaluationReason);
          expect(history[0].confidence).toBe(confidence);

          // Cleanup
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });

    describe("Property 14: Failure history persistence", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(
          fc.record({
            iteration: fc.integer({ min: 1, max: 10 }),
            errorMessage: fc.string({ minLength: 1, maxLength: 50 }),
            confidence: fc.float({ min: 0, max: Math.fround(0.79) }).filter(n => !isNaN(n)),
          }),
          { minLength: 1, maxLength: 5 }
        ),
      ])(
        "should maintain a queryable history of failure reasons for any task with failed attempts",
        async (sessionId, taskId, failures) => {
          /**
           * Feature: execution-reflection-loop, Property 14: Failure history persistence
           * Validates: Requirements 4.2, 4.3
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop14-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          // Track multiple failed attempts
          for (const failure of failures) {
            const attempt: AttemptRecord = {
              iteration: failure.iteration,
              timestamp: new Date().toISOString(),
              actions: [{ type: "command", target: "test" }],
              result: {
                success: false,
                taskId,
                error: failure.errorMessage,
              },
              evaluationReason: "Task incomplete",
              confidence: failure.confidence,
            };

            await testContextManager.trackAttempt(sessionId, taskId, attempt);
          }

          // Query the history
          const history = await testContextManager.getFailureHistory(sessionId, taskId);
          
          expect(history).toHaveLength(failures.length);
          
          // Verify all failures are present
          for (let i = 0; i < failures.length; i++) {
            expect(history[i].result.error).toBe(failures[i].errorMessage);
            expect(history[i].confidence).toBe(failures[i].confidence);
          }

          // Cleanup
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });

    describe("Property 15: File modification tracking", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 10 }),
      ])(
        "should track which files were modified for any execution attempt that modifies files",
        async (sessionId, taskId, filesCreated, filesModified) => {
          /**
           * Feature: execution-reflection-loop, Property 15: File modification tracking
           * Validates: Requirements 4.4
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop15-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          const attempt: AttemptRecord = {
            iteration: 1,
            timestamp: new Date().toISOString(),
            actions: [{ type: "file-write", target: "test.ts" }],
            result: {
              success: true,
              taskId,
              filesCreated,
              filesModified,
            },
            evaluationReason: "Task complete",
            confidence: 0.9,
          };

          await testContextManager.trackAttempt(sessionId, taskId, attempt);

          const history = await testContextManager.getFailureHistory(sessionId, taskId);
          
          expect(history).toHaveLength(1);
          expect(history[0].result.filesCreated).toEqual(filesCreated);
          expect(history[0].result.filesModified).toEqual(filesModified);

          // Cleanup
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });

    describe("Property 16: Context persistence", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
        fc.array(
          fc.record({
            iteration: fc.integer({ min: 1, max: 5 }),
            errorMessage: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
      ])(
        "should persist any execution context to session storage and be recoverable",
        async (sessionId, taskId, attempts) => {
          /**
           * Feature: execution-reflection-loop, Property 16: Context persistence
           * Validates: Requirements 4.5
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop16-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          // Track attempts
          for (const attemptData of attempts) {
            const attempt: AttemptRecord = {
              iteration: attemptData.iteration,
              timestamp: new Date().toISOString(),
              actions: [{ type: "command", target: "test" }],
              result: {
                success: false,
                taskId,
                error: attemptData.errorMessage,
              },
              evaluationReason: "Task incomplete",
              confidence: 0.5,
            };

            await testContextManager.trackAttempt(sessionId, taskId, attempt);
          }

          // Create a new context manager to simulate recovery
          const newContextManager = new ContextManager(testTempDir);
          await newContextManager.initialize(sessionId);

          // Verify data is recoverable
          const recoveredHistory = await newContextManager.getFailureHistory(sessionId, taskId);
          
          expect(recoveredHistory).toHaveLength(attempts.length);
          
          for (let i = 0; i < attempts.length; i++) {
            expect(recoveredHistory[i].result.error).toBe(attempts[i].errorMessage);
            expect(recoveredHistory[i].iteration).toBe(attempts[i].iteration);
          }

          // Cleanup
          newContextManager.dispose();
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });
  });

  describe("failure pattern detection", () => {
    beforeEach(async () => {
      await contextManager.initialize("test-session-1");
    });

    describe("Property 21: Persistent failure detection", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 2, max: 10 }),
      ])(
        "should recognize any sequence of 2+ consecutive iterations with the same error message as a persistent failure",
        async (sessionId, taskId, errorMessage, consecutiveCount) => {
          /**
           * Feature: execution-reflection-loop, Property 21: Persistent failure detection
           * Validates: Requirements 6.1
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop21-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          // Track consecutive attempts with the same error
          for (let i = 0; i < consecutiveCount; i++) {
            const attempt: AttemptRecord = {
              iteration: i + 1,
              timestamp: new Date().toISOString(),
              actions: [{ type: "command", target: "test" }],
              result: {
                success: false,
                taskId,
                error: errorMessage,
              },
              evaluationReason: "Task incomplete",
              confidence: 0.3,
            };

            await testContextManager.trackAttempt(sessionId, taskId, attempt);
          }

          // Detect patterns
          const patterns = await testContextManager.detectFailurePatterns(sessionId, taskId);
          
          // Should detect the persistent failure
          expect(patterns.length).toBeGreaterThan(0);
          
          // Find the pattern with our error message
          const persistentPattern = patterns.find(p => p.errorMessage === errorMessage);
          expect(persistentPattern).toBeDefined();
          expect(persistentPattern!.occurrences).toBe(consecutiveCount);
          expect(persistentPattern!.occurrences).toBeGreaterThanOrEqual(2);

          // Cleanup
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });

    describe("Property 24: Session-level pattern tracking", () => {
      test.prop([
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
        fc.uniqueArray(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)),
            errorMessage: fc.string({ minLength: 1, maxLength: 50 }),
            occurrences: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 2, maxLength: 5, selector: (item) => item.taskId }
        ),
      ])(
        "should track failure patterns across all tasks in any session to identify systemic issues",
        async (sessionId, taskFailures) => {
          /**
           * Feature: execution-reflection-loop, Property 24: Session-level pattern tracking
           * Validates: Requirements 6.5
           */
          // Create a fresh context manager for this test
          const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-test-prop24-"));
          const testContextManager = new ContextManager(testTempDir);
          await testContextManager.initialize(sessionId);

          // Track failures across multiple tasks
          for (const taskFailure of taskFailures) {
            for (let i = 0; i < taskFailure.occurrences; i++) {
              const attempt: AttemptRecord = {
                iteration: i + 1,
                timestamp: new Date().toISOString(),
                actions: [{ type: "command", target: "test" }],
                result: {
                  success: false,
                  taskId: taskFailure.taskId,
                  error: taskFailure.errorMessage,
                },
                evaluationReason: "Task incomplete",
                confidence: 0.3,
              };

              await testContextManager.trackAttempt(sessionId, taskFailure.taskId, attempt);
            }
          }

          // Collect patterns from all tasks
          const allPatterns: FailurePattern[] = [];
          for (const taskFailure of taskFailures) {
            const patterns = await testContextManager.detectFailurePatterns(sessionId, taskFailure.taskId);
            allPatterns.push(...patterns);
          }

          // Should have detected patterns for each task
          expect(allPatterns.length).toBeGreaterThanOrEqual(taskFailures.length);
          
          // Verify each task's pattern is tracked
          for (const taskFailure of taskFailures) {
            const taskPatterns = await testContextManager.detectFailurePatterns(sessionId, taskFailure.taskId);
            const pattern = taskPatterns.find(p => p.errorMessage === taskFailure.errorMessage);
            
            expect(pattern).toBeDefined();
            expect(pattern!.occurrences).toBe(taskFailure.occurrences);
          }

          // Cleanup
          testContextManager.dispose();
          fs.rmSync(testTempDir, { recursive: true, force: true });
        },
        { numRuns: 100 }
      );
    });
  });
});
