/**
 * Unit tests for ResultsManager
 * Requirements: REQ-5.1, REQ-8.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ResultsManager, AnalysisCompletedEventData } from "./results-manager";
import { PersistenceService } from "./persistence-service";
import { AnalysisResult, PersistedResult } from "./types";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    id: "test-id-123",
    imagePath: "/workspace/images/test.png",
    timestamp: "2025-01-16T10:00:00.000Z",
    modelId: "test-model",
    inferenceMode: "local",
    duration: 1500,
    labels: [
      { label: "cat", confidence: 0.95, boundingBox: { x: 10, y: 20, width: 100, height: 80 } },
      { label: "animal", confidence: 0.88 },
    ],
    ocrText: "Sample OCR text",
    ...overrides,
  };
}

// ============================================================================
// ResultsManager Tests
// ============================================================================

describe("ResultsManager", () => {
  let tempDir: string;
  let manager: ResultsManager;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "results-manager-test-"));
    manager = new ResultsManager(tempDir);
  });

  afterEach(async () => {
    manager.dispose();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("should create manager with workspace root", () => {
      expect(manager.getWorkspaceRoot()).toBe(tempDir);
    });

    it("should accept custom persistence service", () => {
      const customService = new PersistenceService({ maxFileSizeMB: 10 });
      const customManager = new ResultsManager(tempDir, customService);
      expect(customManager.getPersistenceService()).toBe(customService);
      customManager.dispose();
    });
  });

  describe("processResult", () => {
    it("should persist analysis result", async () => {
      const result = createTestAnalysisResult();
      const persisted = await manager.processResult(result);

      expect(persisted.imagePath).toBe(result.imagePath);
      expect(persisted.timestamp).toBe(result.timestamp);
      expect(persisted.modelId).toBe(result.modelId);
      expect(persisted.fullResult).toEqual(result);
    });

    it("should create results summary", async () => {
      const result = createTestAnalysisResult();
      const persisted = await manager.processResult(result);

      expect(persisted.resultsSummary.labelCount).toBe(2);
      expect(persisted.resultsSummary.topLabels).toContain("cat");
      expect(persisted.resultsSummary.hasOcrText).toBe(true);
    });

    it("should emit analysis completed event", async () => {
      const result = createTestAnalysisResult();
      let emittedData: AnalysisCompletedEventData | undefined;

      const disposable = manager.onAnalysisCompleted((data) => {
        emittedData = data;
      });

      await manager.processResult(result);

      expect(emittedData).toBeDefined();
      expect(emittedData!.result).toEqual(result);
      expect(emittedData!.workspaceRoot).toBe(tempDir);
      expect(emittedData!.timestamp).toBeDefined();

      disposable.dispose();
    });

    it("should store result in persistence", async () => {
      const result = createTestAnalysisResult();
      await manager.processResult(result);

      const history = await manager.getHistory(tempDir);
      expect(history).toHaveLength(1);
      expect(history[0].fullResult).toEqual(result);
    });
  });

  describe("getHistory", () => {
    it("should return empty array when no results", async () => {
      const history = await manager.getHistory(tempDir);
      expect(history).toEqual([]);
    });

    it("should return all persisted results", async () => {
      const result1 = createTestAnalysisResult({ id: "id-1" });
      const result2 = createTestAnalysisResult({ id: "id-2" });

      await manager.processResult(result1);
      await manager.processResult(result2);

      const history = await manager.getHistory(tempDir);
      expect(history).toHaveLength(2);
    });

    it("should preserve result order", async () => {
      const result1 = createTestAnalysisResult({ imagePath: "/first.png" });
      const result2 = createTestAnalysisResult({ imagePath: "/second.png" });

      await manager.processResult(result1);
      await manager.processResult(result2);

      const history = await manager.getHistory(tempDir);
      expect(history[0].imagePath).toBe("/first.png");
      expect(history[1].imagePath).toBe("/second.png");
    });
  });

  describe("clearHistory", () => {
    it("should clear all results", async () => {
      const result = createTestAnalysisResult();
      await manager.processResult(result);
      await manager.processResult(result);

      await manager.clearHistory(tempDir);

      const history = await manager.getHistory(tempDir);
      expect(history).toHaveLength(0);
    });
  });

  describe("workspace root management", () => {
    it("should update workspace root", () => {
      const newRoot = "/new/workspace/root";
      manager.setWorkspaceRoot(newRoot);
      expect(manager.getWorkspaceRoot()).toBe(newRoot);
    });
  });

  describe("event emission", () => {
    it("should emit event with correct result data", async () => {
      const result = createTestAnalysisResult({
        id: "unique-event-test",
        ocrText: "Event test OCR",
      });

      let capturedEvent: AnalysisCompletedEventData | undefined;
      const disposable = manager.onAnalysisCompleted((data) => {
        capturedEvent = data;
      });

      await manager.processResult(result);

      expect(capturedEvent).toBeDefined();
      expect(capturedEvent!.result.id).toBe("unique-event-test");
      expect(capturedEvent!.result.ocrText).toBe("Event test OCR");

      disposable.dispose();
    });

    it("should support multiple event listeners", async () => {
      const result = createTestAnalysisResult();
      const events: AnalysisCompletedEventData[] = [];

      const disposable1 = manager.onAnalysisCompleted((data) => {
        events.push(data);
      });
      const disposable2 = manager.onAnalysisCompleted((data) => {
        events.push(data);
      });

      await manager.processResult(result);

      expect(events).toHaveLength(2);

      disposable1.dispose();
      disposable2.dispose();
    });

    it("should emit event for each processed result", async () => {
      const events: AnalysisCompletedEventData[] = [];
      const disposable = manager.onAnalysisCompleted((data) => {
        events.push(data);
      });

      await manager.processResult(createTestAnalysisResult({ id: "1" }));
      await manager.processResult(createTestAnalysisResult({ id: "2" }));
      await manager.processResult(createTestAnalysisResult({ id: "3" }));

      expect(events).toHaveLength(3);

      disposable.dispose();
    });
  });

  describe("dispose", () => {
    it("should dispose event emitter", () => {
      const localManager = new ResultsManager(tempDir);
      
      // Subscribe to event
      let eventFired = false;
      localManager.onAnalysisCompleted(() => {
        eventFired = true;
      });

      // Dispose manager
      localManager.dispose();

      // Event should not fire after dispose (no error thrown)
      // The EventEmitter is disposed, so this is a no-op
    });
  });
});

// ============================================================================
// Integration with PersistenceService Tests
// ============================================================================

describe("ResultsManager with PersistenceService", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "results-integration-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("should use provided persistence service", async () => {
    const persistenceService = new PersistenceService();
    const writeResultSpy = vi.spyOn(persistenceService, "writeResult");

    const manager = new ResultsManager(tempDir, persistenceService);
    const result = createTestAnalysisResult();

    await manager.processResult(result);

    expect(writeResultSpy).toHaveBeenCalledTimes(1);
    expect(writeResultSpy).toHaveBeenCalledWith(tempDir, expect.objectContaining({
      imagePath: result.imagePath,
    }));

    manager.dispose();
  });

  it("should work with encrypted persistence", async () => {
    const encryptedService = new PersistenceService({
      encryptionEnabled: true,
      encryptionKey: "test-key",
    });

    const manager = new ResultsManager(tempDir, encryptedService);
    const result = createTestAnalysisResult();

    await manager.processResult(result);

    const history = await manager.getHistory(tempDir);
    expect(history).toHaveLength(1);
    expect(history[0].fullResult).toEqual(result);

    manager.dispose();
  });
});
