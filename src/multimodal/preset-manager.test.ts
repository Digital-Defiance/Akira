/**
 * Unit tests for PresetManager
 * Requirements: REQ-10.2
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PresetManager,
  createPresetManager,
  DEFAULT_PRESETS,
} from "./preset-manager";
import { ModelPreset, AnalysisRequest } from "./types";

describe("PresetManager", () => {
  let presetManager: PresetManager;

  beforeEach(() => {
    presetManager = createPresetManager();
  });

  describe("getPresets", () => {
    it("should return default presets on initialization", () => {
      const presets = presetManager.getPresets();
      
      expect(presets.length).toBeGreaterThanOrEqual(DEFAULT_PRESETS.length);
      
      // Verify default presets are present
      for (const defaultPreset of DEFAULT_PRESETS) {
        const found = presets.find(p => p.id === defaultPreset.id);
        expect(found).toBeDefined();
        expect(found?.name).toBe(defaultPreset.name);
      }
    });

    it("should include custom presets after registration", () => {
      const customPreset: ModelPreset = {
        id: "custom-preset",
        name: "Custom Preset",
        modelId: "custom-model",
        confidenceThreshold: 75,
        plugins: ["plugin-a", "plugin-b"],
      };

      presetManager.registerPreset(customPreset);
      const presets = presetManager.getPresets();

      const found = presets.find(p => p.id === "custom-preset");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Custom Preset");
      expect(found?.modelId).toBe("custom-model");
    });
  });

  describe("getPreset", () => {
    it("should return preset by ID", () => {
      const preset = presetManager.getPreset("default");
      
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("default");
    });

    it("should return undefined for non-existent preset", () => {
      const preset = presetManager.getPreset("non-existent");
      
      expect(preset).toBeUndefined();
    });
  });

  describe("applyPreset", () => {
    it("should apply preset model id and confidence threshold to request", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "original-model",
        confidenceThreshold: 50,
        inferenceMode: "local",
        workspaceRoot: "/workspace",
      };

      // Register a custom preset
      const customPreset: ModelPreset = {
        id: "test-preset",
        name: "Test Preset",
        modelId: "preset-model",
        confidenceThreshold: 85,
        plugins: ["plugin-x"],
      };
      presetManager.registerPreset(customPreset);

      const result = presetManager.applyPreset("test-preset", request);

      expect(result.modelId).toBe("preset-model");
      expect(result.confidenceThreshold).toBe(85);
      // Other fields should remain unchanged
      expect(result.imagePath).toBe("/path/to/image.png");
      expect(result.inferenceMode).toBe("local");
    });

    it("should return original request if preset not found", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "original-model",
        confidenceThreshold: 50,
        inferenceMode: "local",
        workspaceRoot: "/workspace",
      };

      const result = presetManager.applyPreset("non-existent", request);

      expect(result.modelId).toBe("original-model");
      expect(result.confidenceThreshold).toBe(50);
    });

    it("should apply default preset correctly", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "some-model",
        confidenceThreshold: 99,
        inferenceMode: "cloud",
        workspaceRoot: "/workspace",
      };

      const result = presetManager.applyPreset("default", request);

      expect(result.modelId).toBe("default");
      expect(result.confidenceThreshold).toBe(50);
    });

    it("should apply high-accuracy preset correctly", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "some-model",
        confidenceThreshold: 50,
        inferenceMode: "local",
        workspaceRoot: "/workspace",
      };

      const result = presetManager.applyPreset("high-accuracy", request);

      expect(result.confidenceThreshold).toBe(80);
    });
  });

  describe("applyPresetWithResult", () => {
    it("should return success with applied preset details", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "original-model",
        confidenceThreshold: 50,
        inferenceMode: "local",
        workspaceRoot: "/workspace",
      };

      const result = presetManager.applyPresetWithResult("default", request);

      expect(result.success).toBe(true);
      expect(result.appliedPreset).toBeDefined();
      expect(result.appliedPreset?.id).toBe("default");
      expect(result.error).toBeUndefined();
    });

    it("should return failure for non-existent preset", () => {
      const request: AnalysisRequest = {
        imagePath: "/path/to/image.png",
        mimeType: "image/png",
        fileSize: 1024,
        modelId: "original-model",
        confidenceThreshold: 50,
        inferenceMode: "local",
        workspaceRoot: "/workspace",
      };

      const result = presetManager.applyPresetWithResult("non-existent", request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Preset not found");
      expect(result.appliedPreset).toBeUndefined();
    });
  });

  describe("getPresetPlugins", () => {
    it("should return plugin list from preset", () => {
      const customPreset: ModelPreset = {
        id: "plugin-preset",
        name: "Plugin Preset",
        modelId: "model",
        confidenceThreshold: 50,
        plugins: ["plugin-a", "plugin-b", "plugin-c"],
      };
      presetManager.registerPreset(customPreset);

      const plugins = presetManager.getPresetPlugins("plugin-preset");

      expect(plugins).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
    });

    it("should return empty array for preset without plugins", () => {
      const plugins = presetManager.getPresetPlugins("default");

      expect(plugins).toEqual([]);
    });

    it("should return empty array for non-existent preset", () => {
      const plugins = presetManager.getPresetPlugins("non-existent");

      expect(plugins).toEqual([]);
    });
  });

  describe("savePreset", () => {
    it("should save a valid preset", async () => {
      const preset: ModelPreset = {
        id: "new-preset",
        name: "New Preset",
        modelId: "new-model",
        confidenceThreshold: 60,
        plugins: [],
      };

      await presetManager.savePreset(preset);

      const saved = presetManager.getPreset("new-preset");
      expect(saved).toBeDefined();
      expect(saved?.name).toBe("New Preset");
    });

    it("should throw error for preset without id", async () => {
      const preset = {
        id: "",
        name: "Invalid",
        modelId: "model",
        confidenceThreshold: 50,
        plugins: [],
      } as ModelPreset;

      await expect(presetManager.savePreset(preset)).rejects.toThrow("non-empty id");
    });

    it("should throw error for preset without name", async () => {
      const preset = {
        id: "valid-id",
        name: "",
        modelId: "model",
        confidenceThreshold: 50,
        plugins: [],
      } as ModelPreset;

      await expect(presetManager.savePreset(preset)).rejects.toThrow("non-empty name");
    });

    it("should throw error for invalid confidence threshold", async () => {
      const preset = {
        id: "valid-id",
        name: "Valid Name",
        modelId: "model",
        confidenceThreshold: 150,
        plugins: [],
      } as ModelPreset;

      await expect(presetManager.savePreset(preset)).rejects.toThrow("confidenceThreshold");
    });
  });

  describe("deletePreset", () => {
    it("should delete custom preset", async () => {
      const preset: ModelPreset = {
        id: "deletable",
        name: "Deletable",
        modelId: "model",
        confidenceThreshold: 50,
        plugins: [],
      };
      presetManager.registerPreset(preset);

      const deleted = await presetManager.deletePreset("deletable");

      expect(deleted).toBe(true);
      expect(presetManager.getPreset("deletable")).toBeUndefined();
    });

    it("should not delete default presets", async () => {
      const deleted = await presetManager.deletePreset("default");

      expect(deleted).toBe(false);
      expect(presetManager.getPreset("default")).toBeDefined();
    });

    it("should return false for non-existent preset", async () => {
      const deleted = await presetManager.deletePreset("non-existent");

      expect(deleted).toBe(false);
    });
  });

  describe("selectedPreset", () => {
    it("should return default when no preset selected", () => {
      const selected = presetManager.getSelectedPreset("/workspace");

      expect(selected).toBe("default");
    });

    it("should persist selected preset in memory", async () => {
      await presetManager.setSelectedPreset("/workspace", "high-accuracy");

      const selected = presetManager.getSelectedPreset("/workspace");
      expect(selected).toBe("high-accuracy");
    });

    it("should throw error when selecting non-existent preset", async () => {
      await expect(
        presetManager.setSelectedPreset("/workspace", "non-existent")
      ).rejects.toThrow("Preset not found");
    });

    it("should maintain separate selections per workspace", async () => {
      await presetManager.setSelectedPreset("/workspace1", "high-accuracy");
      await presetManager.setSelectedPreset("/workspace2", "fast-detection");

      expect(presetManager.getSelectedPreset("/workspace1")).toBe("high-accuracy");
      expect(presetManager.getSelectedPreset("/workspace2")).toBe("fast-detection");
    });
  });

  describe("reset", () => {
    it("should reset to default state", () => {
      // Add custom preset and selection
      presetManager.registerPreset({
        id: "custom",
        name: "Custom",
        modelId: "model",
        confidenceThreshold: 50,
        plugins: [],
      });

      presetManager.reset();

      const presets = presetManager.getPresets();
      expect(presets.length).toBe(DEFAULT_PRESETS.length);
      expect(presetManager.getPreset("custom")).toBeUndefined();
    });
  });
});
