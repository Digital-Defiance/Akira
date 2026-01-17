/**
 * Property-Based Tests for Annotation Renderer
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the AnnotationRenderer component.
 * 
 * Requirements: REQ-2.1, REQ-2.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { AnnotationRenderer } from "./annotation-renderer";
import {
  AnalysisResult,
  AnnotationVisibility,
  DetectionLabel,
  BoundingBox,
  InferenceMode,
} from "./types";

// Mock VS Code
vi.mock("vscode", () => ({
  window: {
    activeTextEditor: undefined,
    createTextEditorDecorationType: vi.fn(() => ({
      key: "mock-decoration-type",
      dispose: vi.fn(),
    })),
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  Range: class {
    constructor(
      public startLine: number,
      public startCharacter: number,
      public endLine: number,
      public endCharacter: number
    ) {}
  },
}));

import { vi } from "vitest";

// ============================================================================
// Generators for Property-Based Testing
// ============================================================================

/**
 * Generator for bounding box coordinates
 */
const boundingBoxArb: fc.Arbitrary<BoundingBox> = fc.record({
  x: fc.integer({ min: 0, max: 10000 }),
  y: fc.integer({ min: 0, max: 10000 }),
  width: fc.integer({ min: 1, max: 5000 }),
  height: fc.integer({ min: 1, max: 5000 }),
});

/**
 * Generator for detection labels
 */
const detectionLabelArb: fc.Arbitrary<DetectionLabel> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
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
  imagePath: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date().map((d) => d.toISOString()),
  modelId: fc.string({ minLength: 1, maxLength: 50 }),
  inferenceMode: inferenceModeArb,
  duration: fc.integer({ min: 0, max: 60000 }),
  labels: fc.array(detectionLabelArb, { minLength: 0, maxLength: 20 }),
  ocrText: fc.option(fc.string({ minLength: 0, maxLength: 1000 }), { nil: undefined }),
});

/**
 * Generator for visibility settings
 */
const visibilityArb: fc.Arbitrary<AnnotationVisibility> = fc.record({
  labels: fc.boolean(),
  ocrText: fc.boolean(),
  boundingBoxes: fc.boolean(),
});

describe("AnnotationRenderer Property Tests", () => {
  let renderer: AnnotationRenderer;

  beforeEach(() => {
    renderer = new AnnotationRenderer();
  });

  describe("Feature: multimodal-input, Property 5: Annotation Content Completeness", () => {
    /**
     * **Validates: Requirements REQ-2.1**
     * 
     * For any analysis result with detection labels, the rendered annotation SHALL include 
     * the label text, confidence percentage, and bounding box coordinates for each detection.
     */
    it("should include label text in formatted annotation for all labels", () => {
      fc.assert(
        fc.property(detectionLabelArb, (label) => {
          const formatted = renderer.formatLabelAnnotation(label);
          
          // Property: formatted annotation must contain the label text
          expect(formatted).toContain(label.label);
        }),
        { numRuns: 100 }
      );
    });

    it("should include confidence percentage in formatted annotation for all labels", () => {
      fc.assert(
        fc.property(detectionLabelArb, (label) => {
          const formatted = renderer.formatLabelAnnotation(label);
          const expectedPercent = Math.round(label.confidence * 100);
          
          // Property: formatted annotation must contain confidence as percentage
          expect(formatted).toContain(`${expectedPercent}%`);
        }),
        { numRuns: 100 }
      );
    });

    it("should include bounding box coordinates when present", () => {
      fc.assert(
        fc.property(
          fc.record({
            label: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            boundingBox: boundingBoxArb, // Always present
          }),
          (label) => {
            const formatted = renderer.formatLabelAnnotation(label);
            const { x, y, width, height } = label.boundingBox;
            
            // Property: formatted annotation must contain all bounding box coordinates
            expect(formatted).toContain(`${x}`);
            expect(formatted).toContain(`${y}`);
            expect(formatted).toContain(`${width}`);
            expect(formatted).toContain(`${height}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return annotation contents for all labels in result", () => {
      fc.assert(
        fc.property(analysisResultArb, (result) => {
          renderer.render(result, {
            labels: true,
            ocrText: true,
            boundingBoxes: true,
          });

          const contents = renderer.getAnnotationContents();

          // Property: number of annotation contents must equal number of labels
          expect(contents.length).toBe(result.labels.length);

          // Property: each annotation content must match corresponding label
          for (let i = 0; i < result.labels.length; i++) {
            expect(contents[i].label).toBe(result.labels[i].label);
            expect(contents[i].confidence).toBe(result.labels[i].confidence);
            
            if (result.labels[i].boundingBox) {
              expect(contents[i].boundingBox).toEqual(result.labels[i].boundingBox);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should format bounding box with all coordinate values", () => {
      fc.assert(
        fc.property(boundingBoxArb, (box) => {
          const formatted = renderer.formatBoundingBox(box);
          
          // Property: formatted bounding box must contain all coordinates
          expect(formatted).toContain(`x=${box.x}`);
          expect(formatted).toContain(`y=${box.y}`);
          expect(formatted).toContain(`w=${box.width}`);
          expect(formatted).toContain(`h=${box.height}`);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Feature: multimodal-input, Property 7: Annotation Visibility Independence", () => {
    /**
     * **Validates: Requirements REQ-2.3**
     * 
     * For any combination of visibility settings (labels, OCR text, bounding boxes), 
     * toggling one visibility setting SHALL not affect the visibility state of the other annotation types.
     */
    it("should preserve other visibility settings when updating one", () => {
      fc.assert(
        fc.property(
          visibilityArb,
          visibilityArb,
          (initialVisibility, newVisibility) => {
            // Set initial visibility
            renderer.updateVisibility(initialVisibility);
            
            // Update to new visibility
            renderer.updateVisibility(newVisibility);
            
            const currentVisibility = renderer.getVisibility();
            
            // Property: visibility should match the new settings exactly
            expect(currentVisibility.labels).toBe(newVisibility.labels);
            expect(currentVisibility.ocrText).toBe(newVisibility.ocrText);
            expect(currentVisibility.boundingBoxes).toBe(newVisibility.boundingBoxes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should allow independent toggling of each visibility setting", () => {
      fc.assert(
        fc.property(
          fc.array(visibilityArb, { minLength: 1, maxLength: 10 }),
          (visibilitySequence) => {
            // Apply each visibility setting in sequence
            for (const visibility of visibilitySequence) {
              renderer.updateVisibility(visibility);
              
              const current = renderer.getVisibility();
              
              // Property: each setting should be independently controllable
              expect(current.labels).toBe(visibility.labels);
              expect(current.ocrText).toBe(visibility.ocrText);
              expect(current.boundingBoxes).toBe(visibility.boundingBoxes);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain visibility independence when rendering with different settings", () => {
      fc.assert(
        fc.property(
          analysisResultArb,
          visibilityArb,
          visibilityArb,
          (result, visibility1, visibility2) => {
            // Render with first visibility
            renderer.render(result, visibility1);
            let current = renderer.getVisibility();
            
            expect(current.labels).toBe(visibility1.labels);
            expect(current.ocrText).toBe(visibility1.ocrText);
            expect(current.boundingBoxes).toBe(visibility1.boundingBoxes);
            
            // Render with second visibility
            renderer.render(result, visibility2);
            current = renderer.getVisibility();
            
            // Property: visibility should update independently
            expect(current.labels).toBe(visibility2.labels);
            expect(current.ocrText).toBe(visibility2.ocrText);
            expect(current.boundingBoxes).toBe(visibility2.boundingBoxes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not affect visibility when clearing annotations", () => {
      fc.assert(
        fc.property(
          analysisResultArb,
          visibilityArb,
          (result, visibility) => {
            // Render with visibility
            renderer.render(result, visibility);
            
            // Clear annotations
            renderer.clear();
            
            // Property: visibility settings should be preserved after clear
            const current = renderer.getVisibility();
            expect(current.labels).toBe(visibility.labels);
            expect(current.ocrText).toBe(visibility.ocrText);
            expect(current.boundingBoxes).toBe(visibility.boundingBoxes);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
