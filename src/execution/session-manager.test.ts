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
      fileExists: vi.fn(),
      ensureDir: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(StorageLayer).mockImplementation(() => mockStorage);
    sessionManager = new SessionManager(workspaceRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSession", () => {
    it("should create a new session with spec path", async () => {
      mockStorage.fileExists.mockResolvedValue(false);

      const session = await sessionManager.createSession("/spec/test.md");

      expect(session.sessionId).toMatch(/^session-\d+$/);
      expect(session.specPath).toBe("/spec/test.md");
      expect(session.status).toBe("initializing");
      expect(session.phase).toBe(0); // PARSE_SPEC
      expect(session.tasks).toEqual([]);
      expect(mockStorage.writeFileAtomic).toHaveBeenCalled();
    });

    it("should create session with initial phase", async () => {
      mockStorage.fileExists.mockResolvedValue(false);

      const session = await sessionManager.createSession(
        "/spec/test.md",
        4 // EXECUTE_TASKS
      );

      expect(session.phase).toBe(4); // EXECUTE_TASKS
    });

    it("should throw if session already exists", async () => {
      mockStorage.fileExists.mockResolvedValue(true);

      await expect(sessionManager.createSession("/spec/test.md")).rejects.toThrow(
        "Session directory already exists"
      );
    });
  });

  describe("updateSession", () => {
    it("should update session state", async () => {
      mockStorage.readFile.mockResolvedValue(`---
sessionId: session-123
status: running
phase: 2
specPath: /spec/test.md
createdAt: 2024-01-01T00:00:00.000Z
---

| Task | Status | Started | Completed |
|------|--------|---------|-----------|
`);

      const updates: Partial<SessionState> = {
        status: "paused",
        currentTask: "task-1",
      };

      await sessionManager.updateSession("session-123", updates);

      expect(mockStorage.queueWrite).toHaveBeenCalledWith(
        expect.stringContaining("session-123"),
        expect.stringContaining("status: paused")
      );
    });
  });

  describe("markTaskComplete", () => {
    it("should mark a task as completed", async () => {
      const mockSession: SessionState = {
        sessionId: "session-123",
        status: "running",
        phase: 4, // EXECUTE_TASKS
        specPath: "/spec/test.md",
        tasks: [
          {
            id: "task-1",
            checkboxLine: 10,
            state: CheckboxState.IN_PROGRESS,
            description: "Implement feature",
            section: "Tasks",
            indentLevel: 0,
          },
        ],
        createdAt: "2024-01-01T00:00:00.000Z",
        modifiedAt: "2024-01-01T00:00:00.000Z",
        counters: {
          totalTasks: 1,
          completedTasks: 0,
          failedTasks: 0,
          skippedTasks: 0,
          apiCalls: 0,
          filesModified: 0,
          commandsExecuted: 0,
        },
      };

      mockStorage.readFile.mockResolvedValue(
        sessionManager["formatSession"](mockSession)
      );

      await sessionManager.markTaskComplete("session-123", "task-1");

      expect(mockStorage.queueWrite).toHaveBeenCalledWith(
        expect.stringContaining("session-123"),
        expect.stringContaining("completedTasks: 1")
      );
    });

    it("should throw if task not found", async () => {
      const mockSession: SessionState = {
        sessionId: "session-123",
        status: "running",
        phase: 4, // EXECUTE_TASKS
        specPath: "/spec/test.md",
        tasks: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        modifiedAt: "2024-01-01T00:00:00.000Z",
        counters: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          skippedTasks: 0,
          apiCalls: 0,
          filesModified: 0,
          commandsExecuted: 0,
        },
      };

      mockStorage.readFile.mockResolvedValue(
        sessionManager["formatSession"](mockSession)
      );

      await expect(
        sessionManager.markTaskComplete("session-123", "task-1")
      ).rejects.toThrow("Task task-1 not found in session");
    });
  });

  describe("appendToHistory", () => {
    it("should append entry to history log", async () => {
      await sessionManager.appendToHistory("session-123", "Test entry");

      expect(mockStorage.queueWrite).toHaveBeenCalledWith(
        expect.stringContaining("history.md"),
        expect.stringContaining("Test entry")
      );
    });
  });

  describe("logDecision", () => {
    it("should log decision to decisions file", async () => {
      await sessionManager.logDecision(
        "session-123",
        "Should we proceed?",
        "yes",
        0.95
      );

      expect(mockStorage.queueWrite).toHaveBeenCalledWith(
        expect.stringContaining("decisions.md"),
        expect.stringContaining("Should we proceed?")
      );
      expect(mockStorage.queueWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("confidence: 0.95")
      );
    });
  });

  describe("listSessions", () => {
    it("should list all sessions", async () => {
      mockStorage.listFiles.mockResolvedValue([
        "session-1/session.md",
        "session-2/session.md",
      ]);

      const mockSession = {
        sessionId: "session-1",
        status: "completed",
        phase: 5, // COMPLETE
        specPath: "/spec/test.md",
        tasks: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        modifiedAt: "2024-01-01T00:00:00.000Z",
        counters: {
          totalTasks: 10,
          completedTasks: 10,
          failedTasks: 0,
          skippedTasks: 0,
          apiCalls: 0,
          filesModified: 0,
          commandsExecuted: 0,
        },
      };

      mockStorage.readFile.mockResolvedValue(
        sessionManager["formatSession"](mockSession)
      );

      const sessions = await sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].sessionId).toBe("session-1");
    });
  });

  describe("detectStaleSessions", () => {
    it("should detect sessions older than threshold", async () => {
      mockStorage.listFiles.mockResolvedValue(["session-old/session.md"]);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const mockSession = {
        sessionId: "session-old",
        status: "running",
        phase: 4, // EXECUTE_TASKS
        specPath: "/spec/test.md",
        tasks: [],
        createdAt: oldDate.toISOString(),
        modifiedAt: oldDate.toISOString(),
        counters: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          skippedTasks: 0,
          apiCalls: 0,
          filesModified: 0,
          commandsExecuted: 0,
        },
      };

      mockStorage.readFile.mockResolvedValue(
        sessionManager["formatSession"](mockSession)
      );

      const staleSessions = await sessionManager.detectStaleSessions(7); // 7 day threshold

      expect(staleSessions).toHaveLength(1);
      expect(staleSessions[0].sessionId).toBe("session-old");
    });
  });
});
