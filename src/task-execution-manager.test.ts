/**
 * Task Execution Manager Tests
 * Tests for task execution, context loading, and status tracking
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  TaskExecutionManager,
  TaskExecutionContext,
} from "./task-execution-manager";
import { createSpecDirectory } from "./spec-directory";
import { createInitialState, writeState } from "./state-manager";

describe("TaskExecutionManager", () => {
  let tempDir: string;
  let manager: TaskExecutionManager;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-test-"));
    manager = new TaskExecutionManager();
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Property Tests", () => {
    it("Property 12: Context loading for task execution", () => {
      // **Feature: copilot-spec-extension, Property 12: Context loading for task execution**
      // For any task execution request, the system should load all three spec documents
      // (requirements.md, design.md, tasks.md) into context before beginning execution.

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
            // Filter out strings that would result in empty kebab-case names
            const trimmed = s.trim();
            if (trimmed.length === 0) return false;
            // Check if it has at least one alphanumeric character
            return /[a-zA-Z0-9]/.test(trimmed);
          }),
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.string({ minLength: 10, maxLength: 200 }),
          (featureName, requirementsContent, designContent, tasksContent) => {
            // Create spec directory
            const result = createSpecDirectory(featureName, tempDir);
            expect(result.success).toBe(true);

            // Write all three documents
            const specDir = result.directory;
            fs.writeFileSync(
              path.join(specDir, "requirements.md"),
              requirementsContent
            );
            fs.writeFileSync(path.join(specDir, "design.md"), designContent);
            fs.writeFileSync(path.join(specDir, "tasks.md"), tasksContent);

            // Load context
            const context = manager.loadContext(featureName, tempDir);

            // Verify all three documents are loaded
            expect(context.featureName).toBe(featureName);
            expect(context.requirements).toBe(requirementsContent);
            expect(context.design).toBe(designContent);
            expect(context.tasks).toBe(tasksContent);

            // Clean up
            fs.rmSync(specDir, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 13: Subtask completion order", () => {
      // **Feature: copilot-spec-extension, Property 13: Subtask completion order**
      // For any task with subtasks, the parent task should not be marked as completed
      // until all non-optional subtasks are marked as completed.

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
            const trimmed = s.trim();
            if (trimmed.length === 0) return false;
            return /[a-zA-Z0-9]/.test(trimmed);
          }),
          fc.integer({ min: 1, max: 5 }), // Number of non-optional subtasks
          fc.integer({ min: 0, max: 3 }), // Number of optional subtasks
          (featureName, numNonOptional, numOptional) => {
            // Create spec directory and state
            const result = createSpecDirectory(featureName, tempDir);
            expect(result.success).toBe(true);

            const state = createInitialState(featureName);
            writeState(state, tempDir);

            // Create a task with subtasks
            const task = {
              id: "1",
              description: "Parent task",
              optional: false,
              completed: false,
              subtasks: [] as any[],
              requirementRefs: [],
            };

            // Add non-optional subtasks
            for (let i = 0; i < numNonOptional; i++) {
              task.subtasks.push({
                id: `1.${i + 1}`,
                description: `Non-optional subtask ${i + 1}`,
                optional: false,
                completed: false,
                subtasks: [],
                requirementRefs: [],
              });
            }

            // Add optional subtasks
            for (let i = 0; i < numOptional; i++) {
              task.subtasks.push({
                id: `1.${numNonOptional + i + 1}`,
                description: `Optional subtask ${i + 1}`,
                optional: true,
                completed: false,
                subtasks: [],
                requirementRefs: [],
              });
            }

            // Initially, parent task should not be executable (subtasks not completed)
            const canExecuteInitial = manager.canExecuteTask(
              task,
              featureName,
              tempDir
            );
            expect(canExecuteInitial.canExecute).toBe(false);

            // Complete all non-optional subtasks
            for (let i = 0; i < numNonOptional; i++) {
              manager.updateTaskStatus(
                featureName,
                `1.${i + 1}`,
                "completed",
                tempDir
              );
            }

            // Now parent task should be executable (all non-optional subtasks completed)
            const canExecuteFinal = manager.canExecuteTask(
              task,
              featureName,
              tempDir
            );
            expect(canExecuteFinal.canExecute).toBe(true);

            // Verify optional subtasks don't affect executability
            expect(
              manager.areSubtasksCompleted(task, featureName, tempDir)
            ).toBe(true);

            // Clean up
            fs.rmSync(result.directory, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 14: Task status updates", () => {
      // **Feature: copilot-spec-extension, Property 14: Task status updates**
      // For any completed task, the tasks.md file should be updated to reflect
      // the new status while preserving the document's formatting and structure.

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
            const trimmed = s.trim();
            if (trimmed.length === 0) return false;
            return /[a-zA-Z0-9]/.test(trimmed);
          }),
          fc.constantFrom("not-started", "in-progress", "completed", "skipped"),
          fc.constantFrom("not-started", "in-progress", "completed", "skipped"),
          (featureName, initialStatus, newStatus) => {
            // Create spec directory
            const result = createSpecDirectory(featureName, tempDir);
            expect(result.success).toBe(true);

            // Create initial state
            const state = createInitialState(featureName);
            state.taskStatuses["1"] = initialStatus as any;
            state.taskStatuses["1.1"] = initialStatus as any;
            writeState(state, tempDir);

            // Update task status
            const updateResult = manager.updateTaskStatus(
              featureName,
              "1",
              newStatus as any,
              tempDir
            );
            expect(updateResult).toBe(true);

            // Verify status was updated
            const updatedStatus = manager.getTaskStatus(
              featureName,
              "1",
              tempDir
            );
            expect(updatedStatus).toBe(newStatus);

            // Update subtask status
            const subtaskUpdateResult = manager.updateTaskStatus(
              featureName,
              "1.1",
              newStatus as any,
              tempDir
            );
            expect(subtaskUpdateResult).toBe(true);

            // Verify subtask status was updated
            const updatedSubtaskStatus = manager.getTaskStatus(
              featureName,
              "1.1",
              tempDir
            );
            expect(updatedSubtaskStatus).toBe(newStatus);

            // Clean up
            fs.rmSync(result.directory, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 15: Optional task skipping", () => {
      // **Feature: copilot-spec-extension, Property 15: Optional task skipping**
      // For any task marked as optional (with asterisk suffix), it should be skipped
      // during execution unless explicitly requested by the user.

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => {
            const trimmed = s.trim();
            if (trimmed.length === 0) return false;
            return /[a-zA-Z0-9]/.test(trimmed);
          }),
          fc.boolean(), // Whether task is optional
          fc.boolean(), // Whether to force execute
          (featureName, isOptional, forceExecute) => {
            // Create spec directory
            const result = createSpecDirectory(featureName, tempDir);
            expect(result.success).toBe(true);

            // Create tasks.md with an optional task
            const optionalMarker = isOptional ? "*" : "";
            const tasksContent = `# Implementation Plan

- [ ]${optionalMarker} 1. Test task
  - _Requirements: 1.1_
`;
            fs.writeFileSync(
              path.join(result.directory, "tasks.md"),
              tasksContent
            );
            fs.writeFileSync(
              path.join(result.directory, "requirements.md"),
              "# Requirements"
            );
            fs.writeFileSync(
              path.join(result.directory, "design.md"),
              "# Design"
            );

            // Create initial state
            const state = createInitialState(featureName);
            writeState(state, tempDir);

            // Execute the task
            const executeResult = manager.executeTask(
              featureName,
              "1",
              forceExecute,
              tempDir
            );

            expect(executeResult.success).toBe(true);

            // Check the task status
            const taskStatus = manager.getTaskStatus(featureName, "1", tempDir);

            if (isOptional && !forceExecute) {
              // Optional task without force should be skipped
              expect(taskStatus).toBe("skipped");
              expect(executeResult.message).toContain("optional");
              expect(executeResult.message).toContain("skipped");
            } else {
              // Non-optional task or forced optional task should be in-progress
              expect(taskStatus).toBe("in-progress");
            }

            // Clean up
            fs.rmSync(result.directory, { recursive: true, force: true });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Unit Tests", () => {
    it("should load context with all three documents", () => {
      const featureName = "test-feature";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Write all three documents
      fs.writeFileSync(
        path.join(result.directory, "requirements.md"),
        "# Requirements\n\nTest requirements"
      );
      fs.writeFileSync(
        path.join(result.directory, "design.md"),
        "# Design\n\nTest design"
      );
      fs.writeFileSync(
        path.join(result.directory, "tasks.md"),
        "# Tasks\n\nTest tasks"
      );

      // Load context
      const context = manager.loadContext(featureName, tempDir);

      expect(context.featureName).toBe(featureName);
      expect(context.requirements).toContain("Test requirements");
      expect(context.design).toContain("Test design");
      expect(context.tasks).toContain("Test tasks");

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should throw error when requirements file is missing", () => {
      const featureName = "missing-requirements";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Delete requirements file
      fs.unlinkSync(path.join(result.directory, "requirements.md"));

      // Try to load context
      expect(() => manager.loadContext(featureName, tempDir)).toThrow(
        "Requirements file not found"
      );

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should update task status correctly", () => {
      const featureName = "status-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Update status
      const updateResult = manager.updateTaskStatus(
        featureName,
        "1",
        "in-progress",
        tempDir
      );
      expect(updateResult).toBe(true);

      // Verify status
      const status = manager.getTaskStatus(featureName, "1", tempDir);
      expect(status).toBe("in-progress");

      // Update to completed
      manager.updateTaskStatus(featureName, "1", "completed", tempDir);
      const completedStatus = manager.getTaskStatus(featureName, "1", tempDir);
      expect(completedStatus).toBe("completed");

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should skip optional tasks by default", () => {
      const featureName = "optional-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Create tasks.md with optional task
      const tasksContent = `# Implementation Plan

- [ ]* 1. Optional task
  - _Requirements: 1.1_
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);
      fs.writeFileSync(
        path.join(result.directory, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(result.directory, "design.md"), "# Design");

      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Execute without force
      const executeResult = manager.executeTask(
        featureName,
        "1",
        false,
        tempDir
      );
      expect(executeResult.success).toBe(true);
      expect(executeResult.message).toContain("optional");
      expect(executeResult.message).toContain("skipped");

      const status = manager.getTaskStatus(featureName, "1", tempDir);
      expect(status).toBe("skipped");

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should execute optional tasks when forced", () => {
      const featureName = "force-optional-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Create tasks.md with optional task
      const tasksContent = `# Implementation Plan

- [ ]* 1. Optional task
  - _Requirements: 1.1_
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);
      fs.writeFileSync(
        path.join(result.directory, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(result.directory, "design.md"), "# Design");

      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Execute with force
      const executeResult = manager.executeTask(
        featureName,
        "1",
        true,
        tempDir
      );
      expect(executeResult.success).toBe(true);

      const status = manager.getTaskStatus(featureName, "1", tempDir);
      expect(status).toBe("in-progress");

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should parse tasks from markdown correctly", () => {
      const tasksMarkdown = `# Implementation Plan

- [ ] 1. First task
  - _Requirements: 1.1, 1.2_

- [x] 2. Second task (completed)
  - [ ] 2.1 Subtask one
    - _Requirements: 2.1_
  - [x]* 2.2 Optional subtask (completed)
    - _Requirements: 2.2_

- [ ]* 3. Optional task
  - _Requirements: 3.1_
`;

      const tasks = manager.parseTasksFromMarkdown(tasksMarkdown);

      expect(tasks).toHaveLength(3);

      // First task
      expect(tasks[0].id).toBe("1");
      expect(tasks[0].description).toBe("First task");
      expect(tasks[0].optional).toBe(false);
      expect(tasks[0].completed).toBe(false);
      expect(tasks[0].subtasks).toHaveLength(0);

      // Second task
      expect(tasks[1].id).toBe("2");
      expect(tasks[1].description).toBe("Second task (completed)");
      expect(tasks[1].completed).toBe(true);
      expect(tasks[1].subtasks).toHaveLength(2);

      // Second task subtasks
      expect(tasks[1].subtasks[0].id).toBe("2.1");
      expect(tasks[1].subtasks[0].optional).toBe(false);
      expect(tasks[1].subtasks[1].id).toBe("2.2");
      expect(tasks[1].subtasks[1].optional).toBe(true);
      expect(tasks[1].subtasks[1].completed).toBe(true);

      // Third task
      expect(tasks[2].id).toBe("3");
      expect(tasks[2].optional).toBe(true);
    });

    it("should parse tasks with decimal IDs without trailing dots", () => {
      const tasksMarkdown = `# Implementation Plan

- [ ] 1.1 Initialize
- [ ] 1.2 Wire up events
  - [ ] 1.2.1 Nested follow-up

- [x]* 2 Optional but done
`;

      const tasks = manager.parseTasksFromMarkdown(tasksMarkdown);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe("1.1");
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].id).toBe("1.2");
      expect(tasks[1].subtasks).toHaveLength(1);
      expect(tasks[1].subtasks[0].id).toBe("1.2.1");
      expect(tasks[2].id).toBe("2");
      expect(tasks[2].optional).toBe(true);
      expect(tasks[2].completed).toBe(true);
    });

    it("should check if task is optional", () => {
      const featureName = "optional-check-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      const tasksContent = `# Implementation Plan

- [ ] 1. Regular task
  - [ ] 1.1 Regular subtask
  - [ ]* 1.2 Optional subtask

- [ ]* 2. Optional task
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);
      fs.writeFileSync(
        path.join(result.directory, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(result.directory, "design.md"), "# Design");

      expect(manager.isTaskOptional(featureName, "1", tempDir)).toBe(false);
      expect(manager.isTaskOptional(featureName, "1.1", tempDir)).toBe(false);
      expect(manager.isTaskOptional(featureName, "1.2", tempDir)).toBe(true);
      expect(manager.isTaskOptional(featureName, "2", tempDir)).toBe(true);

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });

    it("should get next task to execute", () => {
      const featureName = "next-task-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      const tasksContent = `# Implementation Plan

- [x] 1. Completed task

- [ ] 2. Next task
  - [ ] 2.1 First subtask
  - [ ] 2.2 Second subtask

- [ ] 3. Future task
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);
      fs.writeFileSync(
        path.join(result.directory, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(result.directory, "design.md"), "# Design");

      const state = createInitialState(featureName);
      state.taskStatuses["1"] = "completed";
      writeState(state, tempDir);

      // Should return first subtask of task 2
      const nextTask = manager.getNextTask(featureName, tempDir);
      expect(nextTask).not.toBeNull();
      expect(nextTask?.id).toBe("2.1");

      // Complete first subtask
      state.taskStatuses["2.1"] = "completed";
      writeState(state, tempDir);

      // Should return second subtask
      const nextTask2 = manager.getNextTask(featureName, tempDir);
      expect(nextTask2?.id).toBe("2.2");

      // Clean up
      fs.rmSync(result.directory, { recursive: true, force: true });
    });
  });
});
