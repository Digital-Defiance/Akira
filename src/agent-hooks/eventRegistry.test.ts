/**
 * Unit tests for Event Registry
 *
 * Requirements validated:
 * - REQ-2.1: Register event listeners within 500ms
 * - REQ-2.2: No duplicate callbacks for same trigger/workspace
 * - REQ-2.3: Log failures and mark affected hooks as disabled
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { EventRegistry, EventCallback, RegistrationFailureCallback } from "./eventRegistry";
import { TriggerType, HookTriggerContext } from "./types";

// Mock VS Code module
vi.mock("vscode", () => {
  const mockDisposable = { dispose: vi.fn() };

  return {
    Uri: {
      file: (path: string) => ({
        fsPath: path,
        toString: () => path,
      }),
    },
    workspace: {
      onDidSaveTextDocument: vi.fn(() => mockDisposable),
      onDidCreateFiles: vi.fn(() => mockDisposable),
      onDidDeleteFiles: vi.fn(() => mockDisposable),
      asRelativePath: vi.fn((uri: { fsPath: string }) => uri.fsPath),
    },
    Disposable: vi.fn().mockImplementation(() => mockDisposable),
  };
});

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

describe("EventRegistry", () => {
  let eventRegistry: EventRegistry;
  let mockLogger: MockOutputLogger;
  const mockWorkspaceRoot = vscode.Uri.file("/test/workspace");

  beforeEach(() => {
    mockLogger = new MockOutputLogger();
    eventRegistry = new EventRegistry(mockLogger as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    eventRegistry.dispose();
    mockLogger.clear();
  });

  describe("REQ-2.1: Register listeners within 500ms", () => {
    it("should register listeners within time budget", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-2" },
      ];

      const startTime = Date.now();
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it("should log registration completion time", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("registration completed") && l.includes("ms"))).toBe(true);
    });

    it("should register multiple trigger types efficiently", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-2" },
        { trigger: "fileDeleted" as TriggerType, hookId: "hook-3" },
        { trigger: "gitCommit" as TriggerType, hookId: "hook-4" },
        { trigger: "promptSubmit" as TriggerType, hookId: "hook-5" },
      ];

      const startTime = Date.now();
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(true);
      expect(eventRegistry.isRegistered("fileCreated", mockWorkspaceRoot)).toBe(true);
      expect(eventRegistry.isRegistered("fileDeleted", mockWorkspaceRoot)).toBe(true);
    });
  });

  describe("REQ-2.2: No duplicate callbacks", () => {
    it("should not create duplicate registrations for same trigger and workspace", async () => {
      const triggers1 = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      const triggers2 = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-2" },
      ];

      await eventRegistry.registerListeners(triggers1, mockWorkspaceRoot);
      await eventRegistry.registerListeners(triggers2, mockWorkspaceRoot);

      // Should only have one registration for fileEdited
      const registeredTriggers = eventRegistry.getRegisteredTriggers(mockWorkspaceRoot);
      const fileEditedCount = registeredTriggers.filter((t) => t === "fileEdited").length;
      expect(fileEditedCount).toBe(1);

      // Should log that trigger was already registered
      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("already registered"))).toBe(true);
    });

    it("should allow same trigger for different workspaces", async () => {
      const workspace1 = vscode.Uri.file("/workspace1");
      const workspace2 = vscode.Uri.file("/workspace2");

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, workspace1);
      await eventRegistry.registerListeners(triggers, workspace2);

      expect(eventRegistry.isRegistered("fileEdited", workspace1)).toBe(true);
      expect(eventRegistry.isRegistered("fileEdited", workspace2)).toBe(true);
    });

    it("should track multiple hooks per trigger", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileEdited" as TriggerType, hookId: "hook-2" },
        { trigger: "fileEdited" as TriggerType, hookId: "hook-3" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Should only create one VS Code listener
      const registeredTriggers = eventRegistry.getRegisteredTriggers(mockWorkspaceRoot);
      expect(registeredTriggers.length).toBe(1);
      expect(registeredTriggers[0]).toBe("fileEdited");
    });

    it("should deduplicate triggers when registering batch", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1", patterns: ["**/*.ts"] },
        { trigger: "fileEdited" as TriggerType, hookId: "hook-2", patterns: ["**/*.js"] },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-3", patterns: ["**/*.ts"] },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      const registeredTriggers = eventRegistry.getRegisteredTriggers(mockWorkspaceRoot);
      expect(registeredTriggers.length).toBe(2);
      expect(registeredTriggers).toContain("fileEdited");
      expect(registeredTriggers).toContain("fileCreated");
    });
  });

  describe("REQ-2.3: Log failures and mark hooks disabled", () => {
    it("should call failure callback on registration error", async () => {
      // Mock an error during registration
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation(() => {
        throw new Error("Registration failed");
      });

      let failedTrigger: TriggerType | null = null;
      let failedHookIds: string[] = [];
      let failedError: Error | null = null;

      const failureCallback: RegistrationFailureCallback = (trigger, hookIds, error) => {
        failedTrigger = trigger;
        failedHookIds = hookIds;
        failedError = error;
      };

      eventRegistry.setFailureCallback(failureCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      expect(failedTrigger).toBe("fileEdited");
      expect(failedHookIds).toContain("hook-1");
      expect(failedError).not.toBeNull();
      expect(failedError!.message).toBe("Registration failed");
    });

    it("should log error with error code on registration failure", async () => {
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation(() => {
        throw new Error("VS Code API error");
      });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Failed to register listener"))).toBe(true);
      expect(errorLogs.some((e) => e.includes("fileEdited"))).toBe(true);
    });

    it("should continue registering other triggers after one fails", async () => {
      // First trigger fails
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation(() => {
        throw new Error("Registration failed");
      });

      // Second trigger succeeds
      vi.mocked(vscode.workspace.onDidCreateFiles).mockReturnValue({ dispose: vi.fn() });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-2" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // fileEdited should not be registered (failed)
      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(false);
      // fileCreated should be registered (succeeded)
      expect(eventRegistry.isRegistered("fileCreated", mockWorkspaceRoot)).toBe(true);
    });

    it("should include all affected hook IDs in failure callback", async () => {
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation(() => {
        throw new Error("Registration failed");
      });

      let failedHookIds: string[] = [];
      eventRegistry.setFailureCallback((_trigger, hookIds, _error) => {
        failedHookIds = hookIds;
      });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileEdited" as TriggerType, hookId: "hook-2" },
        { trigger: "fileEdited" as TriggerType, hookId: "hook-3" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      expect(failedHookIds).toContain("hook-1");
      expect(failedHookIds).toContain("hook-2");
      expect(failedHookIds).toContain("hook-3");
    });
  });

  describe("Event callback dispatch", () => {
    it("should dispatch events to registered callback", async () => {
      // Reset mock to return proper disposable
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        // Simulate a file save event
        setTimeout(() => {
          callback({
            uri: { fsPath: "/test/workspace/file.ts" },
          } as any);
        }, 10);
        return { dispose: vi.fn() };
      });

      let receivedContext: HookTriggerContext | null = null;
      const eventCallback: EventCallback = (context) => {
        receivedContext = context;
      };

      eventRegistry.setEventCallback(eventCallback);
      // Disable debouncing for this test to get immediate dispatch
      eventRegistry.setDebounceConfig({ enabled: false });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1", patterns: ["**/*.ts"] },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Wait for the simulated event
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.trigger).toBe("fileEdited");
    });

    it("should support manual trigger for programmatic events", () => {
      let receivedContext: HookTriggerContext | null = null;
      const eventCallback: EventCallback = (context) => {
        receivedContext = context;
      };

      eventRegistry.setEventCallback(eventCallback);

      eventRegistry.triggerManually("userTriggered", mockWorkspaceRoot, {
        userInput: "test input",
      });

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.trigger).toBe("userTriggered");
      expect(receivedContext!.user?.input).toBe("test input");
    });

    it("should support git commit manual trigger with git info", () => {
      let receivedContext: HookTriggerContext | null = null;
      const eventCallback: EventCallback = (context) => {
        receivedContext = context;
      };

      eventRegistry.setEventCallback(eventCallback);

      eventRegistry.triggerManually("gitCommit", mockWorkspaceRoot, {
        gitInfo: {
          commit: "abc123",
          branch: "main",
          message: "Test commit",
        },
      });

      expect(receivedContext).not.toBeNull();
      expect(receivedContext!.trigger).toBe("gitCommit");
      expect(receivedContext!.git?.commit).toBe("abc123");
      expect(receivedContext!.git?.branch).toBe("main");
      expect(receivedContext!.git?.message).toBe("Test commit");
    });
  });

  describe("Unregistration", () => {
    it("should unregister all listeners for a workspace", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-2" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(true);
      expect(eventRegistry.isRegistered("fileCreated", mockWorkspaceRoot)).toBe(true);

      eventRegistry.unregisterListeners(mockWorkspaceRoot);

      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(false);
      expect(eventRegistry.isRegistered("fileCreated", mockWorkspaceRoot)).toBe(false);
    });

    it("should log unregistration", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);
      eventRegistry.unregisterListeners(mockWorkspaceRoot);

      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("Unregistered"))).toBe(true);
    });

    it("should handle unregistering non-existent workspace gracefully", () => {
      const nonExistentWorkspace = vscode.Uri.file("/non/existent");

      // Should not throw
      expect(() => {
        eventRegistry.unregisterListeners(nonExistentWorkspace);
      }).not.toThrow();
    });
  });

  describe("isRegistered", () => {
    it("should return true for registered triggers", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(true);
    });

    it("should return false for unregistered triggers", () => {
      expect(eventRegistry.isRegistered("fileEdited", mockWorkspaceRoot)).toBe(false);
    });

    it("should return false for different workspace", async () => {
      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      const otherWorkspace = vscode.Uri.file("/other/workspace");
      expect(eventRegistry.isRegistered("fileEdited", otherWorkspace)).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should dispose all registrations", async () => {
      const workspace1 = vscode.Uri.file("/workspace1");
      const workspace2 = vscode.Uri.file("/workspace2");

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, workspace1);
      await eventRegistry.registerListeners(triggers, workspace2);

      eventRegistry.dispose();

      expect(eventRegistry.isRegistered("fileEdited", workspace1)).toBe(false);
      expect(eventRegistry.isRegistered("fileEdited", workspace2)).toBe(false);
    });
  });

  describe("Unknown trigger types", () => {
    it("should throw error for unknown trigger type", async () => {
      const triggers = [
        { trigger: "unknownTrigger" as TriggerType, hookId: "hook-1" },
      ];

      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Should log error
      const errorLogs = mockLogger.getErrorLogs();
      expect(errorLogs.some((e) => e.includes("Unknown trigger type"))).toBe(true);
    });
  });

  describe("Debounce functionality", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should have debounce enabled by default with 500ms window", () => {
      const config = eventRegistry.getDebounceConfig();
      expect(config.enabled).toBe(true);
      expect(config.windowMs).toBe(500);
    });

    it("should allow setting debounce configuration", () => {
      eventRegistry.setDebounceConfig({ enabled: false, windowMs: 1000 });
      
      const config = eventRegistry.getDebounceConfig();
      expect(config.enabled).toBe(false);
      expect(config.windowMs).toBe(1000);
    });

    it("should allow partial debounce configuration updates", () => {
      eventRegistry.setDebounceConfig({ windowMs: 250 });
      
      const config = eventRegistry.getDebounceConfig();
      expect(config.enabled).toBe(true); // Default unchanged
      expect(config.windowMs).toBe(250);
    });

    it("should coalesce rapid file events within debounce window", async () => {
      let dispatchCount = 0;
      let lastContext: HookTriggerContext | null = null;
      
      // Capture the callback that will be passed to onDidSaveTextDocument
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = (context) => {
        dispatchCount++;
        lastContext = context;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Simulate rapid file saves (4 saves within 500ms window)
      const mockDoc = { uri: { fsPath: "/test/workspace/file.ts" } };
      
      // Time 0ms: First save
      saveCallback!(mockDoc);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Time 100ms: Second save
      vi.advanceTimersByTime(100);
      saveCallback!(mockDoc);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Time 200ms: Third save
      vi.advanceTimersByTime(100);
      saveCallback!(mockDoc);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Time 300ms: Fourth save
      vi.advanceTimersByTime(100);
      saveCallback!(mockDoc);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // No dispatch yet
      expect(dispatchCount).toBe(0);
      
      // Time 800ms: Debounce window expires (500ms after last save at 300ms)
      vi.advanceTimersByTime(500);
      
      // Should have dispatched exactly once
      expect(dispatchCount).toBe(1);
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
      expect(lastContext?.trigger).toBe("fileEdited");
      expect(lastContext?.file?.path).toBe("/test/workspace/file.ts");
    });

    it("should debounce different files independently", async () => {
      const dispatchedFiles: string[] = [];
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = (context) => {
        if (context.file?.path) {
          dispatchedFiles.push(context.file.path);
        }
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Time 0ms: Save file A
      saveCallback!({ uri: { fsPath: "/test/workspace/fileA.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Time 100ms: Save file B
      vi.advanceTimersByTime(100);
      saveCallback!({ uri: { fsPath: "/test/workspace/fileB.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(2);
      
      // Time 200ms: Save file A again (resets A's timer)
      vi.advanceTimersByTime(100);
      saveCallback!({ uri: { fsPath: "/test/workspace/fileA.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(2);
      
      // Time 600ms: File B's debounce expires (500ms after 100ms)
      vi.advanceTimersByTime(400);
      expect(dispatchedFiles).toContain("/test/workspace/fileB.ts");
      expect(dispatchedFiles).not.toContain("/test/workspace/fileA.ts");
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Time 700ms: File A's debounce expires (500ms after 200ms)
      vi.advanceTimersByTime(100);
      expect(dispatchedFiles).toContain("/test/workspace/fileA.ts");
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
      
      // Total: 2 dispatches (one for each file)
      expect(dispatchedFiles.length).toBe(2);
    });

    it("should dispatch immediately when debounce is disabled", async () => {
      let dispatchCount = 0;
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);
      
      // Disable debouncing
      eventRegistry.setDebounceConfig({ enabled: false });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Simulate rapid file saves
      const mockDoc = { uri: { fsPath: "/test/workspace/file.ts" } };
      
      saveCallback!(mockDoc);
      expect(dispatchCount).toBe(1);
      
      saveCallback!(mockDoc);
      expect(dispatchCount).toBe(2);
      
      saveCallback!(mockDoc);
      expect(dispatchCount).toBe(3);
      
      // No pending debounces
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
    });

    it("should use custom debounce window", async () => {
      let dispatchCount = 0;
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);
      
      // Set custom debounce window of 200ms
      eventRegistry.setDebounceConfig({ windowMs: 200 });

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      const mockDoc = { uri: { fsPath: "/test/workspace/file.ts" } };
      
      // Time 0ms: First save
      saveCallback!(mockDoc);
      expect(dispatchCount).toBe(0);
      
      // Time 150ms: Still within window
      vi.advanceTimersByTime(150);
      expect(dispatchCount).toBe(0);
      
      // Time 200ms: Window expires
      vi.advanceTimersByTime(50);
      expect(dispatchCount).toBe(1);
    });

    it("should clear pending debounces on clearPendingDebounces()", async () => {
      let dispatchCount = 0;
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Trigger some events
      saveCallback!({ uri: { fsPath: "/test/workspace/file1.ts" } });
      saveCallback!({ uri: { fsPath: "/test/workspace/file2.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(2);
      
      // Clear pending debounces
      eventRegistry.clearPendingDebounces();
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
      
      // Advance time past debounce window
      vi.advanceTimersByTime(1000);
      
      // No dispatches should have occurred
      expect(dispatchCount).toBe(0);
    });

    it("should clear pending debounces on unregisterListeners()", async () => {
      let dispatchCount = 0;
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Trigger an event
      saveCallback!({ uri: { fsPath: "/test/workspace/file.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Unregister listeners
      eventRegistry.unregisterListeners(mockWorkspaceRoot);
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
      
      // Advance time past debounce window
      vi.advanceTimersByTime(1000);
      
      // No dispatches should have occurred
      expect(dispatchCount).toBe(0);
    });

    it("should clear pending debounces on dispose()", async () => {
      let dispatchCount = 0;
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Trigger an event
      saveCallback!({ uri: { fsPath: "/test/workspace/file.ts" } });
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Dispose
      eventRegistry.dispose();
      expect(eventRegistry.getPendingDebounceCount()).toBe(0);
      
      // Advance time past debounce window
      vi.advanceTimersByTime(1000);
      
      // No dispatches should have occurred
      expect(dispatchCount).toBe(0);
    });

    it("should debounce fileCreated events", async () => {
      let dispatchCount = 0;
      
      let createCallback: ((event: { files: Array<{ fsPath: string }> }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidCreateFiles).mockImplementation((callback) => {
        createCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileCreated" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Simulate rapid file creates for same file
      createCallback!({ files: [{ fsPath: "/test/workspace/newfile.ts" }] });
      createCallback!({ files: [{ fsPath: "/test/workspace/newfile.ts" }] });
      createCallback!({ files: [{ fsPath: "/test/workspace/newfile.ts" }] });
      
      expect(dispatchCount).toBe(0);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Advance past debounce window
      vi.advanceTimersByTime(500);
      
      expect(dispatchCount).toBe(1);
    });

    it("should debounce fileDeleted events", async () => {
      let dispatchCount = 0;
      
      let deleteCallback: ((event: { files: Array<{ fsPath: string }> }) => void) | null = null;
      vi.mocked(vscode.workspace.onDidDeleteFiles).mockImplementation((callback) => {
        deleteCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = () => {
        dispatchCount++;
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileDeleted" as TriggerType, hookId: "hook-1" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Simulate rapid file deletes for same file
      deleteCallback!({ files: [{ fsPath: "/test/workspace/oldfile.ts" }] });
      deleteCallback!({ files: [{ fsPath: "/test/workspace/oldfile.ts" }] });
      
      expect(dispatchCount).toBe(0);
      expect(eventRegistry.getPendingDebounceCount()).toBe(1);
      
      // Advance past debounce window
      vi.advanceTimersByTime(500);
      
      expect(dispatchCount).toBe(1);
    });

    it("should log debounce config changes", () => {
      eventRegistry.setDebounceConfig({ enabled: false, windowMs: 1000 });
      
      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("Debounce config updated"))).toBe(true);
    });

    it("should log when clearing pending debounces", () => {
      eventRegistry.clearPendingDebounces();
      
      const infoLogs = mockLogger.getInfoLogs();
      expect(infoLogs.some((l) => l.includes("Cleared all pending debounced events"))).toBe(true);
    });

    it("should handle multiple trigger types with debouncing", async () => {
      const dispatchedTriggers: TriggerType[] = [];
      
      let saveCallback: ((doc: { uri: { fsPath: string } }) => void) | null = null;
      let createCallback: ((event: { files: Array<{ fsPath: string }> }) => void) | null = null;
      
      vi.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((callback) => {
        saveCallback = callback as any;
        return { dispose: vi.fn() };
      });
      vi.mocked(vscode.workspace.onDidCreateFiles).mockImplementation((callback) => {
        createCallback = callback as any;
        return { dispose: vi.fn() };
      });

      const eventCallback: EventCallback = (context) => {
        dispatchedTriggers.push(context.trigger);
      };
      eventRegistry.setEventCallback(eventCallback);

      const triggers = [
        { trigger: "fileEdited" as TriggerType, hookId: "hook-1" },
        { trigger: "fileCreated" as TriggerType, hookId: "hook-2" },
      ];
      await eventRegistry.registerListeners(triggers, mockWorkspaceRoot);

      // Same file, different triggers - should be debounced separately
      saveCallback!({ uri: { fsPath: "/test/workspace/file.ts" } });
      createCallback!({ files: [{ fsPath: "/test/workspace/file.ts" }] });
      
      expect(eventRegistry.getPendingDebounceCount()).toBe(2);
      
      // Advance past debounce window
      vi.advanceTimersByTime(500);
      
      expect(dispatchedTriggers).toContain("fileEdited");
      expect(dispatchedTriggers).toContain("fileCreated");
      expect(dispatchedTriggers.length).toBe(2);
    });
  });
});
