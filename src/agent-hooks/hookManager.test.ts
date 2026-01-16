/**
 * Unit tests for Hook Manager
 *
 * Requirements validated:
 * - REQ-1.3: Persist normalized in-memory representation
 * - REQ-2.3: Mark affected hooks as disabled on registration failure
 * - REQ-3.1: Enqueue matching enabled hooks within 1000ms
 * - REQ-4.1: Filter git hooks by allowGit and repoRoot
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { HookManager, HookEvent } from "./hookManager";
import { Hook, HookRuntime, TriggerType } from "./types";

// Mock VS Code module
vi.mock("vscode", () => ({
  Uri: {
    file: (path: string) => ({
      fsPath: path,
      toString: () => path,
    }),
  },
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
 * Mock EventRegistry for testing
 */
class MockEventRegistry {
  public registeredTriggers: Array<{ trigger: TriggerType; hookId: string }> = [];
  public unregisteredWorkspaces: string[] = [];

  async registerListeners(
    triggers: Array<{ trigger: TriggerType; hookId: string }>,
    _workspaceRoot: vscode.Uri
  ): Promise<void> {
    this.registeredTriggers.push(...triggers);
  }

  unregisterListeners(workspaceRoot: vscode.Uri): void {
    this.unregisteredWorkspaces.push(workspaceRoot.toString());
  }

  clear(): void {
    this.registeredTriggers = [];
    this.unregisteredWorkspaces = [];
  }
}

/**
 * Create a test hook with defaults
 */
function createTestHook(overrides: Partial<Hook> = {}): Hook {
  return {
    id: "test-hook",
    name: "Test Hook",
    trigger: { type: "fileEdited", patterns: ["**/*.ts"] },
    action: { type: "runCommand", command: "echo test" },
    ...overrides,
  };
}

describe("HookManager", () => {
  let hookManager: HookManager;
  let mockLogger: MockOutputLogger;
  let mockEventRegistry: MockEventRegistry;
  const mockWorkspaceRoot = vscode.Uri.file("/test/workspace");

  beforeEach(() => {
    mockLogger = new MockOutputLogger();
    mockEventRegistry = new MockEventRegistry();
    hookManager = new HookManager(mockEventRegistry as any, mockLogger as any);
  });

  afterEach(() => {
    hookManager.dispose();
    mockLogger.clear();
    mockEventRegistry.clear();
  });

  describe("REQ-1.3: Normalized in-memory representation", () => {
    it("should normalize hooks with default values when setting hooks", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1" }),
      ];

      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const storedHook = hookManager.getHook("hook-1", mockWorkspaceRoot.toString());
      expect(storedHook).toBeDefined();
      expect(storedHook!.enabled).toBe(true);
      expect(storedHook!.concurrency).toBe(4);
      expect(storedHook!.timeout).toBe(30000);
      expect(storedHook!.retry.maxAttempts).toBe(3);
      expect(storedHook!.retry.backoffMs).toBe(1000);
      expect(storedHook!.retry.jitter).toBe(true);
    });

    it("should preserve explicitly set values", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "hook-1",
          enabled: false,
          concurrency: 2,
          timeout: 10000,
          retry: { maxAttempts: 5, backoffMs: 500, jitter: false },
        }),
      ];

      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const storedHook = hookManager.getHook("hook-1", mockWorkspaceRoot.toString());
      expect(storedHook!.enabled).toBe(false);
      expect(storedHook!.concurrency).toBe(2);
      expect(storedHook!.timeout).toBe(10000);
      expect(storedHook!.retry.maxAttempts).toBe(5);
      expect(storedHook!.retry.backoffMs).toBe(500);
      expect(storedHook!.retry.jitter).toBe(false);
    });

    it("should skip duplicate hook IDs and log error", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "duplicate-id", name: "Hook 1" }),
        createTestHook({ id: "duplicate-id", name: "Hook 2" }),
      ];

      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const allHooks = hookManager.getHooks(mockWorkspaceRoot.toString());
      expect(allHooks.length).toBe(1);

      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Duplicate hook ID"))).toBe(true);
    });

    it("should store hooks per workspace", async () => {
      const workspace1 = vscode.Uri.file("/workspace1");
      const workspace2 = vscode.Uri.file("/workspace2");

      await hookManager.setHooks(workspace1, [createTestHook({ id: "hook-1" })]);
      await hookManager.setHooks(workspace2, [createTestHook({ id: "hook-2" })]);

      const hooks1 = hookManager.getHooks(workspace1.toString());
      const hooks2 = hookManager.getHooks(workspace2.toString());

      expect(hooks1.length).toBe(1);
      expect(hooks1[0].id).toBe("hook-1");
      expect(hooks2.length).toBe(1);
      expect(hooks2[0].id).toBe("hook-2");
    });
  });

  describe("REQ-2.3: Mark hooks as disabled", () => {
    it("should disable a hook with reason", async () => {
      const hooks: Hook[] = [createTestHook({ id: "hook-1" })];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      hookManager.disableHook("hook-1", mockWorkspaceRoot.toString(), "Registration failed");

      const hook = hookManager.getHook("hook-1", mockWorkspaceRoot.toString());
      expect(hook!.enabled).toBe(false);
      expect(hook!.disabledReason).toBe("Registration failed");
    });

    it("should log when hook is disabled", async () => {
      const hooks: Hook[] = [createTestHook({ id: "hook-1" })];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      hookManager.disableHook("hook-1", mockWorkspaceRoot.toString(), "Test reason");

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("disabled") && l.includes("Test reason"))).toBe(true);
    });

    it("should enable a previously disabled hook", async () => {
      const hooks: Hook[] = [createTestHook({ id: "hook-1", enabled: false })];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      hookManager.enableHook("hook-1", mockWorkspaceRoot.toString());

      const hook = hookManager.getHook("hook-1", mockWorkspaceRoot.toString());
      expect(hook!.enabled).toBe(true);
      expect(hook!.disabledReason).toBeUndefined();
    });

    it("should disable hook across all workspaces when workspace not specified", async () => {
      const workspace1 = vscode.Uri.file("/workspace1");
      const workspace2 = vscode.Uri.file("/workspace2");

      await hookManager.setHooks(workspace1, [createTestHook({ id: "shared-hook" })]);
      await hookManager.setHooks(workspace2, [createTestHook({ id: "shared-hook" })]);

      hookManager.disableHook("shared-hook", undefined, "Global disable");

      const hook1 = hookManager.getHook("shared-hook", workspace1.toString());
      const hook2 = hookManager.getHook("shared-hook", workspace2.toString());

      expect(hook1!.enabled).toBe(false);
      expect(hook2!.enabled).toBe(false);
    });
  });

  describe("REQ-3.1: Get enabled hooks for event", () => {
    it("should return only enabled hooks matching trigger type", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1", trigger: { type: "fileEdited", patterns: ["**/*.ts"] } }),
        createTestHook({ id: "hook-2", trigger: { type: "fileCreated", patterns: ["**/*.ts"] } }),
        createTestHook({ id: "hook-3", trigger: { type: "fileEdited", patterns: ["**/*.ts"] }, enabled: false }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
      expect(matchingHooks[0].id).toBe("hook-1");
    });

    it("should filter by file pattern when filePath is provided", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "ts-hook", trigger: { type: "fileEdited", patterns: ["**/*.ts"] } }),
        createTestHook({ id: "js-hook", trigger: { type: "fileEdited", patterns: ["**/*.js"] } }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "src/test.ts",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
      expect(matchingHooks[0].id).toBe("ts-hook");
    });

    it("should return empty array for non-existent workspace", () => {
      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: "/non/existent",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks).toEqual([]);
    });

    it("should match hooks without patterns to any file", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "all-files-hook", trigger: { type: "fileEdited" } }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "any/file/path.xyz",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
    });
  });

  describe("REQ-4.1: Git hook filtering", () => {
    it("should only return git hooks with allowGit=true", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "git-allowed",
          trigger: { type: "gitCommit" },
          allowGit: true,
          repoRoot: "/test/workspace",
        }),
        createTestHook({
          id: "git-not-allowed",
          trigger: { type: "gitCommit" },
          allowGit: false,
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: mockWorkspaceRoot.toString(),
        gitInfo: { repoRoot: "/test/workspace" },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
      expect(matchingHooks[0].id).toBe("git-allowed");
    });

    it("should filter git hooks by repoRoot match", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "repo1-hook",
          trigger: { type: "gitCommit" },
          allowGit: true,
          repoRoot: "/repo1",
        }),
        createTestHook({
          id: "repo2-hook",
          trigger: { type: "gitCommit" },
          allowGit: true,
          repoRoot: "/repo2",
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: mockWorkspaceRoot.toString(),
        gitInfo: { repoRoot: "/repo1" },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
      expect(matchingHooks[0].id).toBe("repo1-hook");
    });

    it("should log when skipping git hook due to allowGit=false", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "git-not-allowed",
          trigger: { type: "gitCommit" },
          allowGit: false,
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: mockWorkspaceRoot.toString(),
        gitInfo: { repoRoot: "/test/workspace" },
      };

      hookManager.getEnabledHooksForEvent(event);

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("allowGit is false"))).toBe(true);
    });

    it("should log when skipping git hook due to repoRoot mismatch", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "wrong-repo-hook",
          trigger: { type: "gitCommit" },
          allowGit: true,
          repoRoot: "/different/repo",
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: mockWorkspaceRoot.toString(),
        gitInfo: { repoRoot: "/test/workspace" },
      };

      hookManager.getEnabledHooksForEvent(event);

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("repoRoot mismatch"))).toBe(true);
    });

    it("should allow git hooks without repoRoot to match any repo", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "any-repo-hook",
          trigger: { type: "gitCommit" },
          allowGit: true,
          // No repoRoot specified
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: mockWorkspaceRoot.toString(),
        gitInfo: { repoRoot: "/any/repo" },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);

      expect(matchingHooks.length).toBe(1);
    });
  });

  describe("Event Registry integration", () => {
    it("should register distinct triggers with EventRegistry", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1", trigger: { type: "fileEdited", patterns: ["**/*.ts"] } }),
        createTestHook({ id: "hook-2", trigger: { type: "fileEdited", patterns: ["**/*.js"] } }),
        createTestHook({ id: "hook-3", trigger: { type: "fileCreated", patterns: ["**/*.ts"] } }),
      ];

      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      // Should register fileEdited twice (for both hooks) and fileCreated once
      const fileEditedTriggers = mockEventRegistry.registeredTriggers.filter(
        (t) => t.trigger === "fileEdited"
      );
      const fileCreatedTriggers = mockEventRegistry.registeredTriggers.filter(
        (t) => t.trigger === "fileCreated"
      );

      expect(fileEditedTriggers.length).toBe(2);
      expect(fileCreatedTriggers.length).toBe(1);
    });

    it("should not register disabled hooks", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "enabled-hook", enabled: true }),
        createTestHook({ id: "disabled-hook", enabled: false }),
      ];

      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const registeredHookIds = mockEventRegistry.registeredTriggers.map((t) => t.hookId);
      expect(registeredHookIds).toContain("enabled-hook");
      expect(registeredHookIds).not.toContain("disabled-hook");
    });

    it("should unregister listeners when clearing hooks", async () => {
      const hooks: Hook[] = [createTestHook({ id: "hook-1" })];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      hookManager.clearHooks(mockWorkspaceRoot);

      expect(mockEventRegistry.unregisteredWorkspaces).toContain(mockWorkspaceRoot.toString());
    });
  });

  describe("Hook retrieval methods", () => {
    it("should get all hooks for a workspace", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1" }),
        createTestHook({ id: "hook-2" }),
        createTestHook({ id: "hook-3", enabled: false }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const allHooks = hookManager.getHooks(mockWorkspaceRoot.toString());

      expect(allHooks.length).toBe(3);
    });

    it("should get only enabled hooks for a workspace", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1", enabled: true }),
        createTestHook({ id: "hook-2", enabled: true }),
        createTestHook({ id: "hook-3", enabled: false }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const enabledHooks = hookManager.getEnabledHooks(mockWorkspaceRoot.toString());

      expect(enabledHooks.length).toBe(2);
      expect(enabledHooks.every((h) => h.enabled)).toBe(true);
    });

    it("should return empty array for non-existent workspace", () => {
      const hooks = hookManager.getHooks("/non/existent");
      expect(hooks).toEqual([]);
    });

    it("should return undefined for non-existent hook", async () => {
      const hooks: Hook[] = [createTestHook({ id: "hook-1" })];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const hook = hookManager.getHook("non-existent", mockWorkspaceRoot.toString());
      expect(hook).toBeUndefined();
    });
  });

  describe("Pattern matching", () => {
    it("should match glob patterns with wildcards", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1", trigger: { type: "fileEdited", patterns: ["src/**/*.ts"] } }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "src/components/Button.ts",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);
      expect(matchingHooks.length).toBe(1);
    });

    it("should not match files outside pattern", async () => {
      const hooks: Hook[] = [
        createTestHook({ id: "hook-1", trigger: { type: "fileEdited", patterns: ["src/**/*.ts"] } }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const event: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "test/Button.ts",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(event);
      expect(matchingHooks.length).toBe(0);
    });

    it("should match multiple patterns (OR logic)", async () => {
      const hooks: Hook[] = [
        createTestHook({
          id: "hook-1",
          trigger: { type: "fileEdited", patterns: ["**/*.ts", "**/*.tsx"] },
        }),
      ];
      await hookManager.setHooks(mockWorkspaceRoot, hooks);

      const tsEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "src/file.ts",
      };

      const tsxEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: mockWorkspaceRoot.toString(),
        filePath: "src/file.tsx",
      };

      expect(hookManager.getEnabledHooksForEvent(tsEvent).length).toBe(1);
      expect(hookManager.getEnabledHooksForEvent(tsxEvent).length).toBe(1);
    });
  });
});
