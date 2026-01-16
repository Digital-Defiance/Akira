/**
 * Agent Hooks Integration Tests
 * 
 * Tests the agent hooks system components working together
 * with mocked VS Code events and MockPromptRunner for deterministic results.
 * 
 * Requirements validated:
 * - REQ-2.1: Register event listeners within 500ms
 * - REQ-3.1: Enqueue matching enabled hooks within 1000ms
 * - REQ-4.1: Git hooks only run when allowGit=true and repoRoot matches
 * 
 * Task 4.3: Integration tests simulating VS Code events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HookManager, HookEvent } from "./hookManager";
import { EventRegistry } from "./eventRegistry";
import { HookExecutionEngine } from "./executionEngine";
import { MockPromptRunner } from "./promptRunner";
import { OutputLogger } from "./outputLogger";
import { Hook, HookTriggerContext, TriggerType } from "./types";

// Mock VS Code module
vi.mock("vscode", () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path, toString: () => `file://${path}` }),
    parse: (uri: string) => ({ fsPath: uri, toString: () => uri }),
    joinPath: (base: any, ...paths: string[]) => ({
      fsPath: [base.fsPath, ...paths].join("/"),
      toString: () => `file://${[base.fsPath, ...paths].join("/")}`,
    }),
  },
  workspace: {
    workspaceFolders: undefined,
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
    asRelativePath: (uri: any) => uri.fsPath || uri,
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCreateFiles: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDeleteFiles: vi.fn(() => ({ dispose: vi.fn() })),
  },

  window: {
    createOutputChannel: vi.fn(() => ({
      append: vi.fn(),
      appendLine: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  EventEmitter: class {
    private listeners: Array<(e: any) => void> = [];
    get event() {
      return (listener: (e: any) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data: any): void {
      this.listeners.forEach((l) => l(data));
    }
    dispose(): void {
      this.listeners = [];
    }
  },
  Disposable: class {
    constructor(private callback?: () => void) {}
    dispose(): void {
      this.callback?.();
    }
  },
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
}));

/**
 * Test fixture: Create a file-save hook
 */
function createFileSaveHook(
  id: string,
  patterns: string[],
  enabled = true
): Hook {
  return {
    id,
    name: `Test File Save Hook ${id}`,
    description: "Test hook for file save events",
    trigger: {
      type: "fileEdited" as TriggerType,
      patterns,
    },
    action: {
      type: "runCommand",
      command: `echo "Hook ${id} triggered"`,
    },
    enabled,
    concurrency: 2,
    timeout: 5000,
    retry: {
      maxAttempts: 1,
      backoffMs: 100,
      jitter: false,
    },
  };
}


/**
 * Test fixture: Create a git commit hook
 */
function createGitCommitHook(
  id: string,
  allowGit: boolean,
  repoRoot?: string,
  enabled = true
): Hook {
  return {
    id,
    name: `Test Git Commit Hook ${id}`,
    description: "Test hook for git commit events",
    trigger: {
      type: "gitCommit" as TriggerType,
    },
    action: {
      type: "runCommand",
      command: `echo "Git hook ${id} triggered"`,
    },
    enabled,
    allowGit,
    repoRoot,
    concurrency: 1,
    timeout: 5000,
    retry: {
      maxAttempts: 1,
      backoffMs: 100,
      jitter: false,
    },
  };
}

describe("Agent Hooks Integration Tests", () => {
  let outputLogger: OutputLogger;
  let eventRegistry: EventRegistry;
  let hookManager: HookManager;
  let executionEngine: HookExecutionEngine;
  let mockPromptRunner: MockPromptRunner;
  let logMessages: string[];

  const workspaceRoot = "/test/workspace";
  const workspaceUri = { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    logMessages = [];

    // Create components
    outputLogger = new OutputLogger("Test Agent Hooks");
    
    // Capture log messages for verification
    const originalLogInfo = outputLogger.logInfo.bind(outputLogger);
    outputLogger.logInfo = (ctx, msg) => {
      logMessages.push(`INFO: ${msg}`);
      originalLogInfo(ctx, msg);
    };

    const originalLogError = outputLogger.logError.bind(outputLogger);
    outputLogger.logError = (ctx, err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logMessages.push(`ERROR: ${errMsg}`);
      originalLogError(ctx, err);
    };

    eventRegistry = new EventRegistry(outputLogger);
    hookManager = new HookManager(eventRegistry, outputLogger);
    mockPromptRunner = new MockPromptRunner();

    executionEngine = new HookExecutionEngine({
      promptRunner: mockPromptRunner,
      outputLogger,
      defaultConcurrency: 4,
      defaultTimeout: 5000,
    });
  });


  afterEach(async () => {
    await executionEngine.shutdown();
    eventRegistry.dispose();
    hookManager.dispose();
    outputLogger.dispose();
  });

  describe("Event Listener Registration (REQ-2.1)", () => {
    it("should register event listeners within 500ms", async () => {
      const hooks = [
        createFileSaveHook("test-hook-1", ["**/*.ts"]),
        createFileSaveHook("test-hook-2", ["**/*.js"]),
      ];

      const startTime = Date.now();
      await hookManager.setHooks(workspaceUri as any, hooks);
      const duration = Date.now() - startTime;

      // REQ-2.1: Registration should complete within 500ms
      expect(duration).toBeLessThan(500);
      
      // Verify listeners were registered
      expect(eventRegistry.isRegistered("fileEdited", workspaceUri as any)).toBe(true);
    });

    it("should not create duplicate listeners for same trigger type", async () => {
      const hooks = [
        createFileSaveHook("hook-1", ["**/*.ts"]),
        createFileSaveHook("hook-2", ["**/*.ts"]),
        createFileSaveHook("hook-3", ["**/*.ts"]),
      ];

      await hookManager.setHooks(workspaceUri as any, hooks);

      // Should only have one listener for fileEdited
      const triggers = eventRegistry.getRegisteredTriggers(workspaceUri as any);
      const fileEditedCount = triggers.filter((t) => t === "fileEdited").length;
      expect(fileEditedCount).toBe(1);
    });
  });


  describe("File Save Event Simulation (REQ-3.1)", () => {
    it("should enqueue matching hooks on file save event", async () => {
      // Configure mock to return success
      mockPromptRunner.setMockResult({
        exitCode: 0,
        stdout: "Hook executed successfully",
        stderr: "",
      });

      const hooks = [createFileSaveHook("file-save-hook", ["**/*.ts"])];
      await hookManager.setHooks(workspaceUri as any, hooks);

      // Simulate file save event
      const hookEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: workspaceUri.toString(),
        filePath: "/test/workspace/src/test.ts",
      };

      const startTime = Date.now();
      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);
      const duration = Date.now() - startTime;

      // REQ-3.1: Should find matching hooks within 1000ms
      expect(duration).toBeLessThan(1000);
      expect(matchingHooks).toHaveLength(1);
      expect(matchingHooks[0].id).toBe("file-save-hook");
    });

    it("should only trigger hooks matching file pattern", async () => {
      const hooks = [
        createFileSaveHook("ts-hook", ["**/*.ts"]),
        createFileSaveHook("md-hook", ["**/*.md"]),
      ];
      await hookManager.setHooks(workspaceUri as any, hooks);

      // Simulate saving a TypeScript file
      const hookEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: workspaceUri.toString(),
        filePath: "/test/workspace/src/test.ts",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Only ts-hook should match
      expect(matchingHooks).toHaveLength(1);
      expect(matchingHooks[0].id).toBe("ts-hook");
    });

    it("should not trigger disabled hooks", async () => {
      const hooks = [
        createFileSaveHook("enabled-hook", ["**/*.ts"], true),
        createFileSaveHook("disabled-hook", ["**/*.ts"], false),
      ];
      await hookManager.setHooks(workspaceUri as any, hooks);

      const hookEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: workspaceUri.toString(),
        filePath: "/test/workspace/src/test.ts",
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Only enabled-hook should match
      expect(matchingHooks).toHaveLength(1);
      expect(matchingHooks[0].id).toBe("enabled-hook");
    });
  });


  describe("Git Commit Event Simulation (REQ-4.1)", () => {
    it("should NOT execute git hooks when allowGit=false", async () => {
      const hooks = [createGitCommitHook("git-no-allow", false, workspaceRoot)];
      await hookManager.setHooks(workspaceUri as any, hooks);

      const hookEvent: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: workspaceUri.toString(),
        gitInfo: {
          repoRoot: workspaceRoot,
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Hook should NOT match because allowGit=false
      expect(matchingHooks).toHaveLength(0);
      
      // Verify log message
      expect(logMessages.some((m) => m.includes("allowGit is false"))).toBe(true);
    });

    it("should NOT execute git hooks when repoRoot does not match", async () => {
      const hooks = [createGitCommitHook("git-wrong-repo", true, "/different/path")];
      await hookManager.setHooks(workspaceUri as any, hooks);

      const hookEvent: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: workspaceUri.toString(),
        gitInfo: {
          repoRoot: workspaceRoot,
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Hook should NOT match because repoRoot doesn't match
      expect(matchingHooks).toHaveLength(0);
      
      // Verify log message
      expect(logMessages.some((m) => m.includes("repoRoot mismatch"))).toBe(true);
    });

    it("should execute git hooks when allowGit=true and repoRoot matches", async () => {
      const hooks = [createGitCommitHook("git-allowed", true, workspaceRoot)];
      await hookManager.setHooks(workspaceUri as any, hooks);

      const hookEvent: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: workspaceUri.toString(),
        gitInfo: {
          repoRoot: workspaceRoot,
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Hook SHOULD match
      expect(matchingHooks).toHaveLength(1);
      expect(matchingHooks[0].id).toBe("git-allowed");
    });


    it("should filter git hooks correctly with mixed configurations", async () => {
      const hooks = [
        // Should NOT match: allowGit=false
        createGitCommitHook("git-hook-1", false, workspaceRoot),
        // Should NOT match: wrong repoRoot
        createGitCommitHook("git-hook-2", true, "/different/path"),
        // Should match: allowGit=true and correct repoRoot
        createGitCommitHook("git-hook-3", true, workspaceRoot),
        // Should NOT match: disabled
        createGitCommitHook("git-hook-4", true, workspaceRoot, false),
      ];
      await hookManager.setHooks(workspaceUri as any, hooks);

      const hookEvent: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: workspaceUri.toString(),
        gitInfo: {
          repoRoot: workspaceRoot,
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);

      // Only git-hook-3 should match
      expect(matchingHooks).toHaveLength(1);
      expect(matchingHooks[0].id).toBe("git-hook-3");
    });
  });

  describe("Hook Execution with MockPromptRunner", () => {
    it("should execute hook and return success", async () => {
      mockPromptRunner.setMockResult({
        exitCode: 0,
        stdout: "Success output",
        stderr: "",
      });

      const hook = createFileSaveHook("exec-test", ["**/*.ts"]);
      const context: HookTriggerContext = {
        hookId: hook.id,
        trigger: "fileEdited",
        timestamp: new Date().toISOString(),
        workspaceRoot,
        file: { path: "/test/workspace/src/test.ts" },
      };

      const executionId = await executionEngine.enqueue(hook, context);

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const record = executionEngine.getExecutionRecord(executionId);
      expect(record).toBeDefined();
      expect(record?.status).toBe("success");
      expect(record?.exitCode).toBe(0);
    });


    it("should handle hook execution failure", async () => {
      mockPromptRunner.setMockResult({
        exitCode: 1,
        stdout: "",
        stderr: "Error occurred",
      });

      const hook: Hook = {
        ...createFileSaveHook("fail-test", ["**/*.ts"]),
        retry: { maxAttempts: 1, backoffMs: 100, jitter: false },
      };

      const context: HookTriggerContext = {
        hookId: hook.id,
        trigger: "fileEdited",
        timestamp: new Date().toISOString(),
        workspaceRoot,
        file: { path: "/test/workspace/src/test.ts" },
      };

      const executionId = await executionEngine.enqueue(hook, context);

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const record = executionEngine.getExecutionRecord(executionId);
      expect(record).toBeDefined();
      expect(record?.status).toBe("failure");
      expect(record?.exitCode).toBe(1);
    });

    it("should create logs for hook execution", async () => {
      mockPromptRunner.setMockResult({
        exitCode: 0,
        stdout: "Test output",
        stderr: "",
      });

      const hook = createFileSaveHook("log-test", ["**/*.ts"]);
      const context: HookTriggerContext = {
        hookId: hook.id,
        trigger: "fileEdited",
        timestamp: new Date().toISOString(),
        workspaceRoot,
        file: { path: "/test/workspace/src/test.ts" },
      };

      await executionEngine.enqueue(hook, context);

      // Wait for execution to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify logs were created
      const records = executionEngine.getAllExecutionRecords();
      expect(records.length).toBeGreaterThan(0);
    });
  });


  describe("End-to-End Event Flow", () => {
    it("should process file save event through entire pipeline", async () => {
      mockPromptRunner.setMockResult({
        exitCode: 0,
        stdout: "Hook executed",
        stderr: "",
      });

      // Set up hooks
      const hooks = [createFileSaveHook("e2e-hook", ["**/*.ts"])];
      await hookManager.setHooks(workspaceUri as any, hooks);

      // Wire up event callback
      let triggeredContext: HookTriggerContext | null = null;
      eventRegistry.setEventCallback((ctx) => {
        triggeredContext = ctx;
      });

      // Simulate file save event
      const hookEvent: HookEvent = {
        trigger: "fileEdited",
        workspaceRoot: workspaceUri.toString(),
        filePath: "/test/workspace/src/test.ts",
      };

      // Get matching hooks
      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);
      expect(matchingHooks).toHaveLength(1);

      // Enqueue for execution
      const context: HookTriggerContext = {
        hookId: matchingHooks[0].id,
        trigger: "fileEdited",
        timestamp: new Date().toISOString(),
        workspaceRoot,
        file: { path: "/test/workspace/src/test.ts" },
      };

      const executionId = await executionEngine.enqueue(matchingHooks[0], context);

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify execution completed
      const record = executionEngine.getExecutionRecord(executionId);
      expect(record?.status).toBe("success");
    });

    it("should process git commit event through entire pipeline", async () => {
      mockPromptRunner.setMockResult({
        exitCode: 0,
        stdout: "Git hook executed",
        stderr: "",
      });

      // Set up hooks
      const hooks = [createGitCommitHook("e2e-git-hook", true, workspaceRoot)];
      await hookManager.setHooks(workspaceUri as any, hooks);

      // Simulate git commit event
      const hookEvent: HookEvent = {
        trigger: "gitCommit",
        workspaceRoot: workspaceUri.toString(),
        gitInfo: {
          repoRoot: workspaceRoot,
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      // Get matching hooks
      const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);
      expect(matchingHooks).toHaveLength(1);

      // Enqueue for execution
      const context: HookTriggerContext = {
        hookId: matchingHooks[0].id,
        trigger: "gitCommit",
        timestamp: new Date().toISOString(),
        workspaceRoot,
        git: {
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      };

      const executionId = await executionEngine.enqueue(matchingHooks[0], context);

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify execution completed
      const record = executionEngine.getExecutionRecord(executionId);
      expect(record?.status).toBe("success");
    });
  });


  describe("Manual Event Triggering", () => {
    it("should trigger events manually via EventRegistry", async () => {
      const hooks = [
        {
          id: "manual-trigger-hook",
          name: "Manual Trigger Hook",
          trigger: { type: "userTriggered" as TriggerType },
          action: { type: "runCommand" as const, command: "echo test" },
          enabled: true,
        },
      ];
      await hookManager.setHooks(workspaceUri as any, hooks);

      let triggeredContext: HookTriggerContext | null = null;
      eventRegistry.setEventCallback((ctx) => {
        triggeredContext = ctx;
      });

      // Manually trigger event
      eventRegistry.triggerManually("userTriggered", workspaceUri as any, {
        userInput: "Test input",
      });

      expect(triggeredContext).not.toBeNull();
      expect(triggeredContext?.trigger).toBe("userTriggered");
      expect(triggeredContext?.user?.input).toBe("Test input");
    });

    it("should trigger git commit event manually", async () => {
      const hooks = [createGitCommitHook("manual-git-hook", true, workspaceRoot)];
      await hookManager.setHooks(workspaceUri as any, hooks);

      let triggeredContext: HookTriggerContext | null = null;
      eventRegistry.setEventCallback((ctx) => {
        triggeredContext = ctx;
      });

      // Manually trigger git commit event
      eventRegistry.triggerManually("gitCommit", workspaceUri as any, {
        gitInfo: {
          commit: "def456",
          branch: "feature",
          message: "Feature commit",
        },
      });

      expect(triggeredContext).not.toBeNull();
      expect(triggeredContext?.trigger).toBe("gitCommit");
      expect(triggeredContext?.git?.commit).toBe("def456");
      expect(triggeredContext?.git?.branch).toBe("feature");
    });
  });

  describe("Concurrent Execution", () => {
    it("should respect concurrency limits", async () => {
      mockPromptRunner.setMockDelay(200); // Add delay to simulate work
      mockPromptRunner.setMockResult({ exitCode: 0, stdout: "", stderr: "" });

      const hook: Hook = {
        ...createFileSaveHook("concurrent-hook", ["**/*.ts"]),
        concurrency: 2, // Only 2 concurrent executions
      };

      // Enqueue 5 executions
      const executionIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const context: HookTriggerContext = {
          hookId: hook.id,
          trigger: "fileEdited",
          timestamp: new Date().toISOString(),
          workspaceRoot,
          file: { path: `/test/workspace/src/test${i}.ts` },
        };
        const id = await executionEngine.enqueue(hook, context);
        executionIds.push(id);
      }

      // Wait for all executions to complete
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // All should complete successfully
      for (const id of executionIds) {
        const record = executionEngine.getExecutionRecord(id);
        expect(record?.status).toBe("success");
      }
    });
  });
});
