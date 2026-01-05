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
    if (llmIntegrator && llmIntegrator["outputChannel"]) {
      llmIntegrator.dispose();
    }
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
        title: 'Create file "src/index.ts"',
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
      vi.mocked(generateRequirementsWithLLM).mockResolvedValue(
        "Generated requirements"
      );

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
      vi.mocked(generateRequirementsWithLLM).mockResolvedValue(null);

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

  describe("summarizeFailurePatterns", () => {
    /**
     * Property 11: Failure pattern summarization
     * Feature: execution-reflection-loop, Property 11: For any re-planning attempt with multiple previous failures,
     * the LLM prompt should include a summary of detected failure patterns.
     * Validates: Requirements 3.4
     */
    it("should summarize failure patterns for any set of patterns", () => {
      // Generate various failure patterns
      const testCases = [
        // Single pattern
        [
          {
            errorMessage: "File not found",
            occurrences: 1,
            firstSeen: "2026-01-04T10:00:00Z",
            lastSeen: "2026-01-04T10:00:00Z",
          },
        ],
        // Multiple patterns with varying occurrences
        [
          {
            errorMessage: "Module not found",
            occurrences: 3,
            firstSeen: "2026-01-04T10:00:00Z",
            lastSeen: "2026-01-04T10:05:00Z",
          },
          {
            errorMessage: "Syntax error",
            occurrences: 1,
            firstSeen: "2026-01-04T10:02:00Z",
            lastSeen: "2026-01-04T10:02:00Z",
          },
        ],
        // All recurring patterns
        [
          {
            errorMessage: "Connection timeout",
            occurrences: 2,
            firstSeen: "2026-01-04T10:00:00Z",
            lastSeen: "2026-01-04T10:03:00Z",
          },
          {
            errorMessage: "Permission denied",
            occurrences: 2,
            firstSeen: "2026-01-04T10:01:00Z",
            lastSeen: "2026-01-04T10:04:00Z",
          },
        ],
      ];

      for (const patterns of testCases) {
        const summary = llmIntegrator["summarizeFailurePatterns"](patterns);

        // Property: Summary should include all error messages
        for (const pattern of patterns) {
          expect(summary).toContain(pattern.errorMessage);
        }

        // Property: Summary should include occurrence counts for recurring patterns
        const recurringPatterns = patterns.filter((p) => p.occurrences >= 2);
        for (const pattern of recurringPatterns) {
          expect(summary).toContain(`${pattern.occurrences}`);
        }

        // Property: Recurring patterns (occurrences >= 2) should be in "Recurring Issues" section
        if (recurringPatterns.length > 0) {
          expect(summary).toContain("Recurring Issues");
          for (const pattern of recurringPatterns) {
            expect(summary).toContain(pattern.errorMessage);
            expect(summary).toContain(pattern.firstSeen);
            expect(summary).toContain(pattern.lastSeen);
          }
        }

        // Property: Single occurrence patterns should be in "Other Issues" section
        const occasionalPatterns = patterns.filter((p) => p.occurrences === 1);
        if (occasionalPatterns.length > 0) {
          expect(summary).toContain("Other Issues");
        }

        // Property: If there are recurring patterns, analysis should be included
        if (recurringPatterns.length > 0) {
          expect(summary).toContain("Analysis");
          expect(summary).toContain("systematic problem");
        }
      }
    });

    it("should handle empty failure patterns", () => {
      const summary = llmIntegrator["summarizeFailurePatterns"]([]);
      expect(summary).toBe("");
    });
  });

  describe("buildDifferentApproachInstructions", () => {
    /**
     * Property 12: Different approach instruction
     * Feature: execution-reflection-loop, Property 12: For any re-planning attempt,
     * the LLM prompt should explicitly instruct the LLM to try a different approach than previous attempts.
     * Validates: Requirements 3.5
     */
    it("should include explicit different approach instructions for any failure context", () => {
      // Generate various failure contexts
      const testCases = [
        // Single attempt with file error
        {
          iteration: 1,
          previousAttempts: [
            {
              iteration: 1,
              timestamp: "2026-01-04T10:00:00Z",
              actions: [],
              result: { success: false, taskId: "task-1", error: "File not found" },
              evaluationReason: "Failed",
              confidence: 0.2,
            },
          ],
          failurePatterns: [
            {
              errorMessage: "File not found",
              occurrences: 1,
              firstSeen: "2026-01-04T10:00:00Z",
              lastSeen: "2026-01-04T10:00:00Z",
            },
          ],
          environmentState: {
            filesCreated: [],
            filesModified: [],
            commandOutputs: new Map(),
            workingDirectoryState: [],
          },
        },
        // Multiple attempts with command errors
        {
          iteration: 2,
          previousAttempts: [
            {
              iteration: 1,
              timestamp: "2026-01-04T10:00:00Z",
              actions: [],
              result: { success: false, taskId: "task-1", error: "Command failed" },
              evaluationReason: "Failed",
              confidence: 0.3,
            },
            {
              iteration: 2,
              timestamp: "2026-01-04T10:01:00Z",
              actions: [],
              result: { success: false, taskId: "task-1", error: "Command not found" },
              evaluationReason: "Failed",
              confidence: 0.2,
            },
          ],
          failurePatterns: [
            {
              errorMessage: "Command failed",
              occurrences: 2,
              firstSeen: "2026-01-04T10:00:00Z",
              lastSeen: "2026-01-04T10:01:00Z",
            },
          ],
          environmentState: {
            filesCreated: [],
            filesModified: [],
            commandOutputs: new Map(),
            workingDirectoryState: [],
          },
        },
        // Permission errors
        {
          iteration: 1,
          previousAttempts: [
            {
              iteration: 1,
              timestamp: "2026-01-04T10:00:00Z",
              actions: [],
              result: { success: false, taskId: "task-1", error: "Permission denied" },
              evaluationReason: "Failed",
              confidence: 0.1,
            },
          ],
          failurePatterns: [
            {
              errorMessage: "Permission denied",
              occurrences: 1,
              firstSeen: "2026-01-04T10:00:00Z",
              lastSeen: "2026-01-04T10:00:00Z",
            },
          ],
          environmentState: {
            filesCreated: [],
            filesModified: [],
            commandOutputs: new Map(),
            workingDirectoryState: [],
          },
        },
      ];

      for (const failureContext of testCases) {
        const instructions = llmIntegrator["buildDifferentApproachInstructions"](
          failureContext
        );

        // Property: Instructions should explicitly mention trying a different approach
        expect(instructions).toContain("Different Approach");
        expect(instructions).toContain("different strategy");

        // Property: Instructions should mention the number of previous attempts
        expect(instructions).toContain(`${failureContext.previousAttempts.length}`);

        // Property: Instructions should include "DO NOT" section
        expect(instructions).toContain("DO NOT");
        expect(instructions).toContain("Repeat the same actions");

        // Property: Instructions should include "INSTEAD, CONSIDER" section
        expect(instructions).toContain("INSTEAD, CONSIDER");
        expect(instructions).toContain("Different file locations");
        expect(instructions).toContain("Alternative commands");
        expect(instructions).toContain("different implementation approach");

        // Property: Instructions should include specific suggestions based on error types
        const hasFileErrors = failureContext.failurePatterns.some((p) =>
          p.errorMessage.toLowerCase().includes("file")
        );
        const hasCommandErrors = failureContext.failurePatterns.some((p) =>
          p.errorMessage.toLowerCase().includes("command")
        );
        const hasPermissionErrors = failureContext.failurePatterns.some((p) =>
          p.errorMessage.toLowerCase().includes("permission")
        );

        if (hasFileErrors) {
          expect(instructions).toContain("File-related errors detected");
        }

        if (hasCommandErrors) {
          expect(instructions).toContain("Command-related errors detected");
        }

        if (hasPermissionErrors) {
          expect(instructions).toContain("Permission errors detected");
        }
      }
    });

    it("should handle minimal failure context", () => {
      const minimalContext = {
        iteration: 1,
        previousAttempts: [
          {
            iteration: 1,
            timestamp: "2026-01-04T10:00:00Z",
            actions: [],
            result: { success: false, taskId: "task-1" },
            evaluationReason: "Failed",
            confidence: 0.2,
          },
        ],
        failurePatterns: [],
        environmentState: {
          filesCreated: [],
          filesModified: [],
          commandOutputs: new Map(),
          workingDirectoryState: [],
        },
      };

      const instructions = llmIntegrator["buildDifferentApproachInstructions"](
        minimalContext
      );

      // Should still include core instructions
      expect(instructions).toContain("Different Approach");
      expect(instructions).toContain("DO NOT");
      expect(instructions).toContain("INSTEAD, CONSIDER");
    });
  });

  describe("buildImplementationPrompt with failure context", () => {
    it("should include failure pattern summary when patterns exist", () => {
      const task: TaskRecord = {
        id: "task-1",
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

      const failureContext = {
        iteration: 2,
        previousAttempts: [
          {
            iteration: 1,
            timestamp: "2026-01-04T10:00:00Z",
            actions: [
              { type: "file-write" as const, target: "test.ts", content: "code" },
            ],
            result: { success: false, taskId: "task-1", error: "Syntax error" },
            evaluationReason: "Code has syntax errors",
            confidence: 0.3,
          },
        ],
        failurePatterns: [
          {
            errorMessage: "Syntax error in test.ts",
            occurrences: 2,
            firstSeen: "2026-01-04T10:00:00Z",
            lastSeen: "2026-01-04T10:01:00Z",
          },
        ],
        environmentState: {
          filesCreated: ["test.ts"],
          filesModified: [],
          commandOutputs: new Map(),
          workingDirectoryState: [],
        },
      };

      const prompt = llmIntegrator["buildImplementationPrompt"](
        task,
        context,
        failureContext
      );

      // Should include failure patterns section
      expect(prompt).toContain("Failure Patterns Detected");
      expect(prompt).toContain("Syntax error in test.ts");
      expect(prompt).toContain("occurred 2 times");

      // Should include different approach instructions
      expect(prompt).toContain("Different Approach");
      expect(prompt).toContain("DO NOT");
      expect(prompt).toContain("INSTEAD, CONSIDER");
    });

    it("should include environment state when files were created/modified", () => {
      const task: TaskRecord = {
        id: "task-1",
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

      const failureContext = {
        iteration: 1,
        previousAttempts: [
          {
            iteration: 1,
            timestamp: "2026-01-04T10:00:00Z",
            actions: [],
            result: { success: false, taskId: "task-1" },
            evaluationReason: "Failed",
            confidence: 0.2,
          },
        ],
        failurePatterns: [],
        environmentState: {
          filesCreated: ["src/new-file.ts", "src/another.ts"],
          filesModified: ["src/existing.ts"],
          commandOutputs: new Map(),
          workingDirectoryState: [],
        },
      };

      const prompt = llmIntegrator["buildImplementationPrompt"](
        task,
        context,
        failureContext
      );

      // Should include files created
      expect(prompt).toContain("Files Created in Previous Attempts");
      expect(prompt).toContain("src/new-file.ts");
      expect(prompt).toContain("src/another.ts");

      // Should include files modified
      expect(prompt).toContain("Files Modified in Previous Attempts");
      expect(prompt).toContain("src/existing.ts");
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
