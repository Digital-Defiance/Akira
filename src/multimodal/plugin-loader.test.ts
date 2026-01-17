/**
 * Unit Tests for Plugin Loader
 * Feature: multimodal-input
 * 
 * Tests for PluginLoader component that handles workspace plugin
 * discovery, validation, and execution.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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

// Helper to create a valid analysis result
function createMockAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: "test-result-1",
    imagePath: "/test/image.png",
    timestamp: new Date().toISOString(),
    modelId: "test-model",
    inferenceMode: "local",
    duration: 100,
    labels: [
      { label: "cat", confidence: 0.95 },
      { label: "animal", confidence: 0.99 },
    ],
    ocrText: "Sample text",
    ...overrides,
  };
}

// Helper to create a valid plugin
function createMockPlugin(overrides: Partial<ImageAnalysisPlugin> = {}): ImageAnalysisPlugin {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    processImage: vi.fn().mockImplementation(async (_imagePath, result) => result),
    ...overrides,
  };
}

describe("PluginLoader", () => {
  let pluginLoader: PluginLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    __setVSCodeForTesting(mockVSCode);
    __setFsForTesting(undefined);
    pluginLoader = new PluginLoader();
    pluginLoader.setOutputChannel(mockOutputChannel);
  });

  afterEach(() => {
    __setVSCodeForTesting(undefined);
    __setFsForTesting(undefined);
  });

  describe("validatePluginInterface", () => {
    it("should validate a valid plugin", () => {
      const plugin = createMockPlugin();
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject null plugin", () => {
      const result = pluginLoader.validatePluginInterface(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must be an object");
    });

    it("should reject undefined plugin", () => {
      const result = pluginLoader.validatePluginInterface(undefined);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must be an object");
    });

    it("should reject plugin without id", () => {
      const plugin = createMockPlugin({ id: "" });
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must have a non-empty 'id' string property");
    });

    it("should reject plugin without name", () => {
      const plugin = createMockPlugin({ name: "" });
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must have a non-empty 'name' string property");
    });

    it("should reject plugin without version", () => {
      const plugin = createMockPlugin({ version: "" });
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must have a non-empty 'version' string property");
    });

    it("should reject plugin without processImage function", () => {
      const plugin = { id: "test", name: "Test", version: "1.0.0" };
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin must have a 'processImage' function");
    });

    it("should collect multiple validation errors", () => {
      const plugin = { id: "", name: "", version: "" };
      const result = pluginLoader.validatePluginInterface(plugin);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe("registerPlugin", () => {
    it("should register a valid plugin", () => {
      const plugin = createMockPlugin();
      
      pluginLoader.registerPlugin(plugin);
      
      const registered = pluginLoader.getRegisteredPlugins();
      expect(registered.has(plugin.id)).toBe(true);
      expect(registered.get(plugin.id)).toBe(plugin);
    });

    it("should throw error for invalid plugin", () => {
      const invalidPlugin = { id: "", name: "Test", version: "1.0.0" } as ImageAnalysisPlugin;
      
      expect(() => pluginLoader.registerPlugin(invalidPlugin)).toThrow();
    });

    it("should overwrite existing plugin with same id", () => {
      const plugin1 = createMockPlugin({ id: "same-id", name: "Plugin 1" });
      const plugin2 = createMockPlugin({ id: "same-id", name: "Plugin 2" });
      
      pluginLoader.registerPlugin(plugin1);
      pluginLoader.registerPlugin(plugin2);
      
      const registered = pluginLoader.getRegisteredPlugins();
      expect(registered.size).toBe(1);
      expect(registered.get("same-id")?.name).toBe("Plugin 2");
    });
  });

  describe("unregisterPlugin", () => {
    it("should unregister an existing plugin", () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      pluginLoader.unregisterPlugin(plugin.id);
      
      const registered = pluginLoader.getRegisteredPlugins();
      expect(registered.has(plugin.id)).toBe(false);
    });

    it("should not throw when unregistering non-existent plugin", () => {
      expect(() => pluginLoader.unregisterPlugin("non-existent")).not.toThrow();
    });
  });

  describe("clearPlugins", () => {
    it("should clear all registered plugins", () => {
      pluginLoader.registerPlugin(createMockPlugin({ id: "plugin-1" }));
      pluginLoader.registerPlugin(createMockPlugin({ id: "plugin-2" }));
      
      pluginLoader.clearPlugins();
      
      const registered = pluginLoader.getRegisteredPlugins();
      expect(registered.size).toBe(0);
    });
  });

  describe("loadPlugins", () => {
    it("should return in-memory plugins when registered", async () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      const plugins = await pluginLoader.loadPlugins("/workspace");
      
      expect(plugins).toHaveLength(1);
      expect(plugins[0]).toBe(plugin);
    });

    it("should return empty array when fs not available", async () => {
      __setFsForTesting(undefined);
      pluginLoader.clearPlugins();
      
      const plugins = await pluginLoader.loadPlugins("/workspace");
      
      expect(plugins).toHaveLength(0);
    });

    it("should return empty array when plugins directory does not exist", async () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
      };
      __setFsForTesting(mockFs);
      pluginLoader.clearPlugins();
      
      const plugins = await pluginLoader.loadPlugins("/workspace");
      
      expect(plugins).toHaveLength(0);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("Plugins directory not found")
      );
    });
  });

  describe("executePlugins", () => {
    it("should execute plugins in order", async () => {
      const executionOrder: string[] = [];
      
      const plugin1 = createMockPlugin({
        id: "plugin-1",
        processImage: vi.fn().mockImplementation(async (_path, result) => {
          executionOrder.push("plugin-1");
          return result;
        }),
      });
      
      const plugin2 = createMockPlugin({
        id: "plugin-2",
        processImage: vi.fn().mockImplementation(async (_path, result) => {
          executionOrder.push("plugin-2");
          return result;
        }),
      });
      
      const plugin3 = createMockPlugin({
        id: "plugin-3",
        processImage: vi.fn().mockImplementation(async (_path, result) => {
          executionOrder.push("plugin-3");
          return result;
        }),
      });
      
      pluginLoader.registerPlugin(plugin1);
      pluginLoader.registerPlugin(plugin2);
      pluginLoader.registerPlugin(plugin3);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, ["plugin-1", "plugin-2", "plugin-3"], "/workspace");
      
      expect(executionOrder).toEqual(["plugin-1", "plugin-2", "plugin-3"]);
    });

    it("should pass image path and result to each plugin", async () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult({ imagePath: "/test/image.png" });
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      
      expect(plugin.processImage).toHaveBeenCalledWith("/test/image.png", expect.objectContaining({
        imagePath: "/test/image.png",
      }));
    });

    it("should skip plugins not found", async () => {
      const plugin = createMockPlugin({ id: "existing-plugin" });
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, ["non-existent", "existing-plugin"], "/workspace");
      
      expect(plugin.processImage).toHaveBeenCalled();
      
      const log = pluginLoader.getExecutionLog();
      expect(log[0].pluginId).toBe("non-existent");
      expect(log[0].success).toBe(false);
      expect(log[0].error).toContain("not found");
    });

    it("should continue executing after plugin exception", async () => {
      const plugin1 = createMockPlugin({
        id: "failing-plugin",
        processImage: vi.fn().mockRejectedValue(new Error("Plugin error")),
      });
      
      const plugin2 = createMockPlugin({
        id: "working-plugin",
        processImage: vi.fn().mockImplementation(async (_path, result) => result),
      });
      
      pluginLoader.registerPlugin(plugin1);
      pluginLoader.registerPlugin(plugin2);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, ["failing-plugin", "working-plugin"], "/workspace");
      
      // Both plugins should have been attempted
      expect(plugin1.processImage).toHaveBeenCalled();
      expect(plugin2.processImage).toHaveBeenCalled();
      
      // Execution log should show failure and success
      const log = pluginLoader.getExecutionLog();
      expect(log[0].success).toBe(false);
      expect(log[0].error).toBe("Plugin error");
      expect(log[1].success).toBe(true);
    });

    it("should log plugin exceptions to output channel", async () => {
      const plugin = createMockPlugin({
        id: "failing-plugin",
        processImage: vi.fn().mockRejectedValue(new Error("Test error")),
      });
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, ["failing-plugin"], "/workspace");
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("failing-plugin threw exception")
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("Test error")
      );
    });

    it("should return modified result from plugins", async () => {
      const plugin = createMockPlugin({
        processImage: vi.fn().mockImplementation(async (_path, result) => ({
          ...result,
          labels: [...result.labels, { label: "added-by-plugin", confidence: 1.0 }],
        })),
      });
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      const processed = await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      
      expect(processed.labels).toContainEqual({ label: "added-by-plugin", confidence: 1.0 });
    });

    it("should clear execution log at start of each run", async () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      
      // First run
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      expect(pluginLoader.getExecutionLog()).toHaveLength(1);
      
      // Second run should have fresh log
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      expect(pluginLoader.getExecutionLog()).toHaveLength(1);
    });
  });

  describe("executeSinglePlugin", () => {
    it("should execute a single plugin successfully", async () => {
      const plugin = createMockPlugin({
        processImage: vi.fn().mockImplementation(async (_path, result) => ({
          ...result,
          ocrText: "Modified by plugin",
        })),
      });
      
      const result = createMockAnalysisResult();
      const execResult = await pluginLoader.executeSinglePlugin(plugin, "/test/image.png", result);
      
      expect(execResult.success).toBe(true);
      expect(execResult.result?.ocrText).toBe("Modified by plugin");
      expect(execResult.pluginId).toBe(plugin.id);
    });

    it("should handle plugin exception and return error", async () => {
      const plugin = createMockPlugin({
        processImage: vi.fn().mockRejectedValue(new Error("Plugin failed")),
      });
      
      const result = createMockAnalysisResult();
      const execResult = await pluginLoader.executeSinglePlugin(plugin, "/test/image.png", result);
      
      expect(execResult.success).toBe(false);
      expect(execResult.error).toBeDefined();
      expect(execResult.error?.code).toBe("PLUGIN_EXECUTION_ERROR");
      expect(execResult.error?.message).toContain("Plugin failed");
      expect(execResult.error?.details?.pluginId).toBe(plugin.id);
    });

    it("should log exception to output channel", async () => {
      const plugin = createMockPlugin({
        id: "error-plugin",
        processImage: vi.fn().mockRejectedValue(new Error("Logged error")),
      });
      
      const result = createMockAnalysisResult();
      await pluginLoader.executeSinglePlugin(plugin, "/test/image.png", result);
      
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining("error-plugin threw exception")
      );
    });
  });

  describe("getExecutionLog", () => {
    it("should return copy of execution log", async () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      
      const log1 = pluginLoader.getExecutionLog();
      const log2 = pluginLoader.getExecutionLog();
      
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });

    it("should include duration in log entries", async () => {
      const plugin = createMockPlugin({
        processImage: vi.fn().mockImplementation(async (_path, result) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return result;
        }),
      });
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      
      const log = pluginLoader.getExecutionLog();
      expect(log[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("clearExecutionLog", () => {
    it("should clear the execution log", async () => {
      const plugin = createMockPlugin();
      pluginLoader.registerPlugin(plugin);
      
      const result = createMockAnalysisResult();
      await pluginLoader.executePlugins(result, [plugin.id], "/workspace");
      
      expect(pluginLoader.getExecutionLog()).toHaveLength(1);
      
      pluginLoader.clearExecutionLog();
      
      expect(pluginLoader.getExecutionLog()).toHaveLength(0);
    });
  });

  describe("getPluginsDirectory", () => {
    it("should return correct plugins directory path", () => {
      const dir = pluginLoader.getPluginsDirectory("/workspace/root");
      
      expect(dir).toBe("/workspace/root/.vscode/image-analysis/plugins");
    });
  });
});
