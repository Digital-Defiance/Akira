/**
 * Task progress calculation
 * Calculates completion percentage and task statistics
 */

import * as fs from "fs";
import * as path from "path";
import { getSpecDirectoryPath } from "./spec-directory";
import { readState } from "./state-manager";
import { TaskProgress, TaskStatus } from "./types";
import { ConfigManager } from "./config-manager";

/**
 * Parse a task from a line in tasks.md
 */
interface ParsedTask {
  id: string;
  description: string;
  optional: boolean;
  status: TaskStatus;
  level: number;
}

/**
 * Parse tasks from tasks.md content
 * @param content - The content of tasks.md
 * @param taskStatuses - Map of task IDs to their statuses
 * @returns Array of parsed tasks
 */
function parseTasks(
  content: string,
  taskStatuses: Record<string, TaskStatus>
): ParsedTask[] {
  const lines = content.split("\n");
  const tasks: ParsedTask[] = [];
  const taskRegex = /^(\s*)- \[([ x-])\](\*)?\s+(\d+(?:\.\d+)?)\.\s+(.*)/;

  for (const line of lines) {
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
      });
    }
  }

  return tasks;
}

/**
 * Calculate task progress for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns TaskProgress object with statistics
 */
export function calculateTaskProgress(
  featureName: string,
  workspaceRoot?: string
): TaskProgress {
  try {
    const specDir = getSpecDirectoryPath(
      featureName,
      workspaceRoot,
      ".kiro/specs"
    );
    const tasksPath = path.join(specDir, "tasks.md");

    // Check if tasks.md exists
    if (!fs.existsSync(tasksPath)) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        optional: 0,
        percentage: 0,
      };
    }

    // Read tasks.md
    const content = fs.readFileSync(tasksPath, "utf-8");

    // Read state to get task statuses
    const state = readState(featureName, workspaceRoot);
    const taskStatuses = state?.taskStatuses ?? {};

    // Parse tasks
    const tasks = parseTasks(content, taskStatuses);

    // Check strict mode to determine which tasks are required
    const strictMode = ConfigManager.getStrictMode();

    // In strict mode, all tasks are required
    // In normal mode, filter out optional tasks for percentage calculation
    const requiredTasks = strictMode
      ? tasks
      : tasks.filter((task) => !task.optional);
    const optionalTasks = strictMode
      ? []
      : tasks.filter((task) => task.optional);

    // Count completed and in-progress tasks (only required tasks)
    const completed = requiredTasks.filter(
      (task) => task.status === "completed"
    ).length;
    const inProgress = requiredTasks.filter(
      (task) => task.status === "in-progress"
    ).length;

    // Calculate percentage based on required tasks only
    const total = requiredTasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      optional: optionalTasks.length,
      percentage,
    };
  } catch (error) {
    console.error(`Error calculating task progress for ${featureName}:`, error);
    return {
      total: 0,
      completed: 0,
      inProgress: 0,
      optional: 0,
      percentage: 0,
    };
  }
}
