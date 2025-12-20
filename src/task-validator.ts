/**
 * Task Validator
 * Validates if task success criteria have been met before execution
 */

import * as fs from "fs";
import * as path from "path";
import { ParsedTask } from "./autonomous-executor";

/**
 * Result of task validation check
 */
export interface TaskValidationResult {
  alreadyComplete: boolean;
  reason?: string;
  detectedConditions: string[];
  missingConditions: string[];
}

/**
 * Success criteria definition from task
 */
export interface SuccessCriteria {
  type:
    | "file-exists"
    | "command-runs"
    | "build-passes"
    | "test-passes"
    | "lint-passes"
    | "custom";
  description: string;
  validation: string; // Command or file path to validate
}

/**
 * Parse success criteria from task description and sub-bullets
 * Extracts "Success criteria:" section from task details
 */
export function parseSuccessCriteria(
  taskContent: string,
  taskLines: string[]
): SuccessCriteria[] {
  const criteria: SuccessCriteria[] = [];
  let inCriteriaSection = false;

  for (const line of taskLines) {
    const trimmed = line.trim();

    // Check if we're entering success criteria section
    if (
      trimmed.toLowerCase().includes("success criteria:") ||
      trimmed.toLowerCase().startsWith("success criteria")
    ) {
      inCriteriaSection = true;
      continue;
    }

    // Exit criteria section if we hit another section or empty line
    if (inCriteriaSection) {
      if (
        trimmed === "" ||
        trimmed.startsWith("- [ ]") ||
        trimmed.startsWith("- [x]") ||
        trimmed.startsWith("- [-]")
      ) {
        break;
      }

      // Parse criteria line
      if (trimmed.startsWith("-")) {
        const description = trimmed.substring(1).trim();

        // Detect type of criteria
        if (description.includes("build") || description.includes("npm run")) {
          criteria.push({
            type: "command-runs",
            description,
            validation: extractCommand(description) || "npm run build",
          });
        } else if (description.includes("lint")) {
          criteria.push({
            type: "lint-passes",
            description,
            validation: "npm run lint",
          });
        } else if (description.includes("test")) {
          criteria.push({
            type: "test-passes",
            description,
            validation: "npm test",
          });
        } else if (
          description.includes("file") ||
          description.includes("Files:")
        ) {
          criteria.push({
            type: "file-exists",
            description,
            validation: extractFilePaths(description).join(","),
          });
        } else {
          criteria.push({
            type: "custom",
            description,
            validation: description,
          });
        }
      }
    }
  }

  return criteria;
}

/**
 * Extract command from description
 */
function extractCommand(description: string): string | null {
  // Look for backticks or command patterns
  const backtickMatch = description.match(/`([^`]+)`/);
  if (backtickMatch) {
    return backtickMatch[1];
  }

  // Look for npm run patterns
  const npmMatch = description.match(/npm\s+run\s+(\w+)/);
  if (npmMatch) {
    return `npm run ${npmMatch[1]}`;
  }

  return null;
}

/**
 * Extract file paths from description
 */
function extractFilePaths(description: string): string[] {
  const paths: string[] = [];

  // Look for patterns like "Files: path1, path2"
  const filesMatch = description.match(/Files?:\s*([^.\n]+)/i);
  if (filesMatch) {
    const pathStr = filesMatch[1];
    const parts = pathStr.split(",").map((p) => p.trim());
    paths.push(...parts);
  }

  // Look for paths with extensions
  const pathMatches = description.matchAll(
    /([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g
  );
  for (const match of pathMatches) {
    if (!paths.includes(match[1])) {
      paths.push(match[1]);
    }
  }

  return paths;
}

/**
 * Check if files exist in workspace
 */
export function checkFilesExist(
  filePaths: string[],
  workspaceRoot: string
): { exists: boolean; found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];

  for (const filePath of filePaths) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceRoot, filePath);

    if (fs.existsSync(fullPath)) {
      found.push(filePath);
    } else {
      missing.push(filePath);
    }
  }

  return {
    exists: missing.length === 0,
    found,
    missing,
  };
}

/**
 * Check if a command runs successfully
 * Returns true if command exits with code 0
 */
export async function checkCommandRuns(
  command: string,
  workspaceRoot: string
): Promise<{ success: boolean; error?: string }> {
  const { exec } = require("child_process");
  const util = require("util");
  const execPromise = util.promisify(exec);

  try {
    await execPromise(command, {
      cwd: workspaceRoot,
      timeout: 60000, // 60 second timeout
    });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Read task content including sub-bullets from tasks.md
 */
export function extractTaskContent(
  taskId: string,
  tasksFilePath: string
): { taskLine: string; subLines: string[] } {
  if (!fs.existsSync(tasksFilePath)) {
    return { taskLine: "", subLines: [] };
  }

  const content = fs.readFileSync(tasksFilePath, "utf-8");
  const lines = content.split("\n");

  let taskLineIndex = -1;
  const taskRegex = new RegExp(
    `^\\s*- \\[[ x-]\\](\\*)?\\s+${taskId.replace(".", "\\.")}[.\\s]`
  );

  // Find the task line
  for (let i = 0; i < lines.length; i++) {
    if (taskRegex.test(lines[i])) {
      taskLineIndex = i;
      break;
    }
  }

  if (taskLineIndex === -1) {
    return { taskLine: "", subLines: [] };
  }

  const taskLine = lines[taskLineIndex];
  const subLines: string[] = [];

  // Extract indented sub-bullets until next task or empty section
  const taskIndent = taskLine.search(/\S/);
  for (let i = taskLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineIndent = line.search(/\S/);

    // Stop if we hit another task at same or lower indentation
    if (line.match(/^\s*- \[[ x-]\](\*)?\s+\d+/) && lineIndent <= taskIndent) {
      break;
    }

    // Stop if we hit a new section header
    if (line.match(/^##?\s+/)) {
      break;
    }

    // Include if it's indented more than the task
    if (lineIndent > taskIndent) {
      subLines.push(line);
    } else if (line.trim() === "" && subLines.length > 0) {
      // Stop at empty line after we've collected some sub-lines
      break;
    }
  }

  return { taskLine, subLines };
}

/**
 * Validate if a task's success criteria are already met
 * Returns validation result indicating if task is already complete
 */
export async function validateTaskCompletion(
  task: ParsedTask,
  workspaceRoot: string,
  tasksFilePath: string
): Promise<TaskValidationResult> {
  const detectedConditions: string[] = [];
  const missingConditions: string[] = [];

  // Extract task content with sub-bullets
  const { taskLine, subLines } = extractTaskContent(task.id, tasksFilePath);
  const allLines = [taskLine, ...subLines];

  // Parse success criteria
  const criteria = parseSuccessCriteria(taskLine, allLines);

  if (criteria.length === 0) {
    // No explicit success criteria, cannot auto-validate
    return {
      alreadyComplete: false,
      reason: "No success criteria defined for validation",
      detectedConditions: [],
      missingConditions: [],
    };
  }

  // Check each criterion
  for (const criterion of criteria) {
    switch (criterion.type) {
      case "file-exists": {
        const files = criterion.validation.split(",").map((f) => f.trim());
        const result = checkFilesExist(files, workspaceRoot);
        if (result.exists) {
          detectedConditions.push(`Files exist: ${result.found.join(", ")}`);
        } else {
          missingConditions.push(`Missing files: ${result.missing.join(", ")}`);
        }
        break;
      }

      case "command-runs":
      case "build-passes":
      case "test-passes":
      case "lint-passes": {
        const result = await checkCommandRuns(
          criterion.validation,
          workspaceRoot
        );
        if (result.success) {
          detectedConditions.push(`Command succeeds: ${criterion.validation}`);
        } else {
          missingConditions.push(
            `Command fails: ${criterion.validation} - ${result.error}`
          );
        }
        break;
      }

      case "custom": {
        // For custom criteria, we can't auto-validate
        missingConditions.push(
          `Custom criteria requires manual validation: ${criterion.description}`
        );
        break;
      }
    }
  }

  // Task is complete if all criteria are met
  const alreadyComplete =
    criteria.length > 0 &&
    missingConditions.length === 0 &&
    detectedConditions.length === criteria.length;

  return {
    alreadyComplete,
    reason: alreadyComplete
      ? `All ${criteria.length} success criteria are met`
      : `${missingConditions.length} of ${criteria.length} criteria not met`,
    detectedConditions,
    missingConditions,
  };
}
