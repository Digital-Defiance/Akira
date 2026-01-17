/**
 * Property-Based Tests for Results Manager
 * Feature: multimodal-input
 *
 * These tests validate the correctness properties defined in the design document
 * for the ResultsManager component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ResultsManager } from "./results-manager";
import {
  AnalysisResult,
  InferenceMode,
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
 * Generates valid AnalysisResult objects with all required fields
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

// ============================================================================
// Test Setup
// ============================================================================

describe("ResultsManager Property Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "results-manager-pbt-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Property 6: Results JSON Serialization Round-Trip
  // ==========================================================================

  describe("Feature: multimodal-input, Property 6: Results JSON Serialization Round-Trip", () => {
    /**
     * **Validates: Requirements REQ-2.2**
     *
     * For any valid AnalysisResult object, serializing to JSON and deserializing
     * back SHALL produce an equivalent object containing labels, confidences,
     * OCR text, and timestamps.
     */
    it("should round-trip AnalysisResult through JSON serialization without data loss", async () => {
      await fc.assert(
        fc.asyncProperty(analysisResultArb, async (originalResult) => {
          const manager = new ResultsManager(tempDir);

          try {
            // Process the result (which persists it as JSON)
            await manager.processResult(originalResult);

            // Retrieve the result from storage (which deserializes from JSON)
            const history = await manager.getHistory(tempDir);
            expect(history.length).toBeGreaterThan(0);

            const retrievedResult = history[history.length - 1];

            // Property: id must be preserved
            expect(retrievedResult.fullResult.id).toBe(originalResult.id);

            // Property: imagePath must be preserved
            expect(retrievedResult.fullResult.imagePath).toBe(originalResult.imagePath);

            // Property: timestamp must be preserved
            expect(retrievedResult.fullResult.timestamp).toBe(originalResult.timestamp);
            expect(retrievedResult.timestamp).toBe(originalResult.timestamp);

            // Property: modelId must be preserved
            expect(retrievedResult.fullResult.modelId).toBe(originalResult.modelId);
            expect(retrievedResult.modelId).toBe(originalResult.modelId);

            // Property: inferenceMode must be preserved
            expect(retrievedResult.fullResult.inferenceMode).toBe(originalResult.inferenceMode);

            // Property: duration must be preserved
            expect(retrievedResult.fullResult.duration).toBe(originalResult.duration);

            // Property: labels must be preserved with confidences
            expect(retrievedResult.fullResult.labels).toHaveLength(originalResult.labels.length);
            for (let i = 0; i < originalResult.labels.length; i++) {
              const originalLabel = originalResult.labels[i];
              const retrievedLabel = retrievedResult.fullResult.labels[i];

              expect(retrievedLabel.label).toBe(originalLabel.label);
              expect(retrievedLabel.confidence).toBe(originalLabel.confidence);

              // Property: bounding boxes must be preserved if present
              if (originalLabel.boundingBox) {
                expect(retrievedLabel.boundingBox).toBeDefined();
                expect(retrievedLabel.boundingBox!.x).toBe(originalLabel.boundingBox.x);
                expect(retrievedLabel.boundingBox!.y).toBe(originalLabel.boundingBox.y);
                expect(retrievedLabel.boundingBox!.width).toBe(originalLabel.boundingBox.width);
                expect(retrievedLabel.boundingBox!.height).toBe(originalLabel.boundingBox.height);
              } else {
                expect(retrievedLabel.boundingBox).toBeUndefined();
              }
            }

            // Property: OCR text must be preserved
            expect(retrievedResult.fullResult.ocrText).toBe(originalResult.ocrText);

            // Property: resultsSummary must accurately reflect the result
            expect(retrievedResult.resultsSummary.labelCount).toBe(originalResult.labels.length);
            expect(retrievedResult.resultsSummary.hasOcrText).toBe(
              !!originalResult.ocrText && originalResult.ocrText.length > 0
            );

            // Clean up for next iteration
            await manager.clearHistory(tempDir);
          } finally {
            manager.dispose();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve special characters in OCR text through serialization", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.uuid(),
            imagePath: fc.constant("/test/image.png"),
            timestamp: fc.constant("2025-01-16T10:00:00.000Z"),
            modelId: fc.constant("test-model"),
            inferenceMode: fc.constant("local" as InferenceMode),
            duration: fc.constant(1000),
            labels: fc.constant([]),
            // Generate strings with special characters
            ocrText: fc.option(
              fc.stringOf(
                fc.oneof(
                  fc.char(),
                  fc.constant("äöü"),
                  fc.constant("ñ"),
                  fc.constant("中文"),
                  fc.constant("日本語"),
                  fc.constant("🎉"),
                  fc.constant("\n\t"),
                  fc.constant("\"'\\")
                )
              ),
              { nil: undefined }
            ),
            rawResponse: fc.constant(undefined),
          }),
          async (result) => {
            const manager = new ResultsManager(tempDir);

            try {
              await manager.processResult(result);
              const history = await manager.getHistory(tempDir);

              // Property: special characters in OCR text must be preserved
              expect(history[0].fullResult.ocrText).toBe(result.ocrText);

              await manager.clearHistory(tempDir);
            } finally {
              manager.dispose();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve label strings with special characters through serialization", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.uuid(),
            imagePath: fc.constant("/test/image.png"),
            timestamp: fc.constant("2025-01-16T10:00:00.000Z"),
            modelId: fc.constant("test-model"),
            inferenceMode: fc.constant("local" as InferenceMode),
            duration: fc.constant(1000),
            labels: fc.array(
              fc.record({
                label: fc.stringOf(
                  fc.oneof(
                    fc.char(),
                    fc.constant("äöü"),
                    fc.constant("ñ"),
                    fc.constant("中文"),
                    fc.constant("🎉")
                  ),
                  { minLength: 1, maxLength: 50 }
                ),
                confidence: fc.float({ min: 0, max: 1, noNaN: true }),
                boundingBox: fc.constant(undefined),
              }),
              { minLength: 1, maxLength: 5 }
            ),
            ocrText: fc.constant(undefined),
            rawResponse: fc.constant(undefined),
          }),
          async (result) => {
            const manager = new ResultsManager(tempDir);

            try {
              await manager.processResult(result);
              const history = await manager.getHistory(tempDir);

              // Property: label strings with special characters must be preserved
              for (let i = 0; i < result.labels.length; i++) {
                expect(history[0].fullResult.labels[i].label).toBe(result.labels[i].label);
              }

              await manager.clearHistory(tempDir);
            } finally {
              manager.dispose();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should produce valid JSON that can be parsed independently", async () => {
      await fc.assert(
        fc.asyncProperty(analysisResultArb, async (result) => {
          const manager = new ResultsManager(tempDir);
          const persistenceService = manager.getPersistenceService();

          try {
            await manager.processResult(result);

            // Read the raw file content
            const filePath = persistenceService.getResultsFilePath(tempDir);
            const fileContent = await fs.promises.readFile(filePath, "utf8");

            // Property: file content must be valid JSON
            let parsed: unknown;
            expect(() => {
              parsed = JSON.parse(fileContent);
            }).not.toThrow();

            // Property: parsed JSON must have expected structure
            expect(parsed).toHaveProperty("version");
            expect(parsed).toHaveProperty("results");
            expect(Array.isArray((parsed as { results: unknown[] }).results)).toBe(true);

            await manager.clearHistory(tempDir);
          } finally {
            manager.dispose();
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
