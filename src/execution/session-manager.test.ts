/**
 * Tests for Session Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { StorageLayer } from "./storage-layer";
import { SessionState, CheckboxState } from "./types";
import * as fs from "fs/promises";
import * as path from "path";

vi.mock("./storage-layer");
vi.mock("fs/promises");

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let mockStorage: any;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    mockStorage = {
      writeFileAtomic: vi.fn().mockResolvedValue(undefined),
      queueWrite: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      exists: vi.fn(),
      fileExists: vi.fn(),
      ensureDir: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([]),
      listDir: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(StorageLayer).mockImplementation(() => mockStorage);
    sessionManager = new SessionManager(workspaceRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSession", () => {
    it("should create a new session with feature name", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      expect(sessionId).toMatch(/^session-/);
      expect(mockStorage.writeFileAtomic).toHaveBeenCalled();
    });
  });

  describe("updateSession", () => {
    it("should update session state", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      const updates: Partial<SessionState> = {
        status: "PAUSED",
      };

      await sessionManager.updateSession(sessionId, updates);

      expect(mockStorage.writeFileAtomic).toHaveBeenCalled();
    });
  });

  describe("markTaskComplete", () => {
    it("should mark a task as completed", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      // Add a task
      await sessionManager.addTasks(sessionId, [
        {
          id: "task-1",
          title: "Implement feature",
          rawLine: 10,
          checkboxState: CheckboxState.INCOMPLETE,
          retryCount: 0,
        },
      ]);

      await sessionManager.markTaskComplete(sessionId, "task-1");

      const session = await sessionManager.getSession(sessionId);
      expect(session?.tasks[0].checkboxState).toBe(CheckboxState.COMPLETE);
      expect(session?.totalTasksCompleted).toBe(1);
    });

    it("should throw if task not found", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      await expect(
        sessionManager.markTaskComplete(sessionId, "task-1")
      ).rejects.toThrow("Task not found: task-1");
    });
  });

  describe("appendToHistory", () => {
    it("should append entry to history log", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      await sessionManager.appendToHistory(sessionId, "Test entry");

      expect(mockStorage.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining("history.md"),
        expect.stringContaining("Test entry")
      );
    });
  });

  describe("logDecision", () => {
    it("should log decision to decisions file", async () => {
      const sessionId = await sessionManager.createSession({
        featureName: "Test Feature",
        workspaceRoot: "/test/workspace",
      });

      await sessionManager.logDecision(sessionId, "task-1", {
        confidence: 0.95,
        reasoning: "Should we proceed?",
        provider: "heuristic",
      });

      expect(mockStorage.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining("decisions.md"),
        expect.stringContaining("task-1")
      );
      expect(mockStorage.writeFileAtomic).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("95.0%")
      );
    });
  });

  describe("listSessions", () => {
    it("should list all sessions", async () => {
      mockStorage.listDir.mockResolvedValue([
        "session-1",
        "session-2",
        "other-file.txt",
      ]);

      const sessions = await sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain("session-1");
      expect(sessions).toContain("session-2");
    });
  });

  describe("checkStaleSessions", () => {
    it("should detect sessions older than threshold", async () => {
      mockStorage.listDir.mockResolvedValue(["session-old"]);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const mockSession: SessionState = {
        id: "session-old",
        featureName: "Old Feature",
        workspaceRoot: "/test/workspace",
        status: "PAUSED",
        tasks: [],
        currentPhase: 1,
        currentTaskIndex: 0,
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
        fileModificationCount: 0,
      };

      mockStorage.readFile.mockResolvedValue(
        sessionManager["formatSessionFile"](mockSession)
      );

      const staleSessions = await sessionManager.checkStaleSessions(7); // 7 day threshold

      expect(staleSessions).toHaveLength(1);
      expect(staleSessions[0]).toBe("session-old");
    });
  });

  describe("logReflectionIteration", () => {
    it("should log reflection iteration to reflection.md", async () => {
      const sessionId = "session-123";
      const taskId = "task-1";
      const iteration = 1;
      const result: any = {
        success: false,
        taskId: "task-1",
        filesCreated: ["src/test.ts"],
        commandsRun: ["npm test"],
        error: "Test failed",
      };
      const evaluation: any = {
        confidence: 0.5,
        reasoning: "Tests are failing",
        detected: false,
        provider: "heuristic",
      };

      mockStorage.readFile.mockRejectedValue(new Error("File not found"));

      await sessionManager.logReflectionIteration(
        sessionId,
        taskId,
        iteration,
        result,
        evaluation
      );

      expect(mockStorage.writeFileAtomic).toHaveBeenCalledWith(
        expect.stringContaining("reflection.md"),
        expect.stringContaining("Iteration 1")
      );
      expect(mockStorage.writeFileAtomic).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Test failed")
      );
    });
  });

  describe("getReflectionStats", () => {
    it("should return reflection statistics", async () => {
      const sessionId = "session-123";
      const failuresData = {
        sessionId,
        tasks: {
          "task-1": {
            attempts: [
              {
                iteration: 1,
                timestamp: "2024-01-01T00:00:00.000Z",
                actions: [],
                result: { success: false, taskId: "task-1", error: "Error 1" },
                evaluationReason: "Failed",
                confidence: 0.3,
              },
              {
                iteration: 2,
                timestamp: "2024-01-01T00:01:00.000Z",
                actions: [],
                result: { success: true, taskId: "task-1" },
                evaluationReason: "Success",
                confidence: 0.9,
              },
            ],
            patterns: [
              {
                errorMessage: "Error 1",
                occurrences: 1,
                firstSeen: "2024-01-01T00:00:00.000Z",
                lastSeen: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        },
      };

      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readFile.mockResolvedValue(JSON.stringify(failuresData));

      const stats = await sessionManager.getReflectionStats(sessionId);

      expect(stats.totalReflections).toBe(1);
      expect(stats.averageIterations).toBe(2);
      expect(stats.successRate).toBe(1);
      expect(stats.commonFailurePatterns).toHaveLength(1);
      expect(stats.commonFailurePatterns[0].errorMessage).toBe("Error 1");
    });

    it("should return default stats if no failures file exists", async () => {
      mockStorage.exists.mockResolvedValue(false);

      const stats = await sessionManager.getReflectionStats("session-123");

      expect(stats.totalReflections).toBe(0);
      expect(stats.averageIterations).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.commonFailurePatterns).toHaveLength(0);
    });
  });

  describe("Property 26: Session history persistence", () => {
    /**
     * Feature: execution-reflection-loop, Property 26: Session history persistence
     * Validates: Requirements 7.5
     * 
     * For any reflection loop activity, it should be persisted to the session history file.
     */
    it("should persist all reflection activity to session history", async () => {
      const sessionId = "session-test";
      const taskId = "task-1";
      
      // Mock storage to track writes
      const historyWrites: string[] = [];
      mockStorage.writeFileAtomic.mockImplementation((path: string, content: string) => {
        if (path.includes("history.md")) {
          historyWrites.push(content);
        }
        return Promise.resolve();
      });
      
      mockStorage.readFile.mockRejectedValue(new Error("File not found"));
      
      // Simulate multiple reflection iterations
      for (let i = 1; i <= 3; i++) {
        const result: any = {
          success: i === 3, // Last iteration succeeds
          taskId,
          filesCreated: [`src/file${i}.ts`],
          commandsRun: [`command${i}`],
          error: i < 3 ? `Error ${i}` : undefined,
        };
        
        const evaluation: any = {
          confidence: i === 3 ? 0.9 : 0.3 + (i * 0.1),
          reasoning: i === 3 ? "Success" : `Attempt ${i} failed`,
          detected: i === 3,
          provider: "heuristic",
        };
        
        await sessionManager.logReflectionIteration(
          sessionId,
          taskId,
          i,
          result,
          evaluation
        );
      }
      
      // Verify that history was written for each iteration
      expect(mockStorage.writeFileAtomic).toHaveBeenCalled();
      
      // Check that history entries contain reflection information
      const historyCallsForHistory = mockStorage.writeFileAtomic.mock.calls.filter(
        (call: any) => call[0].includes("history.md")
      );
      
      expect(historyCallsForHistory.length).toBeGreaterThanOrEqual(3);
      
      // Verify each iteration was logged
      for (let i = 1; i <= 3; i++) {
        const iterationLogged = historyCallsForHistory.some((call: any) =>
          call[1].includes(`Reflection iteration ${i}`)
        );
        expect(iterationLogged).toBe(true);
      }
    });
  });
});
