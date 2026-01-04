/**
 * Tests for LLM Integrator
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LLMIntegrator } from "./llm-integrator";
import { TaskRecord, CheckboxState } from "./types";
import * as vscode from "vscode";

vi.mock("vscode");
vi.mock("../llm-design-generator");
vi.mock("../llm-requirements-generator");
vi.mock("../llm-task-generator");

describe("LLMIntegrator", () => {
  let llmIntegrator: LLMIntegrator;

  beforeEach(() => {
    llmIntegrator = new LLMIntegrator();
    vi.clearAllMocks();
  });

  afterEach(() => {
    llmIntegrator.dispose();
  });

  describe("inferGenerationType", () => {
    it("should detect requirements generation", () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Generate requirements",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const result = llmIntegrator["inferGenerationType"](
        "Generate requirements for user authentication"
      );

      expect(result).toBe("requirements");
    });

    it("should detect design generation", () => {
      const result = llmIntegrator["inferGenerationType"](
        "Create architecture design for the system"
      );

      expect(result).toBe("design");
    });

    it("should detect tasks generation", () => {
      const result = llmIntegrator["inferGenerationType"](
        "Generate implementation tasks breakdown"
      );

      expect(result).toBe("tasks");
    });

    it("should detect implementation generation", () => {
      const result = llmIntegrator["inferGenerationType"](
        "Implement user login feature"
      );

      expect(result).toBe("implementation");
    });

    it("should return unknown for ambiguous descriptions", () => {
      const result = llmIntegrator["inferGenerationType"](
        "Do something with the code"
      );

      expect(result).toBe("unknown");
    });

    it("should be case insensitive", () => {
      const result1 = llmIntegrator["inferGenerationType"](
        "GENERATE REQUIREMENTS"
      );
      const result2 = llmIntegrator["inferGenerationType"](
        "create Design"
      );

      expect(result1).toBe("requirements");
      expect(result2).toBe("design");
    });
  });

  describe("parseTaskForActions", () => {
    it("should extract file creation from task description", () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Create files",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      expect(actions.length).toBeGreaterThan(0);
    });

    it("should extract multiple file patterns", () => {
      const task: TaskRecord = {
        id: "task-multi",
        title: 'Create file "src/index.ts" and create file "src/utils.ts"',
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      expect(actions.length).toBe(2);
      expect(actions[0].type).toBe("file-write");
      expect(actions[1].type).toBe("file-write");
    });

    it("should extract command patterns", () => {
      const task: TaskRecord = {
        id: "task-cmd",
        title: 'Run "npm install" and run "npm test"',
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      const commandActions = actions.filter((a) => a.type === "command");
      expect(commandActions.length).toBe(2);
    });

    it("should handle single quotes in file names", () => {
      const task: TaskRecord = {
        id: "task-quotes",
        title: "Create file 'test.txt'",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe("file-write");
    });

    it("should handle double quotes in file names", () => {
      const task: TaskRecord = {
        id: "task-dquotes",
        title: 'Create file "test.txt"',
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe("file-write");
    });

    it("should return empty array for unparseable tasks", () => {
      const task: TaskRecord = {
        id: "task-empty",
        title: "Do something vague",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const actions = llmIntegrator["parseTaskForActions"](task);

      expect(actions.length).toBe(0);
    });
  });

  describe("buildImplementationPrompt", () => {
    it("should build prompt with task context", () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Implement feature X",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks: [],
      };

      const prompt = llmIntegrator["buildImplementationPrompt"](task, context);

      expect(prompt).toContain("Implement feature X");
      expect(prompt).toContain("/test/spec.md");
      expect(prompt).toContain("session-1");
      expect(prompt).toContain("Phase: 3");
    });

    it("should include previous task context", () => {
      const task: TaskRecord = {
        id: "task-2",
        title: "Continue implementation",
        rawLine: 2,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const previousTasks: TaskRecord[] = [
        {
          id: "task-1",
          title: "Previous task 1",
          rawLine: 1,
          checkboxState: CheckboxState.COMPLETE,
          retryCount: 0,
        },
      ];

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks,
      };

      const prompt = llmIntegrator["buildImplementationPrompt"](task, context);

      expect(prompt).toContain("Previous task 1");
    });

    it("should limit previous task context to last 3", () => {
      const task: TaskRecord = {
        id: "task-5",
        title: "Current task",
        rawLine: 5,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const previousTasks: TaskRecord[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: `task-${i}`,
          title: `Task ${i}`,
          rawLine: i,
          checkboxState: CheckboxState.COMPLETE,
          retryCount: 0,
        })
      );

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks,
      };

      const prompt = llmIntegrator["buildImplementationPrompt"](task, context);

      // Should only include last 3 tasks
      expect(prompt).toContain("Task 7");
      expect(prompt).toContain("Task 8");
      expect(prompt).toContain("Task 9");
      expect(prompt).not.toContain("Task 0");
    });
  });

  describe("generateActions", () => {
    it("should route to requirements generation", async () => {
      const task: TaskRecord = {
        id: "task-req",
        title: "Generate requirements",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 1,
        previousTasks: [],
      };

      // Mock file system
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from("# Test Spec") as any
      );

      // Mock LLM generator
      const { generateRequirementsWithLLM } = await import(
        "../llm-requirements-generator"
      );
      vi.mocked(generateRequirementsWithLLM).mockResolvedValue({
        success: true,
        requirements: "Generated requirements",
      } as any);

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(true);
      expect(result.actions.length).toBeGreaterThan(0);
    });

    it("should route to design generation", async () => {
      const task: TaskRecord = {
        id: "task-design",
        title: "Create design",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 2,
        previousTasks: [],
      };

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from("# Test Spec") as any
      );

      const { generateDesignWithLLM } = await import(
        "../llm-design-generator"
      );
      vi.mocked(generateDesignWithLLM).mockResolvedValue({
        success: true,
        design: "Generated design",
      } as any);

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(true);
    });

    it("should route to tasks generation", async () => {
      const task: TaskRecord = {
        id: "task-tasks",
        title: "Generate tasks",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 2,
        previousTasks: [],
      };

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from("# Test Spec") as any
      );

      const { generateTasksWithLLM } = await import("../llm-task-generator");
      vi.mocked(generateTasksWithLLM).mockResolvedValue({
        success: true,
        tasks: "Generated tasks",
      } as any);

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(true);
    });

    it("should route to implementation generation", async () => {
      const task: TaskRecord = {
        id: "task-impl",
        title: "Implement feature",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks: [],
      };

      const result = await llmIntegrator.generateActions({ task, context });

      // Implementation should parse task for actions
      expect(result.taskId).toBe("task-impl");
    });

    it("should handle unknown generation type", async () => {
      const task: TaskRecord = {
        id: "task-unknown",
        title: "Do something ambiguous",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks: [],
      };

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(false);
      expect(result.error).toContain("generation type");
    });

    it("should handle LLM generation failures", async () => {
      const task: TaskRecord = {
        id: "task-fail",
        title: "Generate requirements",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 1,
        previousTasks: [],
      };

      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        Buffer.from("# Test Spec") as any
      );

      const { generateRequirementsWithLLM } = await import(
        "../llm-requirements-generator"
      );
      vi.mocked(generateRequirementsWithLLM).mockResolvedValue({
        success: false,
        error: "LLM API error",
      } as any);

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle file read errors", async () => {
      const task: TaskRecord = {
        id: "task-read-error",
        title: "Generate requirements",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 1,
        previousTasks: [],
      };

      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(
        new Error("File not found")
      );

      const result = await llmIntegrator.generateActions({ task, context });

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });
  });

  describe("resource management", () => {
    it("should dispose output channel", () => {
      const disposeSpy = vi.fn();
      llmIntegrator["outputChannel"] = {
        dispose: disposeSpy,
      } as any;

      llmIntegrator.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
