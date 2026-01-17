/**
 * Property-Based Tests for Persistence Service
 * Feature: multimodal-input
 *
 * These tests validate the correctness properties defined in the design document
 * for the PersistenceService component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  PersistenceService,
  createPersistedResult,
  RESULTS_FILENAME,
} from "./persistence-service";
import {
  AnalysisResult,
  PersistedResult,
  InferenceMode,
  RESULTS_FILE_VERSION,
} from "./types";

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for bounding box
 */
const boundingBoxArb = fc.record({
  x: fc.integer({ min: 0, max: 10000 }),
  y: fc.integer({ min: 0, max: 10000 }),
  width: fc.integer({ min: 1, max: 10000 }),
  height: fc.integer({ min: 1, max: 10000 }),
});

/**
 * Generator for detection labels
 */
const detectionLabelArb = fc.record({
  label: fc.string({ minLength: 1, maxLength: 100 }),
  confidence: fc.float({ min: 0, max: 1, noNaN: true }),
  boundingBox: fc.option(boundingBoxArb, { nil: undefined }),
});

/**
 * Generator for inference mode
 */
const inferenceModeArb: fc.Arbitrary<InferenceMode> = fc.constantFrom("local", "cloud");

/**
 * Generator for analysis results
 */
const analysisResultArb: fc.Arbitrary<AnalysisResult> = fc.record({
  id: fc.uuid(),
  imagePath: fc.string({ minLength: 1, maxLength: 500 }),
  timestamp: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }).map((d) =>
    d.toISOString()
  ),
  modelId: fc.string({ minLength: 1, maxLength: 100 }),
  inferenceMode: inferenceModeArb,
  duration: fc.integer({ min: 0, max: 60000 }),
  labels: fc.array(detectionLabelArb, { minLength: 0, maxLength: 20 }),
  ocrText: fc.option(fc.string({ maxLength: 5000 }), { nil: undefined }),
  rawResponse: fc.constant(undefined),
});

/**
 * Generator for persisted results
 */
const persistedResultArb: fc.Arbitrary<PersistedResult> = analysisResultArb.map((result) =>
  createPersistedResult(result)
);

// ============================================================================
// Test Setup
// ============================================================================

describe("PersistenceService Property Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "persistence-pbt-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Property 13: Persistence Format Completeness
  // ==========================================================================

  describe("Feature: multimodal-input, Property 13: Persistence Format Completeness", () => {
    /**
     * **Validates: Requirements REQ-5.1**
     *
     * For any persisted result in results.json, the entry SHALL contain
     * imagePath, timestamp, resultsSummary, and modelId fields.
     */
    it("should persist results with all required fields (imagePath, timestamp, resultsSummary, modelId)", async () => {
      await fc.assert(
        fc.asyncProperty(persistedResultArb, async (result) => {
          const service = new PersistenceService();
          await service.writeResult(tempDir, result);

          const resultsFile = await service.readResults(tempDir);
          expect(resultsFile.results.length).toBeGreaterThan(0);

          const persisted = resultsFile.results[resultsFile.results.length - 1];

          // Property: imagePath must be present
          expect(persisted).toHaveProperty("imagePath");
          expect(typeof persisted.imagePath).toBe("string");

          // Property: timestamp must be present
          expect(persisted).toHaveProperty("timestamp");
          expect(typeof persisted.timestamp).toBe("string");

          // Property: resultsSummary must be present with required fields
          expect(persisted).toHaveProperty("resultsSummary");
          expect(persisted.resultsSummary).toHaveProperty("labelCount");
          expect(persisted.resultsSummary).toHaveProperty("topLabels");
          expect(persisted.resultsSummary).toHaveProperty("hasOcrText");
          expect(typeof persisted.resultsSummary.labelCount).toBe("number");
          expect(Array.isArray(persisted.resultsSummary.topLabels)).toBe(true);
          expect(typeof persisted.resultsSummary.hasOcrText).toBe("boolean");

          // Property: modelId must be present
          expect(persisted).toHaveProperty("modelId");
          expect(typeof persisted.modelId).toBe("string");

          // Clean up for next iteration
          await service.clearResults(tempDir);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 14: Single Results File Per Workspace
  // ==========================================================================

  describe("Feature: multimodal-input, Property 14: Single Results File Per Workspace", () => {
    /**
     * **Validates: Requirements REQ-5.2**
     *
     * For any sequence of analysis results written to a workspace, all results
     * SHALL be appended to a single results.json file (until rotation threshold).
     */
    it("should append all results to a single results.json file", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(persistedResultArb, { minLength: 2, maxLength: 10 }),
          async (results) => {
            const service = new PersistenceService();

            // Write all results sequentially
            for (const result of results) {
              await service.writeResult(tempDir, result);
            }

            // Property: only one results.json file should exist
            const dir = service.getResultsDirectory(tempDir);
            const files = await fs.promises.readdir(dir);
            const resultsFiles = files.filter((f) => f === RESULTS_FILENAME);
            expect(resultsFiles).toHaveLength(1);

            // Property: all results should be in the single file
            const resultsFile = await service.readResults(tempDir);
            expect(resultsFile.results).toHaveLength(results.length);

            // Property: results should be in order
            for (let i = 0; i < results.length; i++) {
              expect(resultsFile.results[i].imagePath).toBe(results[i].imagePath);
              expect(resultsFile.results[i].timestamp).toBe(results[i].timestamp);
            }

            // Clean up for next iteration
            await service.clearResults(tempDir);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 15: Results File Rotation
  // ==========================================================================

  describe("Feature: multimodal-input, Property 15: Results File Rotation", () => {
    /**
     * **Validates: Requirements REQ-5.3**
     *
     * For any results.json file that exceeds 50 megabytes, the system SHALL
     * rename it with a timestamp suffix and create a new results.json file
     * before writing the next result.
     */
    it("should rotate file when size exceeds limit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(persistedResultArb, { minLength: 3, maxLength: 5 }),
          async (results) => {
            // Use very small limit to trigger rotation
            const service = new PersistenceService({ maxFileSizeMB: 0.0001 }); // ~100 bytes

            // Write results until rotation occurs
            for (const result of results) {
              await service.writeResult(tempDir, result);
            }

            const dir = service.getResultsDirectory(tempDir);
            const files = await fs.promises.readdir(dir);

            // Property: rotated files should have timestamp suffix
            const rotatedFiles = files.filter(
              (f) => f.startsWith("results-") && f.endsWith(".json")
            );

            // Property: at least one rotation should have occurred with multiple writes
            // (given the very small size limit)
            if (results.length >= 2) {
              expect(rotatedFiles.length).toBeGreaterThanOrEqual(1);
            }

            // Property: current results.json should exist
            const currentFile = files.find((f) => f === RESULTS_FILENAME);
            expect(currentFile).toBeDefined();

            // Property: rotated file names should contain valid timestamp format
            for (const rotatedFile of rotatedFiles) {
              // Format: results-YYYY-MM-DDTHH-MM-SS-sssZ.json
              const timestampMatch = rotatedFile.match(
                /^results-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/
              );
              expect(timestampMatch).not.toBeNull();
            }

            // Clean up for next iteration
            await fs.promises.rm(dir, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 24: Storage Encryption Round-Trip
  // ==========================================================================

  describe("Feature: multimodal-input, Property 24: Storage Encryption Round-Trip", () => {
    /**
     * **Validates: Requirements REQ-9.3**
     *
     * For any AnalysisResult when encryption is enabled, encrypting then
     * decrypting the persisted data SHALL produce the original result,
     * and the encrypted file SHALL not be readable as plain JSON.
     */
    it("should round-trip results through encryption without data loss", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          fc.string({ minLength: 8, maxLength: 64 }), // encryption key
          async (result, encryptionKey) => {
            const service = new PersistenceService({
              encryptionEnabled: true,
              encryptionKey,
            });

            // Write the result
            const persisted = createPersistedResult(result);
            await service.writeResult(tempDir, persisted);

            // Property: encrypted file should not be readable as plain JSON
            const filePath = service.getResultsFilePath(tempDir);
            const fileContent = await fs.promises.readFile(filePath);
            expect(() => JSON.parse(fileContent.toString())).toThrow();

            // Property: decrypted result should match original
            const resultsFile = await service.readResults(tempDir);
            expect(resultsFile.results).toHaveLength(1);

            const decrypted = resultsFile.results[0];

            // Verify all fields match
            expect(decrypted.imagePath).toBe(result.imagePath);
            expect(decrypted.timestamp).toBe(result.timestamp);
            expect(decrypted.modelId).toBe(result.modelId);
            expect(decrypted.fullResult.id).toBe(result.id);
            expect(decrypted.fullResult.inferenceMode).toBe(result.inferenceMode);
            expect(decrypted.fullResult.duration).toBe(result.duration);
            expect(decrypted.fullResult.labels).toEqual(result.labels);
            expect(decrypted.fullResult.ocrText).toBe(result.ocrText);

            // Clean up for next iteration
            await fs.promises.rm(service.getResultsDirectory(tempDir), {
              recursive: true,
              force: true,
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should produce different ciphertext for same plaintext with different keys", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          fc.string({ minLength: 8, maxLength: 64 }),
          fc.string({ minLength: 8, maxLength: 64 }),
          async (result, key1, key2) => {
            // Skip if keys are the same
            if (key1 === key2) return;

            const service1 = new PersistenceService({
              encryptionEnabled: true,
              encryptionKey: key1,
            });
            const service2 = new PersistenceService({
              encryptionEnabled: true,
              encryptionKey: key2,
            });

            const tempDir1 = await fs.promises.mkdtemp(
              path.join(os.tmpdir(), "enc-test-1-")
            );
            const tempDir2 = await fs.promises.mkdtemp(
              path.join(os.tmpdir(), "enc-test-2-")
            );

            try {
              const persisted = createPersistedResult(result);
              await service1.writeResult(tempDir1, persisted);
              await service2.writeResult(tempDir2, persisted);

              const content1 = await fs.promises.readFile(
                service1.getResultsFilePath(tempDir1)
              );
              const content2 = await fs.promises.readFile(
                service2.getResultsFilePath(tempDir2)
              );

              // Property: different keys should produce different ciphertext
              // (Note: even same key produces different ciphertext due to random IV,
              // but different keys definitely should)
              expect(content1.equals(content2)).toBe(false);
            } finally {
              await fs.promises.rm(tempDir1, { recursive: true, force: true });
              await fs.promises.rm(tempDir2, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
