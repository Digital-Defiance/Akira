/**
 * Unit tests for AnnotationRenderer
 * 
 * Tests the annotation rendering functionality including label formatting,
 * bounding box display, OCR text rendering, and visibility toggling.
 * 
 * Requirements: REQ-2.1, REQ-2.3
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AnnotationRenderer } from "./annotation-renderer";
import {
  AnalysisResult,
  AnnotationVisibility,
  DetectionLabel,
  BoundingBox,
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

describe("AnnotationRenderer", () => {
  let renderer: AnnotationRenderer;

  const createMockResult = (
    labels: DetectionLabel[] = [],
    ocrText?: string
  ): AnalysisResult => ({
    id: "test-id",
    imagePath: "/path/to/image.png",
    timestamp: new Date().toISOString(),
    modelId: "test-model",
    inferenceMode: "local",
    duration: 1000,
    labels,
    ocrText,
  });

  const createMockLabel = (
    label: string,
    confidence: number,
    boundingBox?: BoundingBox
  ): DetectionLabel => ({
    label,
    confidence,
    boundingBox,
  });

  beforeEach(() => {
    renderer = new AnnotationRenderer();
  });

  describe("formatLabelAnnotation", () => {
    it("should format label with confidence percentage", () => {
      const label = createMockLabel("cat", 0.95);
      const formatted = renderer.formatLabelAnnotation(label);
      expect(formatted).toBe("cat (95%)");
    });

    it("should round confidence to nearest integer", () => {
      const label = createMockLabel("dog", 0.876);
      const formatted = renderer.formatLabelAnnotation(label);
      expect(formatted).toBe("dog (88%)");
    });

    it("should include bounding box coordinates when present", () => {
      const label = createMockLabel("person", 0.9, {
        x: 10,
        y: 20,
        width: 100,
        height: 200,
      });
      const formatted = renderer.formatLabelAnnotation(label);
      expect(formatted).toBe("person (90%) [10, 20, 100×200]");
    });

    it("should handle zero confidence", () => {
      const label = createMockLabel("unknown", 0);
      const formatted = renderer.formatLabelAnnotation(label);
      expect(formatted).toBe("unknown (0%)");
    });

    it("should handle 100% confidence", () => {
      const label = createMockLabel("certain", 1.0);
      const formatted = renderer.formatLabelAnnotation(label);
      expect(formatted).toBe("certain (100%)");
    });
  });

  describe("formatBoundingBox", () => {
    it("should format bounding box with all coordinates", () => {
      const box: BoundingBox = { x: 10, y: 20, width: 100, height: 200 };
      const formatted = renderer.formatBoundingBox(box);
      expect(formatted).toBe("Box: [x=10, y=20, w=100, h=200]");
    });

    it("should handle zero coordinates", () => {
      const box: BoundingBox = { x: 0, y: 0, width: 50, height: 50 };
      const formatted = renderer.formatBoundingBox(box);
      expect(formatted).toBe("Box: [x=0, y=0, w=50, h=50]");
    });
  });

  describe("visibility management", () => {
    it("should initialize with all visibility enabled", () => {
      const visibility = renderer.getVisibility();
      expect(visibility.labels).toBe(true);
      expect(visibility.ocrText).toBe(true);
      expect(visibility.boundingBoxes).toBe(true);
    });

    it("should update visibility settings independently", () => {
      renderer.updateVisibility({
        labels: false,
        ocrText: true,
        boundingBoxes: true,
      });

      const visibility = renderer.getVisibility();
      expect(visibility.labels).toBe(false);
      expect(visibility.ocrText).toBe(true);
      expect(visibility.boundingBoxes).toBe(true);
    });

    it("should preserve other visibility settings when updating one", () => {
      // First update
      renderer.updateVisibility({
        labels: true,
        ocrText: false,
        boundingBoxes: true,
      });

      // Second update - only change boundingBoxes
      renderer.updateVisibility({
        labels: true,
        ocrText: false,
        boundingBoxes: false,
      });

      const visibility = renderer.getVisibility();
      expect(visibility.labels).toBe(true);
      expect(visibility.ocrText).toBe(false);
      expect(visibility.boundingBoxes).toBe(false);
    });
  });

  describe("render", () => {
    it("should store the current result", () => {
      const result = createMockResult([createMockLabel("test", 0.5)]);
      const visibility: AnnotationVisibility = {
        labels: true,
        ocrText: true,
        boundingBoxes: true,
      };

      renderer.render(result, visibility);

      expect(renderer.getCurrentResult()).toEqual(result);
    });

    it("should update visibility when rendering", () => {
      const result = createMockResult([createMockLabel("test", 0.5)]);
      const visibility: AnnotationVisibility = {
        labels: false,
        ocrText: true,
        boundingBoxes: false,
      };

      renderer.render(result, visibility);

      expect(renderer.getVisibility()).toEqual(visibility);
    });
  });

  describe("clear", () => {
    it("should clear the current result", () => {
      const result = createMockResult([createMockLabel("test", 0.5)]);
      renderer.render(result, {
        labels: true,
        ocrText: true,
        boundingBoxes: true,
      });

      renderer.clear();

      expect(renderer.getCurrentResult()).toBeUndefined();
    });
  });

  describe("getAnnotationContents", () => {
    it("should return empty array when no result", () => {
      const contents = renderer.getAnnotationContents();
      expect(contents).toEqual([]);
    });

    it("should return annotation contents for all labels", () => {
      const labels = [
        createMockLabel("cat", 0.9, { x: 10, y: 20, width: 100, height: 100 }),
        createMockLabel("dog", 0.8),
      ];
      const result = createMockResult(labels, "Hello World");

      renderer.render(result, {
        labels: true,
        ocrText: true,
        boundingBoxes: true,
      });

      const contents = renderer.getAnnotationContents();

      expect(contents).toHaveLength(2);
      expect(contents[0].label).toBe("cat");
      expect(contents[0].confidence).toBe(0.9);
      expect(contents[0].boundingBox).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
      expect(contents[1].label).toBe("dog");
      expect(contents[1].confidence).toBe(0.8);
      expect(contents[1].boundingBox).toBeUndefined();
    });
  });

  describe("dispose", () => {
    it("should clear all state on dispose", () => {
      const result = createMockResult([createMockLabel("test", 0.5)]);
      renderer.render(result, {
        labels: true,
        ocrText: true,
        boundingBoxes: true,
      });

      renderer.dispose();

      expect(renderer.getCurrentResult()).toBeUndefined();
    });
  });
});
