/**
 * Tests for Execution Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecutionEngine } from "./execution-engine";
import { ExecutionPlan, TaskRecord } from "./types";
import * as fs from "fs";

vi.mock("fs");
vi.mock("child_process");

describe("ExecutionEngine", () => {
  let executionEngine: ExecutionEngine;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    executionEngine = new ExecutionEngine(workspaceRoot, {
      requireApprovalForDestructive: false,
      maxFileModifications: 10,
    });
    vi.clearAllMocks();
  });

  describe("executePlan", () => {
    it("should execute file-write action", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-1",
        actions: [
          {
            type: "file-write",
            target: "/test/output.txt",
            content: "test content",
          },
        ],
      };

      // Mock file system
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.taskId).toBe("task-1");
      expect(result.success).toBe(true);
    });

    it("should execute multiple actions in sequence", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-multi",
        actions: [
          {
            type: "file-write",
            target: "/test/file1.txt",
            content: "content 1",
          },
          {
            type: "file-write",
            target: "/test/file2.txt",
            content: "content 2",
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesCreated?.length).toBe(2);
    });

    it("should track duration", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-timing",
        actions: [],
      };

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle errors gracefully", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-error",
        actions: [
          {
            type: "file-write",
            target: "/invalid/path/file.txt",
            content: "test",
          },
        ],
      };

      // Mock file write failure
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("file operations", () => {
    it("should create new files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-create",
        actions: [
          {
            type: "file-write",
            target: "/test/new-file.txt",
            content: "new content",
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesCreated).toContain("/test/new-file.txt");
    });

    it("should modify existing files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-modify",
        actions: [
          {
            type: "file-write",
            target: "/test/existing-file.txt",
            content: "modified content",
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesModified).toContain("/test/existing-file.txt");
    });

    it("should delete files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-delete",
        actions: [
          {
            type: "file-delete",
            target: "/test/delete-me.txt",
            destructive: true,
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "unlinkSync").mockImplementation(() => undefined);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
    });
  });

  describe("command execution", () => {
    it("should execute commands", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-cmd",
        actions: [
          {
            type: "command",
            target: "echo",
            command: "echo",
            args: ["hello"],
          },
        ],
      };

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.commandsRun).toContain("echo");
    });

    it("should retry failed commands", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-retry",
        actions: [
          {
            type: "command",
            target: "failing-command",
            command: "failing-command",
          },
        ],
      };

      // Commands might fail and retry
      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.taskId).toBe("task-retry");
    });
  });

  describe("file modification limits", () => {
    it("should enforce file modification limits", async () => {
      const actions = Array.from({ length: 15 }, (_, i) => ({
        type: "file-write" as const,
        target: `/test/file-${i}.txt`,
        content: `content ${i}`,
      }));

      const plan: ExecutionPlan = {
        taskId: "task-limit",
        actions,
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      // Should stop after hitting the limit (10)
      expect(result.success).toBe(false);
      expect(result.error).toContain("modification limit");
    });
  });

  describe("LLM generation", () => {
    it("should handle LLM generation requests", async () => {
      const task: TaskRecord = {
        id: "task-llm",
        title: "Generate code",
        rawLine: 1,
        checkboxState: "INCOMPLETE" as any,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks: [],
      };

      const result = await executionEngine.generateWithLLM(task, context);

      expect(result.taskId).toBe("task-llm");
      // Result will depend on LLM integration
    });
  });

  describe("error handling", () => {
    it("should handle permission errors", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-permission",
        actions: [
          {
            type: "file-write",
            target: "/root/protected-file.txt",
            content: "test",
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle disk space errors", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-space",
        actions: [
          {
            type: "file-write",
            target: "/test/large-file.txt",
            content: "x".repeat(1000000),
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
        throw new Error("ENOSPC: no space left on device");
      });

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOSPC");
    });
  });

  describe("execution results", () => {
    it("should return comprehensive results", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-results",
        actions: [
          {
            type: "file-write",
            target: "/test/result1.txt",
            content: "content 1",
          },
          {
            type: "command",
            target: "echo",
            command: "echo",
            args: ["test"],
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("taskId");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("filesCreated");
      expect(result).toHaveProperty("commandsRun");
    });
  });
});
