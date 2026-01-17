/**
 * Task Execution Manager
 * Manages task execution, context loading, and status tracking
 */

import * as fs from "fs";
import * as path from "path";
import { getSpecDirectoryPath } from "./spec-directory";
import {
  getOrCreateState,
  updateTaskStatus as updateStateTaskStatus,
  getTaskStatus,
} from "./state-manager";
import { TaskStatus } from "./types";
import { Task } from "./task-generator";
import { ConfigManager } from "./config-manager";

// Suppress unused warning - getOrCreateState is used in commented code
void getOrCreateState;

/**
 * Context loaded for task execution
 */
export interface TaskExecutionContext {
  featureName: string;
  requirements: string;
  design: string;
  tasks: string;
}

/**
 * Result of task execution
 */
export interface TaskExecutionResult {
  success: boolean;
  taskId: string;
  message: string;
  error?: string;
}

/**
 * Task Execution Manager
 * Handles loading context, tracking status, and enforcing execution order
 */
export class TaskExecutionManager {
  /**
   * Load context for task execution
   * Loads requirements.md, design.md, and tasks.md
   */
  loadContext(
    featureName: string,
    workspaceRoot?: string
  ): TaskExecutionContext {
    const specDir = getSpecDirectoryPath(featureName, workspaceRoot);

    const requirementsPath = path.join(specDir, "requirements.md");
    const designPath = path.join(specDir, "design.md");
    const tasksPath = path.join(specDir, "tasks.md");

    // Check if all required files exist
    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`Requirements file not found: ${requirementsPath}`);
    }
    if (!fs.existsSync(designPath)) {
      throw new Error(`Design file not found: ${designPath}`);
    }
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    // Load all three documents
    const requirements = fs.readFileSync(requirementsPath, "utf-8");
    const design = fs.readFileSync(designPath, "utf-8");
    const tasks = fs.readFileSync(tasksPath, "utf-8");

    return {
      featureName,
      requirements,
      design,
      tasks,
    };
  }

  /**
   * Update task status
   */
  updateTaskStatus(
    featureName: string,
    taskId: string,
    status: TaskStatus,
    workspaceRoot?: string
  ): boolean {
    return updateStateTaskStatus(featureName, taskId, status, workspaceRoot);
  }

  /**
   * Get task status
   */
  getTaskStatus(
    featureName: string,
    taskId: string,
    workspaceRoot?: string
  ): TaskStatus {
    return getTaskStatus(featureName, taskId, workspaceRoot);
  }

  /**
   * Check if all subtasks are completed
   * Returns true if all non-optional subtasks are completed
   * In strict mode, all subtasks are considered required
   */
  areSubtasksCompleted(
    task: Task,
    featureName: string,
    workspaceRoot?: string
  ): boolean {
    if (task.subtasks.length === 0) {
      return true;
    }

    const strictMode = ConfigManager.getStrictMode();

    for (const subtask of task.subtasks) {
      // In strict mode, all tasks are required
      // In normal mode, skip optional subtasks
      if (!strictMode && subtask.optional) {
        continue;
      }

      const status = this.getTaskStatus(featureName, subtask.id, workspaceRoot);
      if (status !== "completed") {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a task can be executed
   * A task can be executed if:
   * 1. It has no subtasks, OR
   * 2. All non-optional subtasks are completed
   */
  canExecuteTask(
    task: Task,
    featureName: string,
    workspaceRoot?: string
  ): { canExecute: boolean; reason?: string } {
    // If task has no subtasks, it can be executed
    if (task.subtasks.length === 0) {
      return { canExecute: true };
    }

    // Check if all non-optional subtasks are completed
    const allSubtasksCompleted = this.areSubtasksCompleted(
      task,
      featureName,
      workspaceRoot
    );

    if (!allSubtasksCompleted) {
      const incompleteSubtasks = task.subtasks
        .filter((st) => !st.optional)
        .filter(
          (st) =>
            this.getTaskStatus(featureName, st.id, workspaceRoot) !==
            "completed"
        )
        .map((st) => st.id);

      return {
        canExecute: false,
        reason: `Cannot execute parent task ${
          task.id
        } until all subtasks are completed. Incomplete subtasks: ${incompleteSubtasks.join(
          ", "
        )}`,
      };
    }

    return { canExecute: true };
  }

  /**
   * Parse tasks from markdown content
   * Extracts task structure from tasks.md
   * Supports both formats:
   * 1. Hierarchical: "- [ ] 1. Task" with indented "- [ ] 1.1 Subtask"
   * 2. Flat multi-level: "- [ ] 1.1 Task" without indentation
   */
  parseTasksFromMarkdown(tasksMarkdown: string): Task[] {
    const tasks: Task[] = [];
    const lines = tasksMarkdown.split("\n");

    let currentTask: Task | null = null;
    let currentSubtask: Task | null = null;

    for (const line of lines) {
      // Check if this line is indented
      const isIndented = /^\s+/.test(line);

      // Try to match indented subtask line (for hierarchical format)
      // Requires 2+ decimal levels like 1.2.3 or one+ levels like 1.1 when indented
      // Flexible: handles various checkbox states and separators
      if (isIndented) {
        const subtaskMatch = line.match(
          /^\s+-\s*\[([\sxX~-])\](\*)?\s*(\d+(?:\.\d+)+)[:.\)\s]*(.+)$/i
        );
        if (subtaskMatch && currentTask) {
          const [, completed, optional, id, description] = subtaskMatch;
          const subtask: Task = {
            id,
            description: description.trim(),
            optional: optional === "*",
            completed: completed.toLowerCase() === "x",
            subtasks: [],
            requirementRefs: [],
          };
          currentTask.subtasks.push(subtask);
          currentSubtask = subtask;
          continue;
        }
      }

      // Match root-level task line (non-indented)
      // Flexible format: "1", "1.", "1:", "1.1", "1.1.", "1.1:", "1) Desc", "1.) Desc"
      // Checkbox can be: space, x, X, ~, -
      if (!isIndented) {
        const taskMatch = line.match(
          /^-\s*\[([\sxX~-])\](\*)?\s*(\d+(?:\.\d+)*)[:.\)\s]*(.+)$/i
        );
        if (taskMatch) {
          const [, completed, optional, id, description] = taskMatch;
          const task: Task = {
            id,
            description: description.trim(),
            optional: optional === "*",
            completed: completed.toLowerCase() === "x",
            subtasks: [],
            requirementRefs: [],
          };
          tasks.push(task);
          currentTask = task;
          currentSubtask = null;
          continue;
        }
      }

      // Match requirement references
      const reqMatch = line.match(/_Requirements:\s+(.+)_/);
      if (reqMatch && (currentSubtask || currentTask)) {
        const refs = reqMatch[1].split(",").map((r) => r.trim());
        if (currentSubtask) {
          currentSubtask.requirementRefs = refs;
        } else if (currentTask) {
          currentTask.requirementRefs = refs;
        }
        continue;
      }

      // Match property references
      const propMatch = line.match(/\*\*Property\s+\d+:/);
      if (propMatch && currentSubtask) {
        currentSubtask.propertyRef = line.trim();
      }
    }

    return tasks;
  }

  /**
   * Get next task to execute
   * Returns the first non-completed, non-optional task that can be executed
   * In strict mode, all tasks are considered required
   */
  getNextTask(featureName: string, workspaceRoot?: string): Task | null {
    const context = this.loadContext(featureName, workspaceRoot);
    const tasks = this.parseTasksFromMarkdown(context.tasks);
    const strictMode = ConfigManager.getStrictMode();

    for (const task of tasks) {
      const status = this.getTaskStatus(featureName, task.id, workspaceRoot);

      // Skip completed tasks
      // In strict mode, don't skip optional tasks
      if (status === "completed" || (!strictMode && task.optional)) {
        continue;
      }

      // If task has subtasks, check if we should execute a subtask instead
      if (task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
          const subtaskStatus = this.getTaskStatus(
            featureName,
            subtask.id,
            workspaceRoot
          );

          // Skip completed tasks
          // In strict mode, don't skip optional subtasks
          if (
            subtaskStatus === "completed" ||
            (!strictMode && subtask.optional)
          ) {
            continue;
          }

          // Return the first incomplete non-optional subtask
          return subtask;
        }

        // If all subtasks are done, return the parent task
        const canExecute = this.canExecuteTask(
          task,
          featureName,
          workspaceRoot
        );
        if (canExecute.canExecute) {
          return task;
        }
      } else {
        // Task has no subtasks, return it
        return task;
      }
    }

    return null;
  }

  /**
   * Check if a task is optional
   */
  isTaskOptional(
    featureName: string,
    taskId: string,
    workspaceRoot?: string
  ): boolean {
    const context = this.loadContext(featureName, workspaceRoot);
    const tasks = this.parseTasksFromMarkdown(context.tasks);

    for (const task of tasks) {
      if (task.id === taskId) {
        return task.optional;
      }

      for (const subtask of task.subtasks) {
        if (subtask.id === taskId) {
          return subtask.optional;
        }
      }
    }

    return false;
  }

  /**
   * Execute a task (optional tasks are skipped by default unless in strict mode)
   */
  executeTask(
    featureName: string,
    taskId: string,
    forceExecute: boolean = false,
    workspaceRoot?: string
  ): TaskExecutionResult {
    try {
      // Load context
      const context = this.loadContext(featureName, workspaceRoot);
      const tasks = this.parseTasksFromMarkdown(context.tasks);
      const strictMode = ConfigManager.getStrictMode();

      // Find the task
      let targetTask: Task | null = null;
      let parentTask: Task | null = null;

      for (const task of tasks) {
        if (task.id === taskId) {
          targetTask = task;
          break;
        }

        for (const subtask of task.subtasks) {
          if (subtask.id === taskId) {
            targetTask = subtask;
            parentTask = task;
            break;
          }
        }

        if (targetTask) break;
      }

      if (!targetTask) {
        return {
          success: false,
          taskId,
          message: "",
          error: `Task ${taskId} not found`,
        };
      }

      // Check if task is optional and should be skipped
      // In strict mode, optional tasks are required
      if (targetTask.optional && !forceExecute && !strictMode) {
        this.updateTaskStatus(featureName, taskId, "skipped", workspaceRoot);
        return {
          success: true,
          taskId,
          message: `Task ${taskId} is optional and was skipped`,
        };
      }

      // Check if task can be executed (subtasks completed)
      if (parentTask === null && targetTask.subtasks.length > 0) {
        const canExecute = this.canExecuteTask(
          targetTask,
          featureName,
          workspaceRoot
        );
        if (!canExecute.canExecute) {
          return {
            success: false,
            taskId,
            message: "",
            error: canExecute.reason,
          };
        }
      }

      // Mark task as in-progress
      this.updateTaskStatus(featureName, taskId, "in-progress", workspaceRoot);

      return {
        success: true,
        taskId,
        message: `Task ${taskId} ready for execution. Context loaded.`,
      };
    } catch (error) {
      return {
        success: false,
        taskId,
        message: "",
        error: `Failed to execute task: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
