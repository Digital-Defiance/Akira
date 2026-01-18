/**
 * Autonomous Task Executor
 * Implements specs autonomously by executing tasks step-by-step
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getSpecDirectoryPath } from "./spec-directory";
import { readState, updateTaskStatus } from "./state-manager";
import { TaskStatus } from "./types";
import { validateTaskCompletion, TaskValidationResult } from "./task-validator";
import {
  generateCodeWithValidation,
  CodeGenerationRequest,
} from "./copilot-code-generator";

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
  // Flexible task regex that handles various formats:
  // - Checkbox states: space, x, X, ~, - (pending, completed, in-progress)
  // - Task IDs: 1, 1.1, 1.2.3, etc.
  // - Separators: "1. Desc", "1: Desc", "1 Desc", "1.) Desc", "1:) Desc"
  // - Optional asterisk for optional tasks
  const taskRegex = /^(\s*)-\s*\[([\sxX~-])\](\*)?\s+(\d+(?:\.\d+)*)[:.\)\s]*(.+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(taskRegex);
    if (match) {
      const [, indent, checkbox, asterisk, taskId, description] = match;
      const level = indent.length / 2; // Assuming 2 spaces per level
      const optional = asterisk === "*";

      // Determine status from checkbox or state
      // Handle various checkbox markers: x/X = completed, -/~ = in-progress, space = pending
      let status: TaskStatus = "not-started";
      const checkboxLower = checkbox.toLowerCase();
      if (checkboxLower === "x") {
        status = "completed";
      } else if (checkbox === "-" || checkbox === "~") {
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
/**
 * Execute task autonomously using Copilot code generation
 * Generates code, writes to workspace, validates with tests
 */
export async function executeTaskAutonomously(
  featureName: string,
  task: ParsedTask,
  workspaceRoot: string,
  specDirectory: string,
  outputChannel?: vscode.LogOutputChannel,
  chatStream?: vscode.ChatResponseStream
): Promise<TaskExecutionResult> {
  try {
    outputChannel?.info(`\n${"=".repeat(80)}`);
    outputChannel?.info(
      `🤖 AUTONOMOUS EXECUTION: Task ${task.id} - ${task.description}`
    );
    outputChannel?.info(`${"=".repeat(80)}\n`);
    chatStream?.markdown(`🤖 **Executing Task ${task.id}**\n\n${task.description}\n\n`);

    // Mark task as in-progress
    markTaskInProgress(featureName, task.id, workspaceRoot);
    updateTaskCheckbox(
      featureName,
      task.id,
      "in-progress",
      workspaceRoot,
      specDirectory
    );

    // Build execution context
    const executionContext = buildExecutionContext(
      featureName,
      task,
      workspaceRoot,
      specDirectory
    );

    outputChannel?.info(`[AutoExec] Building generation request...`);
    chatStream?.markdown(`📋 Loading requirements and design context...\n\n`);

    // Prepare code generation request
    const generationRequest: CodeGenerationRequest = {
      taskId: task.id,
      taskDescription: task.description,
      requirements: executionContext.requirements || "",
      design: executionContext.design,
    };

    // Find test files related to this task
    let testFile: string | undefined;
    const testPatterns = [
      `${task.id.replace(/\./g, "_")}.test.ts`,
      `${task.id.replace(/\./g, "_")}.test.js`,
      `${featureName}.test.ts`,
      `${featureName}.test.js`,
    ];

    for (const pattern of testPatterns) {
      const testPath = path.join(workspaceRoot, "src", pattern);
      if (fs.existsSync(testPath)) {
        testFile = path.relative(workspaceRoot, testPath);
        outputChannel?.info(`[AutoExec] Found test file: ${testFile}`);
        break;
      }
    }

    generationRequest.testFile = testFile;

    outputChannel?.info(`[AutoExec] Requesting code generation from Copilot...`);
    chatStream?.markdown(`🔨 Generating code with Copilot...\n\n`);

    // Generate code with validation
    const generationResult = await generateCodeWithValidation(
      generationRequest,
      workspaceRoot,
      outputChannel,
      undefined,
      2 // max retries
    );

    if (!generationResult.success) {
      outputChannel?.error(`[AutoExec] Code generation failed: ${generationResult.error}`);
      chatStream?.markdown(`❌ **Code generation failed:** ${generationResult.error}\n\n`);

      // Mark task back as not-started
      updateTaskCheckbox(
        featureName,
        task.id,
        "not-started",
        workspaceRoot,
        specDirectory
      );

      return {
        success: false,
        taskId: task.id,
        description: task.description,
        error: generationResult.error,
        message: `❌ Failed to generate code: ${generationResult.error}`,
      };
    }

    outputChannel?.info(`[AutoExec] ✅ Code generated and written to ${Object.keys(generationResult.code).length} files`);
    chatStream?.markdown(`✅ Generated ${Object.keys(generationResult.code).length} file(s):\n${Object.keys(generationResult.code).map(f => `- ${f}`).join('\n')}\n\n`);

    // Check test results
    if (generationResult.testResults) {
      if (generationResult.testResults.passed) {
        outputChannel?.info(
          `[AutoExec] ✅ Tests passed! Task ${task.id} completed successfully.`
        );
        outputChannel?.info(`[AutoExec] Retry attempts: ${generationResult.retryCount}`);
        chatStream?.markdown(`✅ **Tests Passed!** Task completed successfully.\n\n`);

        // Mark task as completed
        markTaskCompleted(featureName, task.id, workspaceRoot);
        updateTaskCheckbox(
          featureName,
          task.id,
          "completed",
          workspaceRoot,
          specDirectory
        );

        return {
          success: true,
          taskId: task.id,
          description: task.description,
          filesModified: Object.keys(generationResult.code),
          message: `✅ Task ${task.id} completed autonomously with tests passing`,
        };
      } else {
        outputChannel?.error(
          `[AutoExec] ❌ Tests failed after ${generationResult.retryCount} retries`
        );
        outputChannel?.error(
          `[AutoExec] Failed tests: ${generationResult.testResults.failedTests?.join(", ")}`
        );
        chatStream?.markdown(`❌ **Tests Failed** after ${generationResult.retryCount} retries\n\nFailed: ${generationResult.testResults.failedTests?.join(', ')}\n\n`);

        // Mark task back as not-started to allow manual retry
        updateTaskCheckbox(
          featureName,
          task.id,
          "not-started",
          workspaceRoot,
          specDirectory
        );

        return {
          success: false,
          taskId: task.id,
          description: task.description,
          filesModified: Object.keys(generationResult.code),
          error: `Tests failed after ${generationResult.retryCount} retries`,
          message: `⚠️ Code generated but tests failed. Manual review required.`,
        };
      }
    } else {
      // No tests, assume success
      outputChannel?.info(`[AutoExec] No test file found. Assuming success.`);
      chatStream?.markdown(`✅ **Task Completed** (no tests found)\n\n`);

      markTaskCompleted(featureName, task.id, workspaceRoot);
      updateTaskCheckbox(
        featureName,
        task.id,
        "completed",
        workspaceRoot,
        specDirectory
      );

      return {
        success: true,
        taskId: task.id,
        description: task.description,
        filesModified: Object.keys(generationResult.code),
        message: `✅ Task ${task.id} completed autonomously (no tests)`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel?.error(`[AutoExec] Autonomous execution error: ${errorMessage}`);
    chatStream?.markdown(`❌ **Error:** ${errorMessage}\n\n`);

    // Mark task back as not-started
    updateTaskCheckbox(
      featureName,
      task.id,
      "not-started",
      workspaceRoot,
      specDirectory
    );

    return {
      success: false,
      taskId: task.id,
      description: task.description,
      error: errorMessage,
      message: `❌ Error executing task autonomously: ${errorMessage}`,
    };
  }
}