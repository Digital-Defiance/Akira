/**
 * Context Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ContextManager, ContextEntry } from "./context-manager";
import { getEventBus, resetEventBus } from "./event-bus";

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
      // Add enough entries to trigger summarization
      for (let i = 0; i < 10; i++) {
        await contextManager.addEntry({
          type: "user",
          content: `Message ${i}: ${"a".repeat(150)}`,
        });
      }

      const stats = contextManager.getStats();
      
      // Should have summary entry + 2 recent entries = 3 total
      expect(stats.entryCount).toBe(3);
    });

    it("should reduce token count after summarization", async () => {
      // Track token count before summarization
      for (let i = 0; i < 8; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(150),
        });
      }

      const statsBeforeSummarization = contextManager.getStats();
      const tokensBeforeSummarization = statsBeforeSummarization.currentTokens;

      // Trigger summarization
      for (let i = 0; i < 3; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(150),
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

      // Add entries to trigger summarization
      for (let i = 0; i < 10; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(150),
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
      // Trigger summarization
      for (let i = 0; i < 10; i++) {
        await contextManager.addEntry({
          type: "user",
          content: "a".repeat(150),
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
      // Add several entries
      for (let i = 0; i < 10; i++) {
        await contextManager.addEntry({
          type: "user",
          content: `Message ${i}`,
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
});
