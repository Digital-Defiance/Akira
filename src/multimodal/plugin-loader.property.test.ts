/**
 * Property-Based Tests for Plugin Loader
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the PluginLoader component.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  PluginLoader,
  __setVSCodeForTesting,
  __setFsForTesting,
} from "./plugin-loader";
import { ImageAnalysisPlugin, AnalysisResult } from "./types";

// Mock output channel
const mockOutputChannel = {
  appendLine: vi.fn(),
};

// Mock VS Code module
const mockVSCode = {
  window: {
    createOutputChannel: vi.fn().mockReturnValue(mockOutputChannel),
  },
};

// Generator for valid plugin IDs
const pluginIdArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0 && !s.includes(" "));

// Generator for analysis results
const analysisResultArb: fc.Arbitrary<AnalysisResult> = fc.record({
  id: fc.uuid(),
  imagePath: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  timestamp: fc.date().map(d => d.toISOString()),
  modelId: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  inferenceMode: fc.constantFrom("local" as const, "cloud" as const),
  duration: fc.integer({ min: 0, max: 60000 }),
  labels: fc.array(
    fc.record({
      label: fc.string({ minLength: 1 }),
      confidence: fc.float({ min: 0, max: 1, noNaN: true }),
      boundingBox: fc.option(
        fc.record({
          x: fc.integer({ min: 0, max: 10000 }),
          y: fc.integer({ min: 0, max: 10000 }),
          width: fc.integer({ min: 1, max: 10000 }),
          height: fc.integer({ min: 1, max: 10000 }),
        }),
        { nil: undefined }
      ),
    }),
    { minLength: 0, maxLength: 10 }
  ),
  ocrText: fc.option(fc.string(), { nil: undefined }),
});

// Helper to create a mock plugin that tracks execution
function createTrackingPlugin(
  id: string,
  executionTracker: string[],
  shouldThrow: boolean = false,
  errorMessage: string = "Plugin error"
): ImageAnalysisPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: "1.0.0",
    processImage: async (_imagePath: string, result: AnalysisResult) => {
      executionTracker.push(id);
      if (shouldThrow) {
        throw new Error(errorMessage);
      }
      return result;
    },
  };
}

describe("PluginLoader Property Tests", () => {
  let pluginLoader: PluginLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    __setVSCodeForTesting(mockVSCode);
    __setFsForTesting(undefined);
    pluginLoader = new PluginLoader();
    pluginLoader.setOutputChannel(mockOutputChannel);
  });

  afterEach(() => {
    pluginLoader.clearPlugins();
    __setVSCodeForTesting(undefined);
    __setFsForTesting(undefined);
  });

  describe("Feature: multimodal-input, Property 26: Plugin Execution Order", () => {
    /**
     * **Validates: Requirements REQ-10.1**
     * 
     * For any list of enabled plugins, the system SHALL call each plugin's 
     * processImage function in the order specified, passing the image path 
     * and current results.
     */

    it("should execute plugins in the exact order specified", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a list of unique plugin IDs (1-10 plugins)
          fc.array(pluginIdArb, { minLength: 1, maxLength: 10 })
            .map(ids => [...new Set(ids)]) // Ensure unique IDs
            .filter(ids => ids.length >= 1),
          // Generate an analysis result
          analysisResultArb,
          async (pluginIds, result) => {
            const executionOrder: string[] = [];
            
            // Register plugins that track their execution order
            for (const id of pluginIds) {
              pluginLoader.registerPlugin(createTrackingPlugin(id, executionOrder));
            }
            
            // Execute plugins in the specified order
            await pluginLoader.executePlugins(result, pluginIds, "/workspace");
            
            // Property: Execution order must match the specified order exactly
            expect(executionOrder).toEqual(pluginIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should pass image path to each plugin", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate unique plugin IDs
          fc.array(pluginIdArb, { minLength: 1, maxLength: 5 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 1),
          // Generate an analysis result
          analysisResultArb,
          async (pluginIds, result) => {
            const receivedPaths: string[] = [];
            
            // Register plugins that track received image paths
            for (const id of pluginIds) {
              pluginLoader.registerPlugin({
                id,
                name: `Plugin ${id}`,
                version: "1.0.0",
                processImage: async (imagePath: string, res: AnalysisResult) => {
                  receivedPaths.push(imagePath);
                  return res;
                },
              });
            }
            
            await pluginLoader.executePlugins(result, pluginIds, "/workspace");
            
            // Property: Each plugin should receive the same image path
            expect(receivedPaths.length).toBe(pluginIds.length);
            for (const path of receivedPaths) {
              expect(path).toBe(result.imagePath);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should pass current results to each plugin", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate unique plugin IDs
          fc.array(pluginIdArb, { minLength: 1, maxLength: 5 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 1),
          // Generate an analysis result
          analysisResultArb,
          async (pluginIds, result) => {
            const receivedResults: AnalysisResult[] = [];
            
            // Register plugins that track received results
            for (const id of pluginIds) {
              pluginLoader.registerPlugin({
                id,
                name: `Plugin ${id}`,
                version: "1.0.0",
                processImage: async (_imagePath: string, res: AnalysisResult) => {
                  receivedResults.push({ ...res });
                  return res;
                },
              });
            }
            
            await pluginLoader.executePlugins(result, pluginIds, "/workspace");
            
            // Property: Each plugin should receive a result object
            expect(receivedResults.length).toBe(pluginIds.length);
            for (const received of receivedResults) {
              expect(received.id).toBe(result.id);
              expect(received.modelId).toBe(result.modelId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should execute only specified plugins in specified order", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate all available plugin IDs
          fc.array(pluginIdArb, { minLength: 3, maxLength: 10 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 3),
          // Generate an analysis result
          analysisResultArb,
          async (allPluginIds, result) => {
            const executionOrder: string[] = [];
            
            // Register all plugins
            for (const id of allPluginIds) {
              pluginLoader.registerPlugin(createTrackingPlugin(id, executionOrder));
            }
            
            // Select a subset of plugins to execute (in a different order)
            const selectedIds = allPluginIds.slice(0, Math.ceil(allPluginIds.length / 2)).reverse();
            
            await pluginLoader.executePlugins(result, selectedIds, "/workspace");
            
            // Property: Only selected plugins should execute, in the specified order
            expect(executionOrder).toEqual(selectedIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle empty plugin list", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          async (result) => {
            const executionOrder: string[] = [];
            
            // Register some plugins
            pluginLoader.registerPlugin(createTrackingPlugin("plugin-1", executionOrder));
            pluginLoader.registerPlugin(createTrackingPlugin("plugin-2", executionOrder));
            
            // Execute with empty list
            const processed = await pluginLoader.executePlugins(result, [], "/workspace");
            
            // Property: No plugins should execute
            expect(executionOrder).toHaveLength(0);
            // Result should be unchanged
            expect(processed.id).toBe(result.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should skip non-existent plugins while maintaining order for existing ones", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate existing plugin IDs
          fc.array(pluginIdArb, { minLength: 2, maxLength: 5 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 2),
          // Generate non-existent plugin IDs
          fc.array(pluginIdArb, { minLength: 1, maxLength: 3 })
            .map(ids => ids.map(id => `nonexistent-${id}`)),
          analysisResultArb,
          async (existingIds, nonExistentIds, result) => {
            const executionOrder: string[] = [];
            
            // Register only existing plugins
            for (const id of existingIds) {
              pluginLoader.registerPlugin(createTrackingPlugin(id, executionOrder));
            }
            
            // Interleave existing and non-existent IDs
            const mixedIds: string[] = [];
            for (let i = 0; i < Math.max(existingIds.length, nonExistentIds.length); i++) {
              if (i < nonExistentIds.length) mixedIds.push(nonExistentIds[i]);
              if (i < existingIds.length) mixedIds.push(existingIds[i]);
            }
            
            await pluginLoader.executePlugins(result, mixedIds, "/workspace");
            
            // Property: Only existing plugins should execute, in their relative order
            expect(executionOrder).toEqual(existingIds);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Feature: multimodal-input, Property 28: Plugin Exception Isolation", () => {
    /**
     * **Validates: Requirements REQ-10.3**
     * 
     * For any plugin that throws an exception during execution, the system 
     * SHALL log the error and continue executing remaining plugins in the list.
     */

    it("should continue executing remaining plugins after exception", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate plugin IDs (at least 3 to have plugins before and after failing one)
          fc.array(pluginIdArb, { minLength: 3, maxLength: 10 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 3),
          // Index of the failing plugin
          fc.nat(),
          analysisResultArb,
          async (pluginIds, failingIndexRaw, result) => {
            const failingIndex = failingIndexRaw % pluginIds.length;
            const executionOrder: string[] = [];
            
            // Register plugins, one of which will throw
            for (let i = 0; i < pluginIds.length; i++) {
              const shouldThrow = i === failingIndex;
              pluginLoader.registerPlugin(
                createTrackingPlugin(pluginIds[i], executionOrder, shouldThrow)
              );
            }
            
            await pluginLoader.executePlugins(result, pluginIds, "/workspace");
            
            // Property: All plugins should have been attempted (execution tracked)
            expect(executionOrder).toEqual(pluginIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should log plugin id when exception occurs", async () => {
      await fc.assert(
        fc.asyncProperty(
          pluginIdArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          analysisResultArb,
          async (pluginId, errorMessage, result) => {
            mockOutputChannel.appendLine.mockClear();
            
            pluginLoader.registerPlugin(
              createTrackingPlugin(pluginId, [], true, errorMessage)
            );
            
            await pluginLoader.executePlugins(result, [pluginId], "/workspace");
            
            // Property: Plugin ID should be logged
            const logCalls = mockOutputChannel.appendLine.mock.calls.map(c => c[0]);
            const hasPluginIdLog = logCalls.some(
              (log: string) => log.includes(pluginId) && log.includes("threw exception")
            );
            expect(hasPluginIdLog).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should log error message when exception occurs", async () => {
      await fc.assert(
        fc.asyncProperty(
          pluginIdArb,
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          analysisResultArb,
          async (pluginId, errorMessage, result) => {
            mockOutputChannel.appendLine.mockClear();
            
            pluginLoader.registerPlugin(
              createTrackingPlugin(pluginId, [], true, errorMessage)
            );
            
            await pluginLoader.executePlugins(result, [pluginId], "/workspace");
            
            // Property: Error message should be logged
            const logCalls = mockOutputChannel.appendLine.mock.calls.map(c => c[0]);
            const hasErrorLog = logCalls.some(
              (log: string) => log.includes(errorMessage)
            );
            expect(hasErrorLog).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should record failure in execution log", async () => {
      await fc.assert(
        fc.asyncProperty(
          pluginIdArb,
          fc.string({ minLength: 1, maxLength: 100 }),
          analysisResultArb,
          async (pluginId, errorMessage, result) => {
            pluginLoader.registerPlugin(
              createTrackingPlugin(pluginId, [], true, errorMessage)
            );
            
            await pluginLoader.executePlugins(result, [pluginId], "/workspace");
            
            const log = pluginLoader.getExecutionLog();
            
            // Property: Execution log should record the failure
            expect(log.length).toBe(1);
            expect(log[0].pluginId).toBe(pluginId);
            expect(log[0].success).toBe(false);
            expect(log[0].error).toBe(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle multiple failing plugins", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate plugin IDs
          fc.array(pluginIdArb, { minLength: 2, maxLength: 8 })
            .map(ids => [...new Set(ids)])
            .filter(ids => ids.length >= 2),
          // Generate which plugins should fail (as boolean array)
          fc.array(fc.boolean(), { minLength: 2, maxLength: 8 }),
          analysisResultArb,
          async (pluginIds, shouldFailFlags, result) => {
            const executionOrder: string[] = [];
            
            // Register plugins with varying failure states
            for (let i = 0; i < pluginIds.length; i++) {
              const shouldFail = shouldFailFlags[i % shouldFailFlags.length];
              pluginLoader.registerPlugin(
                createTrackingPlugin(pluginIds[i], executionOrder, shouldFail)
              );
            }
            
            await pluginLoader.executePlugins(result, pluginIds, "/workspace");
            
            // Property: All plugins should still be attempted
            expect(executionOrder).toEqual(pluginIds);
            
            // Property: Execution log should have entries for all plugins
            const log = pluginLoader.getExecutionLog();
            expect(log.length).toBe(pluginIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not propagate exceptions to caller", async () => {
      await fc.assert(
        fc.asyncProperty(
          pluginIdArb,
          analysisResultArb,
          async (pluginId, result) => {
            pluginLoader.registerPlugin(
              createTrackingPlugin(pluginId, [], true, "Fatal error")
            );
            
            // Property: executePlugins should not throw even when plugin throws
            await expect(
              pluginLoader.executePlugins(result, [pluginId], "/workspace")
            ).resolves.not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve result from successful plugins after failed ones", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (result, addedLabel) => {
            // First plugin fails
            pluginLoader.registerPlugin(
              createTrackingPlugin("failing-plugin", [], true)
            );
            
            // Second plugin modifies result
            pluginLoader.registerPlugin({
              id: "modifying-plugin",
              name: "Modifying Plugin",
              version: "1.0.0",
              processImage: async (_path: string, res: AnalysisResult) => ({
                ...res,
                labels: [...res.labels, { label: addedLabel, confidence: 1.0 }],
              }),
            });
            
            const processed = await pluginLoader.executePlugins(
              result,
              ["failing-plugin", "modifying-plugin"],
              "/workspace"
            );
            
            // Property: Modifications from successful plugin should be preserved
            const hasAddedLabel = processed.labels.some(l => l.label === addedLabel);
            expect(hasAddedLabel).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
