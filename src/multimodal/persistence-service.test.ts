/**
 * Unit tests for PersistenceService
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-9.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  PersistenceService,
  createPersistedResult,
  createResultsSummary,
  RESULTS_DIRECTORY,
  RESULTS_FILENAME,
  ENCRYPTED_RESULTS_FILENAME,
} from "./persistence-service";
import {
  AnalysisResult,
  PersistedResult,
  ResultsFile,
  RESULTS_FILE_VERSION,
} from "./types";

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
// Helper Functions Tests
// ============================================================================

describe("createResultsSummary", () => {
  it("should create summary with correct label count", () => {
    const result = createTestAnalysisResult();
    const summary = createResultsSummary(result);
    expect(summary.labelCount).toBe(2);
  });

  it("should extract top labels sorted by confidence", () => {
    const result = createTestAnalysisResult({
      labels: [
        { label: "low", confidence: 0.3 },
        { label: "high", confidence: 0.9 },
        { label: "medium", confidence: 0.6 },
      ],
    });
    const summary = createResultsSummary(result);
    expect(summary.topLabels).toEqual(["high", "medium", "low"]);
  });

  it("should limit top labels to 5", () => {
    const result = createTestAnalysisResult({
      labels: Array.from({ length: 10 }, (_, i) => ({
        label: `label-${i}`,
        confidence: (10 - i) / 10,
      })),
    });
    const summary = createResultsSummary(result);
    expect(summary.topLabels).toHaveLength(5);
  });

  it("should detect OCR text presence", () => {
    const withOcr = createTestAnalysisResult({ ocrText: "Some text" });
    const withoutOcr = createTestAnalysisResult({ ocrText: undefined });
    const emptyOcr = createTestAnalysisResult({ ocrText: "" });

    expect(createResultsSummary(withOcr).hasOcrText).toBe(true);
    expect(createResultsSummary(withoutOcr).hasOcrText).toBe(false);
    expect(createResultsSummary(emptyOcr).hasOcrText).toBe(false);
  });
});

describe("createPersistedResult", () => {
  it("should create persisted result with all required fields", () => {
    const result = createTestAnalysisResult();
    const persisted = createPersistedResult(result);

    expect(persisted.imagePath).toBe(result.imagePath);
    expect(persisted.timestamp).toBe(result.timestamp);
    expect(persisted.modelId).toBe(result.modelId);
    expect(persisted.fullResult).toEqual(result);
    expect(persisted.resultsSummary).toBeDefined();
  });
});

// ============================================================================
// PersistenceService Tests
// ============================================================================

describe("PersistenceService", () => {
  let tempDir: string;
  let service: PersistenceService;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "persistence-test-"));
    service = new PersistenceService();
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("getResultsDirectory", () => {
    it("should return correct directory path", () => {
      const dir = service.getResultsDirectory(tempDir);
      expect(dir).toBe(path.join(tempDir, RESULTS_DIRECTORY));
    });
  });

  describe("getResultsFilePath", () => {
    it("should return correct file path for unencrypted storage", () => {
      const filePath = service.getResultsFilePath(tempDir);
      expect(filePath).toBe(path.join(tempDir, RESULTS_DIRECTORY, RESULTS_FILENAME));
    });

    it("should return encrypted file path when encryption enabled", () => {
      const encryptedService = new PersistenceService({
        encryptionEnabled: true,
        encryptionKey: "test-key",
      });
      const filePath = encryptedService.getResultsFilePath(tempDir);
      expect(filePath).toBe(path.join(tempDir, RESULTS_DIRECTORY, ENCRYPTED_RESULTS_FILENAME));
    });
  });

  describe("readResults", () => {
    it("should return empty results when file does not exist", async () => {
      const results = await service.readResults(tempDir);
      expect(results.version).toBe(RESULTS_FILE_VERSION);
      expect(results.results).toEqual([]);
    });

    it("should read existing results file", async () => {
      // Create directory and file manually
      const dir = service.getResultsDirectory(tempDir);
      await fs.promises.mkdir(dir, { recursive: true });

      const testResults: ResultsFile = {
        version: RESULTS_FILE_VERSION,
        results: [createPersistedResult(createTestAnalysisResult())],
      };

      await fs.promises.writeFile(
        service.getResultsFilePath(tempDir),
        JSON.stringify(testResults),
        "utf8"
      );

      const results = await service.readResults(tempDir);
      expect(results.results).toHaveLength(1);
      expect(results.results[0].imagePath).toBe("/workspace/images/test.png");
    });
  });

  describe("writeResult", () => {
    it("should create directory and file if not exists", async () => {
      const result = createPersistedResult(createTestAnalysisResult());
      await service.writeResult(tempDir, result);

      const filePath = service.getResultsFilePath(tempDir);
      const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it("should append results to existing file", async () => {
      const result1 = createPersistedResult(createTestAnalysisResult({ id: "id-1" }));
      const result2 = createPersistedResult(createTestAnalysisResult({ id: "id-2" }));

      await service.writeResult(tempDir, result1);
      await service.writeResult(tempDir, result2);

      const results = await service.readResults(tempDir);
      expect(results.results).toHaveLength(2);
    });

    it("should preserve existing results when appending", async () => {
      const result1 = createPersistedResult(
        createTestAnalysisResult({ imagePath: "/path/to/first.png" })
      );
      const result2 = createPersistedResult(
        createTestAnalysisResult({ imagePath: "/path/to/second.png" })
      );

      await service.writeResult(tempDir, result1);
      await service.writeResult(tempDir, result2);

      const results = await service.readResults(tempDir);
      expect(results.results[0].imagePath).toBe("/path/to/first.png");
      expect(results.results[1].imagePath).toBe("/path/to/second.png");
    });
  });

  describe("writeAnalysisResult", () => {
    it("should convert and write analysis result", async () => {
      const analysisResult = createTestAnalysisResult();
      const persisted = await service.writeAnalysisResult(tempDir, analysisResult);

      expect(persisted.imagePath).toBe(analysisResult.imagePath);
      expect(persisted.fullResult).toEqual(analysisResult);

      const results = await service.readResults(tempDir);
      expect(results.results).toHaveLength(1);
    });
  });

  describe("clearResults", () => {
    it("should clear all results", async () => {
      const result = createPersistedResult(createTestAnalysisResult());
      await service.writeResult(tempDir, result);
      await service.writeResult(tempDir, result);

      await service.clearResults(tempDir);

      const results = await service.readResults(tempDir);
      expect(results.results).toHaveLength(0);
    });
  });

  describe("getFileSize", () => {
    it("should return 0 when file does not exist", async () => {
      const size = await service.getFileSize(tempDir);
      expect(size).toBe(0);
    });

    it("should return actual file size", async () => {
      const result = createPersistedResult(createTestAnalysisResult());
      await service.writeResult(tempDir, result);

      const size = await service.getFileSize(tempDir);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe("rotateIfNeeded", () => {
    it("should not rotate when file is under limit", async () => {
      const result = createPersistedResult(createTestAnalysisResult());
      await service.writeResult(tempDir, result);

      const rotated = await service.rotateIfNeeded(tempDir);
      expect(rotated).toBe(false);
    });

    it("should rotate when file exceeds limit", async () => {
      // Create service with very small limit for testing
      const smallLimitService = new PersistenceService({ maxFileSizeMB: 0.0001 });

      const result = createPersistedResult(createTestAnalysisResult());
      await smallLimitService.writeResult(tempDir, result);

      // Write more data to exceed limit
      await smallLimitService.writeResult(tempDir, result);

      const rotated = await smallLimitService.rotateIfNeeded(tempDir);
      expect(rotated).toBe(true);

      // Original file should be renamed
      const dir = smallLimitService.getResultsDirectory(tempDir);
      const files = await fs.promises.readdir(dir);
      const rotatedFiles = files.filter((f) => f.startsWith("results-") && f.endsWith(".json"));
      expect(rotatedFiles.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// Encryption Tests
// ============================================================================

describe("PersistenceService with Encryption", () => {
  let tempDir: string;
  let service: PersistenceService;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "persistence-enc-test-"));
    service = new PersistenceService({
      encryptionEnabled: true,
      encryptionKey: "test-encryption-key-12345",
    });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("should encrypt results file", async () => {
    const result = createPersistedResult(createTestAnalysisResult());
    await service.writeResult(tempDir, result);

    const filePath = service.getResultsFilePath(tempDir);
    const fileContent = await fs.promises.readFile(filePath);

    // Encrypted content should not be valid JSON
    expect(() => JSON.parse(fileContent.toString())).toThrow();
  });

  it("should decrypt and read encrypted results", async () => {
    const result = createPersistedResult(createTestAnalysisResult());
    await service.writeResult(tempDir, result);

    const results = await service.readResults(tempDir);
    expect(results.results).toHaveLength(1);
    expect(results.results[0].imagePath).toBe(result.imagePath);
  });

  it("should round-trip analysis results through encryption", async () => {
    const originalResult = createTestAnalysisResult({
      id: "unique-id",
      ocrText: "Special characters: äöü ñ 中文",
      labels: [
        { label: "test", confidence: 0.99, boundingBox: { x: 1, y: 2, width: 3, height: 4 } },
      ],
    });

    await service.writeAnalysisResult(tempDir, originalResult);
    const results = await service.readResults(tempDir);

    expect(results.results[0].fullResult).toEqual(originalResult);
  });

  it("should fail to decrypt with wrong key", async () => {
    const result = createPersistedResult(createTestAnalysisResult());
    await service.writeResult(tempDir, result);

    // Create new service with different key
    const wrongKeyService = new PersistenceService({
      encryptionEnabled: true,
      encryptionKey: "wrong-key",
    });

    await expect(wrongKeyService.readResults(tempDir)).rejects.toThrow();
  });

  it("should report encryption status correctly", () => {
    expect(service.isEncryptionEnabled()).toBe(true);

    const unencryptedService = new PersistenceService();
    expect(unencryptedService.isEncryptionEnabled()).toBe(false);
  });
});
