/**
 * Autonomous Task Executor
 * Implements specs autonomously by executing tasks step-by-step
 */

import * as fs from "fs";
import * as path from "path";
import { getSpecDirectoryPath } from "./spec-directory";
import { readState, updateTaskStatus } from "./state-manager";
import { TaskStatus } from "./types";
import { validateTaskCompletion, TaskValidationResult } from "./task-validator";

/**
 * Represents a parsed task from tasks.md
 */
export interface ParsedTask {
  id: string;
  description: string;
  optional: boolean;
  status: TaskStatus;
  level: number;
  line: number;
}

/**
 * Context for task execution
 */
export interface TaskExecutionContext {
  featureName: string;
  requirements?: string;
  design?: string;
  completedTasks: ParsedTask[];
  currentTask: ParsedTask;
  workspaceRoot: string;
}

/**
 * Result of task execution
 */
export interface TaskExecutionResult {
  success: boolean;
  taskId: string;
  description: string;
  filesModified?: string[];
  error?: string;
  message: string;
  alreadyComplete?: boolean;
  validationResult?: TaskValidationResult;
}

/**
 * Parse tasks from tasks.md content
 */
export function parseTasks(
  content: string,
  taskStatuses: Record<string, TaskStatus>
): ParsedTask[] {
  const lines = content.split("\n");
  const tasks: ParsedTask[] = [];
  const taskRegex = /^(\s*)- \[([ x-])\](\*)?\s+(\d+(?:\.\d+)?)\.\s+(.*)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(taskRegex);
    if (match) {
      const [, indent, checkbox, asterisk, taskId, description] = match;
      const level = indent.length / 2; // Assuming 2 spaces per level
      const optional = asterisk === "*";

      // Determine status from checkbox or state
      let status: TaskStatus = "not-started";
      if (checkbox === "x") {
        status = "completed";
      } else if (checkbox === "-") {
        status = "in-progress";
      } else if (taskStatuses[taskId]) {
        status = taskStatuses[taskId];
      }

      tasks.push({
        id: taskId,
        description: description.trim(),
        optional,
        status,
        level,
        line: i,
      });
    }
  }

  return tasks;
}

/**
 * Find the next incomplete task
 */
export function findNextTask(
  featureName: string,
  workspaceRoot: string,
  specDirectory: string
): ParsedTask | null {
  try {
    const specDir = getSpecDirectoryPath(
      featureName,
      workspaceRoot,
      specDirectory
    );
    const tasksPath = path.join(specDir, "tasks.md");

    if (!fs.existsSync(tasksPath)) {
      return null;
    }

    const content = fs.readFileSync(tasksPath, "utf-8");
    const state = readState(featureName, workspaceRoot);
    const taskStatuses = state?.taskStatuses || {};
    const tasks = parseTasks(content, taskStatuses);

    // Find first non-optional incomplete task
    for (const task of tasks) {
      if (
        !task.optional &&
        task.status !== "completed" &&
        task.status !== "skipped"
      ) {
        return task;
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding next task:", error);
    return null;
  }
}

/**
 * Get all completed tasks
 */
export function getCompletedTasks(
  featureName: string,
  workspaceRoot: string,
  specDirectory: string
): ParsedTask[] {
  try {
    const specDir = getSpecDirectoryPath(
      featureName,
      workspaceRoot,
      specDirectory
    );
    const tasksPath = path.join(specDir, "tasks.md");

    if (!fs.existsSync(tasksPath)) {
      return [];
    }

    const content = fs.readFileSync(tasksPath, "utf-8");
    const state = readState(featureName, workspaceRoot);
    const taskStatuses = state?.taskStatuses || {};
    const tasks = parseTasks(content, taskStatuses);

    return tasks.filter((t) => t.status === "completed");
  } catch (error) {
    console.error("Error getting completed tasks:", error);
    return [];
  }
}

/**
 * Build execution context for a task
 */
export function buildExecutionContext(
  featureName: string,
  task: ParsedTask,
  workspaceRoot: string,
  specDirectory: string
): TaskExecutionContext {
  const specDir = getSpecDirectoryPath(
    featureName,
    workspaceRoot,
    specDirectory
  );

  // Read requirements
  let requirements: string | undefined;
  const reqPath = path.join(specDir, "requirements.md");
  if (fs.existsSync(reqPath)) {
    requirements = fs.readFileSync(reqPath, "utf-8");
  }

  // Read design
  let design: string | undefined;
  const designPath = path.join(specDir, "design.md");
  if (fs.existsSync(designPath)) {
    design = fs.readFileSync(designPath, "utf-8");
  }

  // Get completed tasks
  const completedTasks = getCompletedTasks(
    featureName,
    workspaceRoot,
    specDirectory
  );

  return {
    featureName,
    requirements,
    design,
    completedTasks,
    currentTask: task,
    workspaceRoot,
  };
}

/**
 * Generate prompt for autonomous task execution
 */
export function generateTaskExecutionPrompt(
  context: TaskExecutionContext
): string {
  let prompt = `You are implementing a feature specification autonomously. Your task is to implement the following task from the spec.

**Feature:** ${context.featureName}

**Current Task:** ${context.currentTask.id} - ${context.currentTask.description}

`;

  if (context.requirements) {
    prompt += `**Requirements:**
\`\`\`markdown
${context.requirements}
\`\`\`

`;
  }

  if (context.design) {
    prompt += `**Design:**
\`\`\`markdown
${context.design}
\`\`\`

`;
  }

  if (context.completedTasks.length > 0) {
    prompt += `**Completed Tasks:**
${context.completedTasks.map((t) => `- ${t.id}: ${t.description}`).join("\n")}

`;
  }

  prompt += `**Instructions:**
1. Implement task ${context.currentTask.id} according to the requirements and design
2. Create or modify all necessary files
3. Follow the coding standards and patterns established in the project
4. Write clean, well-documented code
5. Include error handling where appropriate
6. Make sure your implementation is complete and functional

After implementing, report back with:
- What files you created/modified
- A brief description of what you implemented
- Any issues or considerations

Begin implementing task ${context.currentTask.id} now.`;

  return prompt;
}

/**
 * Check if task is already complete by validating success criteria
 * Returns validation result indicating if task can be auto-completed
 */
export async function checkTaskAlreadyComplete(
  featureName: string,
  task: ParsedTask,
  workspaceRoot: string,
  specDirectory: string
): Promise<TaskValidationResult> {
  const specDir = getSpecDirectoryPath(
    featureName,
    workspaceRoot,
    specDirectory
  );
  const tasksPath = path.join(specDir, "tasks.md");

  return await validateTaskCompletion(task, workspaceRoot, tasksPath);
}

/**
 * Mark task as in-progress
 */
export function markTaskInProgress(
  featureName: string,
  taskId: string,
  workspaceRoot: string
): void {
  updateTaskStatus(featureName, taskId, "in-progress", workspaceRoot);
}

/**
 * Mark task as completed
 */
export function markTaskCompleted(
  featureName: string,
  taskId: string,
  workspaceRoot: string
): void {
  updateTaskStatus(featureName, taskId, "completed", workspaceRoot);
}

/**
 * Update task checkbox in tasks.md
 */
export function updateTaskCheckbox(
  featureName: string,
  taskId: string,
  status: "completed" | "in-progress" | "not-started",
  workspaceRoot: string,
  specDirectory: string
): void {
  const specDir = getSpecDirectoryPath(
    featureName,
    workspaceRoot,
    specDirectory
  );
  const tasksPath = path.join(specDir, "tasks.md");

  if (!fs.existsSync(tasksPath)) {
    return;
  }

  const content = fs.readFileSync(tasksPath, "utf-8");
  const lines = content.split("\n");

  // Find the task line and update checkbox
  const taskRegex = new RegExp(
    `^(\\s*)- \\[[ x-]\\](\\*)?\\s+${taskId.replace(".", "\\.")}\\s+(.*)\$`
  );

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(taskRegex);
    if (match) {
      const [, indent, asterisk, description] = match;
      const checkbox =
        status === "completed" ? "x" : status === "in-progress" ? "-" : " ";
      const optionalMarker = asterisk || "";
      lines[
        i
      ] = `${indent}- [${checkbox}]${optionalMarker} ${taskId}. ${description}`;
      break;
    }
  }

  fs.writeFileSync(tasksPath, lines.join("\n"), "utf-8");
}
