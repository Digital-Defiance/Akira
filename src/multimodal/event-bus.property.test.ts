/**
 * Property-Based Tests for Event Bus
 * Feature: multimodal-input
 *
 * These tests validate the correctness properties defined in the design document
 * for the MultimodalEventBus component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  MultimodalEventBus,
  AnalysisCompletedEvent,
  AnyMultimodalEvent,
  resetMultimodalEventBus,
} from "./event-bus";
import { ResultsManager } from "./results-manager";
import { AnalysisResult, InferenceMode } from "./types";

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

// ============================================================================
// Test Setup
// ============================================================================

describe("Event Bus Property Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "event-bus-pbt-"));
    resetMultimodalEventBus();
  });

  afterEach(async () => {
    resetMultimodalEventBus();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // Property 21: Workspace Event Emission
  // ==========================================================================

  describe("Feature: multimodal-input, Property 21: Workspace Event Emission", () => {
    /**
     * **Validates: Requirements REQ-8.2**
     *
     * For any completed analysis, the system SHALL emit a VS Code workspace event
     * containing the complete results object.
     */
    it("should emit workspace event containing complete results object for any analysis", async () => {
      await fc.assert(
        fc.asyncProperty(analysisResultArb, async (result) => {
          const eventBus = new MultimodalEventBus();
          const emittedEvents: AnalysisCompletedEvent[] = [];

          // Subscribe to analysis completed events
          const disposable = eventBus.onAnalysisCompleted((event) => {
            emittedEvents.push(event);
          });

          try {
            // Emit analysis completed event
            await eventBus.emitAnalysisCompleted(result, tempDir);

            // Property: exactly one event should be emitted
            expect(emittedEvents).toHaveLength(1);

            const emittedEvent = emittedEvents[0];

            // Property: event type must be "analysis.completed"
            expect(emittedEvent.type).toBe("analysis.completed");

            // Property: event must contain the complete results object
            expect(emittedEvent.data.result).toBeDefined();

            // Property: result id must be preserved
            expect(emittedEvent.data.result.id).toBe(result.id);

            // Property: result imagePath must be preserved
            expect(emittedEvent.data.result.imagePath).toBe(result.imagePath);

            // Property: result timestamp must be preserved
            expect(emittedEvent.data.result.timestamp).toBe(result.timestamp);

            // Property: result modelId must be preserved
            expect(emittedEvent.data.result.modelId).toBe(result.modelId);

            // Property: result inferenceMode must be preserved
            expect(emittedEvent.data.result.inferenceMode).toBe(result.inferenceMode);

            // Property: result duration must be preserved
            expect(emittedEvent.data.result.duration).toBe(result.duration);

            // Property: result labels must be preserved
            expect(emittedEvent.data.result.labels).toHaveLength(result.labels.length);
            for (let i = 0; i < result.labels.length; i++) {
              expect(emittedEvent.data.result.labels[i].label).toBe(result.labels[i].label);
              expect(emittedEvent.data.result.labels[i].confidence).toBe(result.labels[i].confidence);
              if (result.labels[i].boundingBox) {
                expect(emittedEvent.data.result.labels[i].boundingBox).toEqual(
                  result.labels[i].boundingBox
                );
              }
            }

            // Property: result ocrText must be preserved
            expect(emittedEvent.data.result.ocrText).toBe(result.ocrText);

            // Property: workspaceRoot must be included
            expect(emittedEvent.workspaceRoot).toBe(tempDir);

            // Property: timestamp must be a valid ISO string
            expect(() => new Date(emittedEvent.timestamp)).not.toThrow();
          } finally {
            disposable.dispose();
            eventBus.dispose();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should emit event via ResultsManager when processing results", async () => {
      await fc.assert(
        fc.asyncProperty(analysisResultArb, async (result) => {
          const eventBus = new MultimodalEventBus();
          const manager = new ResultsManager(tempDir, undefined, eventBus);
          const emittedEvents: AnalysisCompletedEvent[] = [];

          // Subscribe to analysis completed events via event bus
          const disposable = eventBus.onAnalysisCompleted((event) => {
            emittedEvents.push(event);
          });

          try {
            // Process result through ResultsManager
            await manager.processResult(result);

            // Property: exactly one event should be emitted
            expect(emittedEvents).toHaveLength(1);

            const emittedEvent = emittedEvents[0];

            // Property: event must contain the complete results object
            expect(emittedEvent.data.result.id).toBe(result.id);
            expect(emittedEvent.data.result.imagePath).toBe(result.imagePath);
            expect(emittedEvent.data.result.modelId).toBe(result.modelId);
            expect(emittedEvent.data.result.labels).toHaveLength(result.labels.length);

            // Clean up for next iteration
            await manager.clearHistory(tempDir);
          } finally {
            disposable.dispose();
            manager.dispose();
            eventBus.dispose();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should emit events to all subscribers for any analysis", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          fc.integer({ min: 1, max: 10 }),
          async (result, subscriberCount) => {
            const eventBus = new MultimodalEventBus();
            const receivedCounts: number[] = Array(subscriberCount).fill(0);
            const disposables: { dispose: () => void }[] = [];

            try {
              // Create multiple subscribers
              for (let i = 0; i < subscriberCount; i++) {
                const index = i;
                const disposable = eventBus.onAnalysisCompleted(() => {
                  receivedCounts[index]++;
                });
                disposables.push(disposable);
              }

              // Emit analysis completed event
              await eventBus.emitAnalysisCompleted(result, tempDir);

              // Property: all subscribers should receive exactly one event
              for (let i = 0; i < subscriberCount; i++) {
                expect(receivedCounts[i]).toBe(1);
              }
            } finally {
              disposables.forEach((d) => d.dispose());
              eventBus.dispose();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should store events in history for any sequence of analyses", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(analysisResultArb, { minLength: 1, maxLength: 10 }),
          async (results) => {
            const eventBus = new MultimodalEventBus();

            try {
              // Emit all results
              for (const result of results) {
                await eventBus.emitAnalysisCompleted(result, tempDir);
              }

              // Property: history should contain all emitted events
              const history = eventBus.getHistory("analysis.completed");
              expect(history).toHaveLength(results.length);

              // Property: events should be in order
              for (let i = 0; i < results.length; i++) {
                const event = history[i] as AnalysisCompletedEvent;
                expect(event.data.result.id).toBe(results[i].id);
              }
            } finally {
              eventBus.dispose();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should emit events via wildcard subscription for any analysis", async () => {
      await fc.assert(
        fc.asyncProperty(analysisResultArb, async (result) => {
          const eventBus = new MultimodalEventBus();
          const wildcardEvents: AnyMultimodalEvent[] = [];

          // Subscribe to all events via wildcard
          const disposable = eventBus.subscribe("*", (event) => {
            wildcardEvents.push(event);
          });

          try {
            // Emit analysis completed event
            await eventBus.emitAnalysisCompleted(result, tempDir);

            // Property: wildcard subscriber should receive the event
            expect(wildcardEvents).toHaveLength(1);
            expect(wildcardEvents[0].type).toBe("analysis.completed");
            expect((wildcardEvents[0] as AnalysisCompletedEvent).data.result.id).toBe(result.id);
          } finally {
            disposable.dispose();
            eventBus.dispose();
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
