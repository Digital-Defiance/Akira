/**
 * Decision Engine for Autonomous Execution
 * Evaluates tasks to determine if execution is needed
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import {
  TaskRecord,
  DecisionResult,
  SuccessCriteria,
  DetailedEvaluation,
  CriterionResult,
  ExecutionResult,
} from "./types";

/**
 * File existence check result
 */
interface FileCheckResult {
  exists: boolean;
  path: string;
  size?: number;
}

/**
 * Command execution result
 */
interface CommandCheckResult {
  success: boolean;
  exitCode: number;
  output?: string;
  error?: string;
}

/**
 * Decision Engine evaluates tasks for completion
 */
export class DecisionEngine {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Evaluate task with detailed per-criterion results
   * Used by reflection loop for comprehensive evaluation
   */
  async evaluateWithDetails(
    task: TaskRecord,
    executionResult?: ExecutionResult
  ): Promise<DetailedEvaluation> {
    const criteria = task.successCriteria || [];

    if (criteria.length === 0) {
      return {
        confidence: 0,
        reasoning: "No success criteria defined for auto-detection",
        detected: false,
        provider: "heuristic",
        criteriaResults: [],
        missingElements: ["Success criteria not defined"],
        suggestions: [
          "Define success criteria for the task",
          "Add file-exists, command-runs, or test-passes criteria",
        ],
      };
    }

    const criteriaResults: CriterionResult[] = [];
    const missingElements: string[] = [];

    // Evaluate each criterion
    for (const criterion of criteria) {
      const result = await this.checkCriterion(criterion);
      
      // Build evidence from execution result if available
      let evidence: string | undefined;
      if (executionResult) {
        if (criterion.type === "file-exists" && executionResult.filesCreated) {
          const relevantFiles = executionResult.filesCreated.filter(f => 
            f.includes(criterion.validation) || criterion.validation.includes(f)
          );
          if (relevantFiles.length > 0) {
            evidence = `Files created: ${relevantFiles.join(", ")}`;
          }
        } else if (criterion.type.includes("command") || criterion.type.includes("passes")) {
          if (executionResult.commandsRun) {
            const relevantCommands = executionResult.commandsRun.filter(cmd =>
              cmd.includes(criterion.validation) || criterion.validation.includes(cmd)
            );
            if (relevantCommands.length > 0) {
              evidence = `Commands executed: ${relevantCommands.join(", ")}`;
            }
          }
        }
      }

      criteriaResults.push({
        criterion,
        met: result.met,
        reason: result.reason,
        evidence,
      });

      // Track missing elements
      if (!result.met) {
        missingElements.push(`${criterion.type}: ${criterion.validation}`);
      }
    }

    // Calculate confidence
    const metCount = criteriaResults.filter((r) => r.met).length;
    const confidence = metCount / criteria.length;

    // Build reasoning
    const reasoning = criteriaResults
      .map((r) => `${r.met ? "✓" : "✗"} ${r.criterion.type}: ${r.reason}`)
      .join("; ");

    // Generate suggestions based on unmet criteria
    const suggestions = this.generateSuggestions(criteriaResults, executionResult);

    return {
      confidence,
      reasoning,
      detected: confidence >= 0.8,
      provider: "heuristic",
      criteriaResults,
      missingElements,
      suggestions,
    };
  }

  /**
   * Generate suggestions based on evaluation results
   */
  private generateSuggestions(
    criteriaResults: CriterionResult[],
    executionResult?: ExecutionResult
  ): string[] {
    const suggestions: string[] = [];
    const unmetCriteria = criteriaResults.filter((r) => !r.met);

    for (const result of unmetCriteria) {
      const { criterion } = result;

      switch (criterion.type) {
        case "file-exists":
          suggestions.push(
            `Create or verify file: ${criterion.validation}`,
            `Check file path is correct relative to workspace root`
          );
          break;

        case "command-runs":
          suggestions.push(
            `Ensure command can execute: ${criterion.validation}`,
            `Check command dependencies are installed`
          );
          break;

        case "build-passes":
          suggestions.push(
            `Fix build errors before proceeding`,
            `Review build output for specific issues`,
            `Verify all source files are syntactically correct`
          );
          break;

        case "test-passes":
          suggestions.push(
            `Fix failing tests`,
            `Review test output for assertion failures`,
            `Ensure test dependencies are available`
          );
          break;

        case "lint-passes":
          suggestions.push(
            `Fix linting errors`,
            `Run linter to see specific issues`,
            `Update code to match style guidelines`
          );
          break;

        case "custom":
          suggestions.push(
            `Manually verify custom criterion: ${criterion.description}`,
            `Review task requirements for completion criteria`
          );
          break;
      }
    }

    // Add execution-specific suggestions
    if (executionResult?.error) {
      suggestions.push(
        `Address execution error: ${executionResult.error}`,
        `Review error message for root cause`
      );
    }

    // Deduplicate suggestions
    return [...new Set(suggestions)];
  }

  /**
   * Evaluate if a task needs execution
   */
  async evaluateTask(
    task: TaskRecord,
    successCriteria?: SuccessCriteria[]
  ): Promise<DecisionResult> {
    const criteria = successCriteria || task.successCriteria || [];

    if (criteria.length === 0) {
      // No criteria defined - cannot auto-detect
      return {
        confidence: 0,
        reasoning: "No success criteria defined for auto-detection",
        detected: false,
        provider: "heuristic",
      };
    }

    const results: { criterion: SuccessCriteria; met: boolean; reason: string }[] = [];

    for (const criterion of criteria) {
      const result = await this.checkCriterion(criterion);
      results.push({
        criterion,
        met: result.met,
        reason: result.reason,
      });
    }

    // Calculate confidence based on met criteria
    const metCount = results.filter((r) => r.met).length;
    const confidence = metCount / criteria.length;

    // Build reasoning
    const reasoning = results
      .map((r) => `${r.met ? "✓" : "✗"} ${r.criterion.type}: ${r.reason}`)
      .join("; ");

    return {
      confidence,
      reasoning,
      detected: confidence >= 0.8,
      provider: "heuristic",
    };
  }

  /**
   * Check a single success criterion
   */
  private async checkCriterion(
    criterion: SuccessCriteria
  ): Promise<{ met: boolean; reason: string }> {
    switch (criterion.type) {
      case "file-exists":
        return this.checkFileExists(criterion.validation);

      case "command-runs":
      case "build-passes":
      case "test-passes":
      case "lint-passes":
        return this.checkCommandRuns(criterion.validation);

      case "custom":
        return {
          met: false,
          reason: "Custom criteria requires manual validation",
        };

      default:
        return {
          met: false,
          reason: `Unknown criterion type: ${criterion.type}`,
        };
    }
  }

  /**
   * Check if files exist
   */
  private async checkFileExists(
    validation: string
  ): Promise<{ met: boolean; reason: string }> {
    const filePaths = validation.split(",").map((p) => p.trim());
    const results: FileCheckResult[] = [];

    for (const filePath of filePaths) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workspaceRoot, filePath);

      try {
        const stats = await fs.promises.stat(fullPath);
        results.push({
          exists: true,
          path: filePath,
          size: stats.size,
        });
      } catch {
        results.push({
          exists: false,
          path: filePath,
        });
      }
    }

    const allExist = results.every((r) => r.exists);
    const existingFiles = results.filter((r) => r.exists).map((r) => r.path);
    const missingFiles = results.filter((r) => !r.exists).map((r) => r.path);

    if (allExist) {
      return {
        met: true,
        reason: `All files exist: ${existingFiles.join(", ")}`,
      };
    } else {
      return {
        met: false,
        reason: `Missing files: ${missingFiles.join(", ")}`,
      };
    }
  }

  /**
   * Check if a command runs successfully
   */
  private async checkCommandRuns(
    command: string
  ): Promise<{ met: boolean; reason: string }> {
    try {
      const result = await this.runCommand(command, 30000); // 30s timeout
      
      if (result.success) {
        return {
          met: true,
          reason: `Command succeeded: ${command}`,
        };
      } else {
        return {
          met: false,
          reason: `Command failed (exit ${result.exitCode}): ${result.error || ""}`,
        };
      }
    } catch (error) {
      return {
        met: false,
        reason: `Command error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Run a command and return the result
   */
  private runCommand(
    command: string,
    timeout: number = 60000
  ): Promise<CommandCheckResult> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(/\s+/);
      
      const proc = spawn(cmd, args, {
        cwd: this.workspaceRoot,
        shell: true,
        timeout,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          output: stdout,
          error: stderr,
        });
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          exitCode: -1,
          error: error.message,
        });
      });
    });
  }

  /**
   * Parse success criteria from task description
   */
  parseSuccessCriteriaFromDescription(
    description: string
  ): SuccessCriteria[] {
    const criteria: SuccessCriteria[] = [];

    // Look for file patterns
    const filePattern = /(?:create|add|implement|file)[:\s]+([^\s,]+(?:\.[a-z]+))/gi;
    let match;
    while ((match = filePattern.exec(description)) !== null) {
      criteria.push({
        type: "file-exists",
        description: `File should exist: ${match[1]}`,
        validation: match[1],
      });
    }

    // Look for command patterns
    const cmdPatterns = [
      { pattern: /npm\s+run\s+build/gi, type: "build-passes" as const },
      { pattern: /npm\s+test/gi, type: "test-passes" as const },
      { pattern: /npm\s+run\s+lint/gi, type: "lint-passes" as const },
      { pattern: /`([^`]+)`/g, type: "command-runs" as const },
    ];

    for (const { pattern, type } of cmdPatterns) {
      while ((match = pattern.exec(description)) !== null) {
        const cmd = match[1] || match[0];
        if (!criteria.some((c) => c.validation === cmd)) {
          criteria.push({
            type,
            description: `Command should succeed: ${cmd}`,
            validation: cmd,
          });
        }
      }
    }

    return criteria;
  }

  /**
   * Analyze task content for success criteria
   */
  analyzeTaskForCriteria(
    taskLine: string,
    subLines: string[]
  ): SuccessCriteria[] {
    const criteria: SuccessCriteria[] = [];
    let inCriteriaSection = false;

    for (const line of [taskLine, ...subLines]) {
      const trimmed = line.trim();

      // Check if we're entering success criteria section
      if (trimmed.toLowerCase().includes("success criteria:")) {
        inCriteriaSection = true;
        continue;
      }

      // Parse criteria lines
      if (inCriteriaSection && trimmed.startsWith("-")) {
        const criterionText = trimmed.substring(1).trim();
        const parsed = this.parseCriterionText(criterionText);
        if (parsed) {
          criteria.push(parsed);
        }
      }

      // Also parse from description
      const descriptionCriteria = this.parseSuccessCriteriaFromDescription(line);
      criteria.push(...descriptionCriteria);
    }

    // Deduplicate
    const uniqueCriteria: SuccessCriteria[] = [];
    for (const c of criteria) {
      if (!uniqueCriteria.some((u) => u.validation === c.validation && u.type === c.type)) {
        uniqueCriteria.push(c);
      }
    }

    return uniqueCriteria;
  }

  /**
   * Parse a criterion text line
   */
  private parseCriterionText(text: string): SuccessCriteria | null {
    const lower = text.toLowerCase();

    // File patterns
    if (lower.includes("file") || lower.includes("exist")) {
      const fileMatch = text.match(/([a-zA-Z0-9_\-./]+\.[a-z]+)/i);
      if (fileMatch) {
        return {
          type: "file-exists",
          description: text,
          validation: fileMatch[1],
        };
      }
    }

    // Build patterns
    if (lower.includes("build")) {
      const cmdMatch = text.match(/`([^`]+)`/);
      return {
        type: "build-passes",
        description: text,
        validation: cmdMatch ? cmdMatch[1] : "npm run build",
      };
    }

    // Test patterns
    if (lower.includes("test")) {
      const cmdMatch = text.match(/`([^`]+)`/);
      return {
        type: "test-passes",
        description: text,
        validation: cmdMatch ? cmdMatch[1] : "npm test",
      };
    }

    // Lint patterns
    if (lower.includes("lint")) {
      const cmdMatch = text.match(/`([^`]+)`/);
      return {
        type: "lint-passes",
        description: text,
        validation: cmdMatch ? cmdMatch[1] : "npm run lint",
      };
    }

    // Command patterns
    const cmdMatch = text.match(/`([^`]+)`/);
    if (cmdMatch) {
      return {
        type: "command-runs",
        description: text,
        validation: cmdMatch[1],
      };
    }

    return null;
  }
}
