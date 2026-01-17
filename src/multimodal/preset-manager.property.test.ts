/**
 * Property-Based Tests for Preset Manager
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the PresetManager component.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  PresetManager,
  createPresetManager,
  DEFAULT_PRESETS,
} from "./preset-manager";
import { ModelPreset, AnalysisRequest, InferenceMode, SupportedMimeType } from "./types";

// ============================================================================
// Generators
// ============================================================================

// Generator for valid preset IDs
const presetIdArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0 && !s.includes(" "));

// Generator for valid preset names
const presetNameArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

// Generator for valid model IDs
const modelIdArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Generator for confidence threshold (0-100)
const confidenceThresholdArb = fc.integer({ min: 0, max: 100 });

// Generator for plugin ID lists
const pluginListArb = fc.array(
  fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
  { minLength: 0, maxLength: 10 }
);

// Generator for valid model presets
const modelPresetArb: fc.Arbitrary<ModelPreset> = fc.record({
  id: presetIdArb,
  name: presetNameArb,
  modelId: modelIdArb,
  confidenceThreshold: confidenceThresholdArb,
  plugins: pluginListArb,
});

// Generator for inference mode
const inferenceModeArb: fc.Arbitrary<InferenceMode> = fc.constantFrom("local", "cloud");

// Generator for supported MIME types
const mimeTypeArb: fc.Arbitrary<SupportedMimeType> = fc.constantFrom(
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
);

// Generator for analysis requests
const analysisRequestArb: fc.Arbitrary<AnalysisRequest> = fc.record({
  imagePath: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  mimeType: mimeTypeArb,
  fileSize: fc.integer({ min: 1, max: 25 * 1024 * 1024 }),
  modelId: modelIdArb,
  confidenceThreshold: confidenceThresholdArb,
  inferenceMode: inferenceModeArb,
  workspaceRoot: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
});

// ============================================================================
// Property Tests
// ============================================================================

describe("PresetManager Property Tests", () => {
  let presetManager: PresetManager;

  beforeEach(() => {
    presetManager = createPresetManager();
  });

  describe("Feature: multimodal-input, Property 27: Preset Application", () => {
    /**
     * **Validates: Requirements REQ-10.2**
     * 
     * For any selected model preset, the system SHALL apply the preset's 
     * model id, confidence threshold, and plugin list to the analysis request.
     */

    it("should apply preset model id to analysis request", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          analysisRequestArb,
          async (preset, request) => {
            // Ensure preset ID doesn't conflict with defaults
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            const result = presetManager.applyPreset(uniquePreset.id, request);

            // Property: Applied request should have preset's model id
            expect(result.modelId).toBe(uniquePreset.modelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply preset confidence threshold to analysis request", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          analysisRequestArb,
          async (preset, request) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            const result = presetManager.applyPreset(uniquePreset.id, request);

            // Property: Applied request should have preset's confidence threshold
            expect(result.confidenceThreshold).toBe(uniquePreset.confidenceThreshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should provide preset plugin list via getPresetPlugins", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          async (preset) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            const plugins = presetManager.getPresetPlugins(uniquePreset.id);

            // Property: Plugin list should match preset's plugins
            expect(plugins).toEqual(uniquePreset.plugins);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve non-preset fields in analysis request", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          analysisRequestArb,
          async (preset, request) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            const result = presetManager.applyPreset(uniquePreset.id, request);

            // Property: Non-preset fields should remain unchanged
            expect(result.imagePath).toBe(request.imagePath);
            expect(result.mimeType).toBe(request.mimeType);
            expect(result.fileSize).toBe(request.fileSize);
            expect(result.inferenceMode).toBe(request.inferenceMode);
            expect(result.workspaceRoot).toBe(request.workspaceRoot);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply all preset properties consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          analysisRequestArb,
          async (preset, request) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            const result = presetManager.applyPreset(uniquePreset.id, request);
            const plugins = presetManager.getPresetPlugins(uniquePreset.id);

            // Property: All preset properties should be applied consistently
            expect(result.modelId).toBe(uniquePreset.modelId);
            expect(result.confidenceThreshold).toBe(uniquePreset.confidenceThreshold);
            expect(plugins).toEqual(uniquePreset.plugins);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return original request when preset not found", async () => {
      await fc.assert(
        fc.asyncProperty(
          presetIdArb,
          analysisRequestArb,
          async (nonExistentId, request) => {
            // Ensure the ID doesn't match any default preset
            const uniqueId = `nonexistent-${nonExistentId}`;

            const result = presetManager.applyPreset(uniqueId, request);

            // Property: Request should be unchanged when preset not found
            expect(result.modelId).toBe(request.modelId);
            expect(result.confidenceThreshold).toBe(request.confidenceThreshold);
            expect(result.imagePath).toBe(request.imagePath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply default presets correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...DEFAULT_PRESETS),
          analysisRequestArb,
          async (defaultPreset, request) => {
            const result = presetManager.applyPreset(defaultPreset.id, request);

            // Property: Default preset properties should be applied
            expect(result.modelId).toBe(defaultPreset.modelId);
            expect(result.confidenceThreshold).toBe(defaultPreset.confidenceThreshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle multiple preset applications independently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(modelPresetArb, { minLength: 2, maxLength: 5 })
            .map(presets => presets.map((p, i) => ({ ...p, id: `preset-${i}` }))),
          analysisRequestArb,
          async (presets, request) => {
            // Register all presets
            for (const preset of presets) {
              presetManager.registerPreset(preset);
            }

            // Apply each preset and verify independence
            for (const preset of presets) {
              const result = presetManager.applyPreset(preset.id, request);
              
              // Property: Each preset application should be independent
              expect(result.modelId).toBe(preset.modelId);
              expect(result.confidenceThreshold).toBe(preset.confidenceThreshold);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should persist preset selection per workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          async (preset, workspaceRoot) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            presetManager.registerPreset(uniquePreset);

            await presetManager.setSelectedPreset(workspaceRoot, uniquePreset.id);
            const selected = presetManager.getSelectedPreset(workspaceRoot);

            // Property: Selected preset should be persisted for workspace
            expect(selected).toBe(uniquePreset.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain separate preset selections for different workspaces", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(modelPresetArb, { minLength: 2, maxLength: 5 })
            .map(presets => presets.map((p, i) => ({ ...p, id: `preset-${i}` }))),
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            { minLength: 2, maxLength: 5 }
          ).map(roots => [...new Set(roots)].map((r, i) => `${r}-${i}`)),
          async (presets, workspaceRoots) => {
            // Register all presets
            for (const preset of presets) {
              presetManager.registerPreset(preset);
            }

            // Set different presets for different workspaces
            const selections: Map<string, string> = new Map();
            for (let i = 0; i < workspaceRoots.length; i++) {
              const presetIndex = i % presets.length;
              const workspace = workspaceRoots[i];
              const presetId = presets[presetIndex].id;
              
              await presetManager.setSelectedPreset(workspace, presetId);
              selections.set(workspace, presetId);
            }

            // Property: Each workspace should have its own selection
            for (const [workspace, expectedPresetId] of selections) {
              const selected = presetManager.getSelectedPreset(workspace);
              expect(selected).toBe(expectedPresetId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should save and retrieve presets correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          modelPresetArb,
          async (preset) => {
            const uniquePreset = { ...preset, id: `custom-${preset.id}` };
            
            await presetManager.savePreset(uniquePreset);
            const retrieved = presetManager.getPreset(uniquePreset.id);

            // Property: Saved preset should be retrievable with same properties
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(uniquePreset.id);
            expect(retrieved?.name).toBe(uniquePreset.name);
            expect(retrieved?.modelId).toBe(uniquePreset.modelId);
            expect(retrieved?.confidenceThreshold).toBe(uniquePreset.confidenceThreshold);
            expect(retrieved?.plugins).toEqual(uniquePreset.plugins);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include saved presets in getPresets result", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(modelPresetArb, { minLength: 1, maxLength: 5 })
            .map(presets => presets.map((p, i) => ({ ...p, id: `custom-${i}-${p.id}` }))),
          async (presets) => {
            // Save all presets
            for (const preset of presets) {
              await presetManager.savePreset(preset);
            }

            const allPresets = presetManager.getPresets();

            // Property: All saved presets should be in the list
            for (const preset of presets) {
              const found = allPresets.find(p => p.id === preset.id);
              expect(found).toBeDefined();
              expect(found?.modelId).toBe(preset.modelId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
