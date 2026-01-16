/**
 * Unit tests for Config Loader
 *
 * Requirements validated:
 * - REQ-1.1: Load .akira/hooks.json within 2000ms
 * - REQ-1.2: Validate against schema, emit errors to output pane
 * - REQ-1.3: Persist normalized in-memory representation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ConfigLoader } from "./configLoader";
import { Hook, HookLoadResult } from "./types";

// Mock VS Code module
vi.mock("vscode", () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
      toString: () => [base.fsPath, ...paths].join("/"),
    }),
    file: (path: string) => ({
      fsPath: path,
      toString: () => path,
    }),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
      stat: vi.fn(),
    },
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    })),
  },
  RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
  EventEmitter: vi.fn().mockImplementation(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
}));

import * as vscode from "vscode";

/**
 * Mock OutputLogger for testing
 */
class MockOutputLogger {
  public logs: Array<{ type: string; data: unknown }> = [];

  logInfo(_ctx: unknown, message: string): void {
    this.logs.push({ type: "info", data: { message } });
  }

  logError(_ctx: unknown, error: Error | string): void {
    this.logs.push({
      type: "error",
      data: { error: error instanceof Error ? error.message : error },
    });
  }

  logExecution(record: unknown): void {
    this.logs.push({ type: "execution", data: record });
  }

  show(): void {}
  dispose(): void {}

  clear(): void {
    this.logs = [];
  }

  getErrorLogs(): string[] {
    return this.logs
      .filter((l) => l.type === "error")
      .map((l) => (l.data as { error: string }).error);
  }

  getInfoLogs(): string[] {
    return this.logs
      .filter((l) => l.type === "info")
      .map((l) => (l.data as { message: string }).message);
  }
}

/**
 * Create a valid hooks configuration
 */
function createValidConfig(hooks: Partial<Hook>[] = []): string {
  const defaultHook: Hook = {
    id: "test-hook",
    name: "Test Hook",
    trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
    action: { type: "runCommand", command: "echo test" },
  };

  const configHooks = hooks.length > 0 ? hooks : [defaultHook];

  return JSON.stringify({ hooks: configHooks });
}

describe("ConfigLoader", () => {
  let configLoader: ConfigLoader;
  let mockLogger: MockOutputLogger;
  const mockWorkspaceRoot = { fsPath: "/test/workspace", toString: () => "/test/workspace" };

  beforeEach(() => {
    mockLogger = new MockOutputLogger();
    configLoader = new ConfigLoader(mockLogger as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    configLoader.dispose();
    mockLogger.clear();
  });

  describe("REQ-1.1: Load within 2000ms time budget", () => {
    it("should load valid config within time budget", async () => {
      const validConfig = createValidConfig();

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: validConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(validConfig) as any
      );

      const startTime = Date.now();
      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
      expect(hooks.length).toBe(1);
    });

    it("should timeout and return previous config if load exceeds 2000ms", async () => {
      // First, load a valid config
      const validConfig = createValidConfig();
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: validConfig.length,
      } as any);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(validConfig) as any
      );

      await configLoader.loadHooks(mockWorkspaceRoot as any);

      // Now simulate a slow load that exceeds timeout
      vi.mocked(vscode.workspace.fs.readFile).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(Buffer.from(validConfig) as any), 3000);
          })
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      // Should return previous valid config
      expect(hooks.length).toBe(1);

      // Should log timeout error
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("timeout") || e.includes("2000"))).toBe(true);
    });

    it("should measure and log load duration", async () => {
      const validConfig = createValidConfig();

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: validConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(validConfig) as any
      );

      await configLoader.loadHooks(mockWorkspaceRoot as any);

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("Loaded") && l.includes("ms"))).toBe(true);
    });
  });

  describe("REQ-1.2: Schema validation", () => {
    it("should reject config with missing required fields", async () => {
      const invalidConfig = JSON.stringify({
        hooks: [{ id: "test" }], // Missing name, trigger, action
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Schema validation failed"))).toBe(true);
    });

    it("should reject config with invalid JSON", async () => {
      const invalidJson = "{ invalid json }";

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidJson.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidJson) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Invalid JSON"))).toBe(true);
    });

    it("should reject config with invalid hook ID format", async () => {
      const invalidConfig = JSON.stringify({
        hooks: [
          {
            id: "Invalid ID With Spaces", // Invalid - should be lowercase with dashes
            name: "Test Hook",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo test" },
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it("should reject config with invalid trigger type", async () => {
      const invalidConfig = JSON.stringify({
        hooks: [
          {
            id: "test-hook",
            name: "Test Hook",
            trigger: { type: "invalidTrigger" },
            action: { type: "runCommand", command: "echo test" },
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
    });

    it("should emit error event on validation failure", async () => {
      // Create a new ConfigLoader with a real EventEmitter for this test
      const { EventEmitter } = await import("vscode");
      
      // Create a mock that captures the fire calls
      let firedResult: HookLoadResult | null = null;
      const mockEventEmitter = {
        event: vi.fn(),
        fire: vi.fn((result: HookLoadResult) => {
          firedResult = result;
        }),
        dispose: vi.fn(),
      };
      
      // Mock the EventEmitter constructor
      vi.mocked(EventEmitter).mockImplementation(() => mockEventEmitter as any);
      
      const testLoader = new ConfigLoader(mockLogger as any);
      
      const invalidConfig = JSON.stringify({ hooks: [{ id: "test" }] });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidConfig) as any
      );

      await testLoader.loadHooks(mockWorkspaceRoot as any);

      // Verify fire was called with error result
      expect(mockEventEmitter.fire).toHaveBeenCalled();
      expect(firedResult).not.toBeNull();
      expect(firedResult!.success).toBe(false);
      expect(firedResult!.errors).toBeDefined();
      expect(firedResult!.errors!.length).toBeGreaterThan(0);
      
      testLoader.dispose();
    });

    it("should keep previous valid config on schema failure", async () => {
      // First load valid config
      const validConfig = createValidConfig();
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: validConfig.length,
      } as any);
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(validConfig) as any
      );

      const firstLoad = await configLoader.loadHooks(mockWorkspaceRoot as any);
      expect(firstLoad.length).toBe(1);

      // Now try to load invalid config
      const invalidConfig = JSON.stringify({ hooks: [{ id: "test" }] });
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidConfig) as any
      );

      const secondLoad = await configLoader.loadHooks(mockWorkspaceRoot as any);

      // Should return previous valid config
      expect(secondLoad.length).toBe(1);
      expect(secondLoad[0].id).toBe("test-hook");
    });
  });

  describe("REQ-1.3: Normalized in-memory representation", () => {
    it("should normalize hooks with default values", async () => {
      const minimalConfig = JSON.stringify({
        hooks: [
          {
            id: "minimal-hook",
            name: "Minimal Hook",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo test" },
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: minimalConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(minimalConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks.length).toBe(1);
      const hook = hooks[0];

      // Check defaults are applied
      expect(hook.enabled).toBe(true);
      expect(hook.concurrency).toBe(4);
      expect(hook.timeout).toBe(30000);
      expect(hook.retry).toBeDefined();
      expect(hook.retry!.maxAttempts).toBe(3);
      expect(hook.retry!.backoffMs).toBe(1000);
      expect(hook.retry!.jitter).toBe(true);
    });

    it("should preserve explicitly set values", async () => {
      const customConfig = JSON.stringify({
        hooks: [
          {
            id: "custom-hook",
            name: "Custom Hook",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo test" },
            enabled: false,
            concurrency: 2,
            timeout: 10000,
            retry: {
              maxAttempts: 5,
              backoffMs: 500,
              jitter: false,
            },
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: customConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(customConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks.length).toBe(1);
      const hook = hooks[0];

      expect(hook.enabled).toBe(false);
      expect(hook.concurrency).toBe(2);
      expect(hook.timeout).toBe(10000);
      expect(hook.retry!.maxAttempts).toBe(5);
      expect(hook.retry!.backoffMs).toBe(500);
      expect(hook.retry!.jitter).toBe(false);
    });

    it("should reject duplicate hook IDs", async () => {
      const duplicateConfig = JSON.stringify({
        hooks: [
          {
            id: "duplicate-id",
            name: "Hook 1",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo 1" },
          },
          {
            id: "duplicate-id",
            name: "Hook 2",
            trigger: { type: "fileCreated", patterns: ["**/*.js"] },
            action: { type: "runCommand", command: "echo 2" },
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: duplicateConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(duplicateConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Duplicate hook ID"))).toBe(true);
    });
  });

  describe("Invalid regex pattern detection", () => {
    it("should reject hooks with invalid secret patterns", async () => {
      const invalidPatternConfig = JSON.stringify({
        hooks: [
          {
            id: "invalid-pattern-hook",
            name: "Invalid Pattern Hook",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo test" },
            secretPatterns: ["[invalid(regex"],
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: invalidPatternConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(invalidPatternConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Invalid secret patterns"))).toBe(true);
    });

    it("should accept hooks with valid secret patterns", async () => {
      const validPatternConfig = JSON.stringify({
        hooks: [
          {
            id: "valid-pattern-hook",
            name: "Valid Pattern Hook",
            trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
            action: { type: "runCommand", command: "echo test" },
            secretPatterns: ["password=\\w+", "api_key_[a-z0-9]+"],
          },
        ],
      });

      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: validPatternConfig.length,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from(validPatternConfig) as any
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks.length).toBe(1);
      expect(hooks[0].secretPatterns).toEqual(["password=\\w+", "api_key_[a-z0-9]+"]);
    });
  });

  describe("File handling", () => {
    it("should return empty array when config file does not exist", async () => {
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
        new Error("File not found")
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      // Should not log error for missing file
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.length).toBe(0);
    });

    it("should handle file read errors gracefully", async () => {
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 0,
        size: 100,
      } as any);

      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(
        new Error("Permission denied")
      );

      const hooks = await configLoader.loadHooks(mockWorkspaceRoot as any);

      expect(hooks).toEqual([]);
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Permission denied"))).toBe(true);
    });
  });
});
