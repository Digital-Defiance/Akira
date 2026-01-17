/**
 * Unit tests for ResultsPanel
 * Requirements: REQ-2.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ResultsPanel } from "./results-panel";
import { AnalysisResult } from "./types";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    id: "test-id-123",
    imagePath: "/workspace/images/test.png",
    timestamp: "2025-01-16T10:00:00.000Z",
    modelId: "test-model-v1",
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
// ResultsPanel Tests
// ============================================================================

describe("ResultsPanel", () => {
  afterEach(() => {
    // Clean up any existing panel
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.dispose();
    }
  });

  describe("createOrShow", () => {
    it("should create a new panel when none exists", () => {
      const panel = ResultsPanel.createOrShow();
      
      expect(panel).toBeDefined();
      expect(ResultsPanel.currentPanel).toBe(panel);
    });

    it("should return existing panel when one exists", () => {
      const panel1 = ResultsPanel.createOrShow();
      const panel2 = ResultsPanel.createOrShow();
      
      expect(panel1).toBe(panel2);
    });

    it("should accept initial result", () => {
      const result = createTestAnalysisResult();
      const panel = ResultsPanel.createOrShow(result);
      
      expect(panel.getCurrentResult()).toEqual(result);
    });

    it("should update existing panel with new result", () => {
      const result1 = createTestAnalysisResult({ id: "first" });
      const result2 = createTestAnalysisResult({ id: "second" });
      
      ResultsPanel.createOrShow(result1);
      ResultsPanel.createOrShow(result2);
      
      expect(ResultsPanel.currentPanel?.getCurrentResult()?.id).toBe("second");
    });
  });

  describe("updateResult", () => {
    it("should update the current result", () => {
      const panel = ResultsPanel.createOrShow();
      const result = createTestAnalysisResult();
      
      panel.updateResult(result);
      
      expect(panel.getCurrentResult()).toEqual(result);
    });

    it("should replace previous result", () => {
      const result1 = createTestAnalysisResult({ id: "first" });
      const result2 = createTestAnalysisResult({ id: "second" });
      
      const panel = ResultsPanel.createOrShow(result1);
      panel.updateResult(result2);
      
      expect(panel.getCurrentResult()?.id).toBe("second");
    });
  });

  describe("clear", () => {
    it("should clear the current result", () => {
      const result = createTestAnalysisResult();
      const panel = ResultsPanel.createOrShow(result);
      
      panel.clear();
      
      expect(panel.getCurrentResult()).toBeUndefined();
    });
  });

  describe("dispose", () => {
    it("should clear currentPanel reference", () => {
      const panel = ResultsPanel.createOrShow();
      
      panel.dispose();
      
      expect(ResultsPanel.currentPanel).toBeUndefined();
    });
  });

  describe("serializeResult", () => {
    it("should serialize result to JSON string", () => {
      const result = createTestAnalysisResult();
      
      const json = ResultsPanel.serializeResult(result);
      
      expect(typeof json).toBe("string");
      expect(json).toContain("test-id-123");
      expect(json).toContain("test-model-v1");
    });

    it("should produce valid JSON", () => {
      const result = createTestAnalysisResult();
      
      const json = ResultsPanel.serializeResult(result);
      
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("should include all required fields", () => {
      const result = createTestAnalysisResult();
      
      const json = ResultsPanel.serializeResult(result);
      const parsed = JSON.parse(json);
      
      expect(parsed.id).toBe(result.id);
      expect(parsed.imagePath).toBe(result.imagePath);
      expect(parsed.timestamp).toBe(result.timestamp);
      expect(parsed.modelId).toBe(result.modelId);
      expect(parsed.inferenceMode).toBe(result.inferenceMode);
      expect(parsed.duration).toBe(result.duration);
      expect(parsed.labels).toEqual(result.labels);
      expect(parsed.ocrText).toBe(result.ocrText);
    });

    it("should format JSON with indentation", () => {
      const result = createTestAnalysisResult();
      
      const json = ResultsPanel.serializeResult(result);
      
      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });
  });

  describe("deserializeResult", () => {
    it("should deserialize JSON string to result", () => {
      const original = createTestAnalysisResult();
      const json = JSON.stringify(original);
      
      const result = ResultsPanel.deserializeResult(json);
      
      expect(result).toEqual(original);
    });

    it("should round-trip serialize/deserialize", () => {
      const original = createTestAnalysisResult();
      
      const json = ResultsPanel.serializeResult(original);
      const result = ResultsPanel.deserializeResult(json);
      
      expect(result).toEqual(original);
    });

    it("should preserve labels with bounding boxes", () => {
      const original = createTestAnalysisResult({
        labels: [
          { label: "test", confidence: 0.9, boundingBox: { x: 1, y: 2, width: 3, height: 4 } },
        ],
      });
      
      const json = ResultsPanel.serializeResult(original);
      const result = ResultsPanel.deserializeResult(json);
      
      expect(result.labels[0].boundingBox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    });

    it("should preserve optional ocrText", () => {
      const withOcr = createTestAnalysisResult({ ocrText: "Hello World" });
      const withoutOcr = createTestAnalysisResult({ ocrText: undefined });
      
      const jsonWithOcr = ResultsPanel.serializeResult(withOcr);
      const jsonWithoutOcr = ResultsPanel.serializeResult(withoutOcr);
      
      expect(ResultsPanel.deserializeResult(jsonWithOcr).ocrText).toBe("Hello World");
      expect(ResultsPanel.deserializeResult(jsonWithoutOcr).ocrText).toBeUndefined();
    });
  });

  describe("JSON serialization round-trip (REQ-2.2)", () => {
    it("should preserve all fields through serialization", () => {
      const original: AnalysisResult = {
        id: "unique-id-456",
        imagePath: "/path/to/image.jpg",
        timestamp: "2025-01-16T12:30:45.123Z",
        modelId: "advanced-model-v2",
        inferenceMode: "cloud",
        duration: 2500,
        labels: [
          { label: "person", confidence: 0.99, boundingBox: { x: 50, y: 100, width: 200, height: 300 } },
          { label: "background", confidence: 0.75 },
          { label: "outdoor", confidence: 0.82, boundingBox: { x: 0, y: 0, width: 640, height: 480 } },
        ],
        ocrText: "Multi-line\nOCR text\nwith special chars: <>&\"'",
      };
      
      const json = ResultsPanel.serializeResult(original);
      const restored = ResultsPanel.deserializeResult(json);
      
      expect(restored).toEqual(original);
    });

    it("should handle empty labels array", () => {
      const original = createTestAnalysisResult({ labels: [] });
      
      const json = ResultsPanel.serializeResult(original);
      const restored = ResultsPanel.deserializeResult(json);
      
      expect(restored.labels).toEqual([]);
    });

    it("should handle result without ocrText", () => {
      const original = createTestAnalysisResult();
      delete (original as any).ocrText;
      
      const json = ResultsPanel.serializeResult(original);
      const restored = ResultsPanel.deserializeResult(json);
      
      expect(restored.ocrText).toBeUndefined();
    });
  });
});
