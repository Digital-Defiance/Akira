/**
 * Execution Engine for Autonomous Execution
 * Executes task actions including file operations, commands, and LLM generation
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import * as vscode from "vscode";
import { StorageLayer } from "./storage-layer";
import { getEventBus } from "./event-bus";
import { LLMIntegrator } from "./llm-integrator";
import {
  ExecutionPlan,
  ExecutionAction,
  ExecutionResult,
  ApprovalRequest,
  ApprovalResult,
  TaskRecord,
} from "./types";

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: process.env.NODE_ENV === "test" ? 1 : 1000,
  maxDelayMs: process.env.NODE_ENV === "test" ? 10 : 8000,
  backoffMultiplier: 2,
};

/**
 * Execution Engine handles task execution
 */
export class ExecutionEngine {
  private storage: StorageLayer;
  private llmIntegrator: LLMIntegrator;
  private workspaceRoot: string;
  private requireApprovalForDestructive: boolean;
  private maxFileModifications: number;
  private fileModificationCount: number = 0;
  private outputChannel: vscode.OutputChannel | null = null;

  constructor(
    workspaceRoot: string,
    options: {
      requireApprovalForDestructive?: boolean;
      maxFileModifications?: number;
      outputChannel?: vscode.OutputChannel;
    } = {}
  ) {
    this.workspaceRoot = workspaceRoot;
    this.storage = new StorageLayer(workspaceRoot);
    this.llmIntegrator = new LLMIntegrator();
    this.requireApprovalForDestructive = options.requireApprovalForDestructive ?? true;
    this.maxFileModifications = options.maxFileModifications ?? 50;
    this.outputChannel = options.outputChannel ?? null;
  }

  /**
   * Execute a plan for a task
   */
  async executePlan(
    plan: ExecutionPlan,
    sessionId: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const filesModified: string[] = [];
    const filesCreated: string[] = [];
    const commandsRun: string[] = [];

    this.log(`Executing plan for task ${plan.taskId} with ${plan.actions.length} actions`);

    for (const action of plan.actions) {
      try {
        // Check for destructive operations
        if (action.destructive && this.requireApprovalForDestructive) {
          const approval = await this.requestApproval({
            sessionId,
            taskId: plan.taskId,
            operation: action.type,
            description: `${action.type}: ${action.target}`,
            files: action.target ? [action.target] : undefined,
          });

          if (!approval.approved) {
            return {
              success: false,
              taskId: plan.taskId,
              error: `Operation rejected: ${approval.reason || "User denied"}`,
              duration: Date.now() - startTime,
            };
          }
        }

        // Check file modification limits
        if (action.type === "file-write" || action.type === "file-delete") {
          if (this.fileModificationCount >= this.maxFileModifications) {
            return {
              success: false,
              taskId: plan.taskId,
              error: `File modification limit reached (${this.maxFileModifications})`,
              duration: Date.now() - startTime,
            };
          }
        }

        // Execute the action
        const result = await this.executeAction(action);

        if (!result.success) {
          return {
            success: false,
            taskId: plan.taskId,
            error: result.error,
            filesModified,
            filesCreated,
            commandsRun,
            duration: Date.now() - startTime,
          };
        }

        // Track modifications
        if (action.type === "file-write") {
          const existed = await this.storage.exists(action.target);
          if (existed) {
            filesModified.push(action.target);
          } else {
            filesCreated.push(action.target);
          }
          this.fileModificationCount++;
        } else if (action.type === "command") {
          commandsRun.push(action.command || action.target);
        }
      } catch (error) {
        return {
          success: false,
          taskId: plan.taskId,
          error: error instanceof Error ? error.message : String(error),
          filesModified,
          filesCreated,
          commandsRun,
          duration: Date.now() - startTime,
        };
      }
    }

    return {
      success: true,
      taskId: plan.taskId,
      filesModified,
      filesCreated,
      commandsRun,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: ExecutionAction
  ): Promise<{ success: boolean; error?: string }> {
    switch (action.type) {
      case "file-write":
        return this.executeFileWrite(action);

      case "file-delete":
        return this.executeFileDelete(action);

      case "command":
        return this.executeCommand(action);

      case "llm-generate":
        return this.executeLLMGenerate(action);

      default:
        return {
          success: false,
          error: `Unknown action type: ${action.type}`,
        };
    }
  }

  /**
   * Execute a file write action
   */
  private async executeFileWrite(
    action: ExecutionAction
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!action.content) {
        return { success: false, error: "No content provided for file write" };
      }

      const fullPath = this.resolvePath(action.target);
      await this.storage.ensureDir(path.dirname(fullPath));
      await this.storage.writeFileAtomic(fullPath, action.content);

      this.log(`File written: ${action.target}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Execute a file delete action
   */
  private async executeFileDelete(
    action: ExecutionAction
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const fullPath = this.resolvePath(action.target);
      await fs.promises.unlink(fullPath);

      this.log(`File deleted: ${action.target}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Execute a command action with retries
   */
  private async executeCommand(
    action: ExecutionAction,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<{ success: boolean; error?: string }> {
    const command = action.command || action.target;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelayMs
        );
        this.log(`Retrying command (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}) after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const result = await this.runCommand(command, action.args);

        if (result.success) {
          this.log(`Command succeeded: ${command}`);
          return { success: true };
        }

        lastError = result.error;

        // Don't retry on non-transient errors
        if (result.exitCode === 1 || result.exitCode === 127) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      success: false,
      error: `Command failed after ${retryConfig.maxRetries + 1} attempts: ${lastError}`,
    };
  }

  /**
   * Run a command and return result
   */
  private runCommand(
    command: string,
    args?: string[]
  ): Promise<{ success: boolean; exitCode: number; output?: string; error?: string }> {
    return new Promise((resolve) => {
      const cmdArgs = args || [];
      const fullCommand = cmdArgs.length > 0 ? `${command} ${cmdArgs.join(" ")}` : command;

      this.log(`Running command: ${fullCommand}`);

      const proc = spawn(command, cmdArgs, {
        cwd: this.workspaceRoot,
        shell: true,
        timeout: 300000, // 5 minute timeout
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        this.log(text.trim());
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        this.log(`[stderr] ${text.trim()}`);
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          exitCode: code || 0,
          output: stdout,
          error: stderr || undefined,
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
   * Execute LLM generation action
   */
  private async executeLLMGenerate(
    action: ExecutionAction
  ): Promise<{ success: boolean; error?: string }> {
    // This is a simplified stub for basic LLM actions
    // For full LLM integration, use generateWithLLM method instead
    this.log(`LLM generation requested for: ${action.target}`);
    
    return {
      success: false,
      error: "LLM generation not yet implemented - use generateWithLLM method",
    };
  }

  /**
   * Generate execution plan using LLM
   */
  async generateWithLLM(
    task: TaskRecord,
    context: {
      specPath: string;
      sessionId: string;
      phase: number;
      previousTasks: TaskRecord[];
    }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Use LLM integrator to generate actions
      const result = await this.llmIntegrator.generateActions({
        task,
        context,
      });

      if (!result.success) {
        return {
          success: false,
          taskId: task.id,
          error: result.error || "LLM generation failed",
          duration: Date.now() - startTime,
        };
      }

      // Execute the generated actions
      const plan: ExecutionPlan = {
        taskId: task.id,
        actions: result.actions,
      };

      return await this.executePlan(plan, context.sessionId);
    } catch (error) {
      return {
        success: false,
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Request approval for destructive operation
   */
  private async requestApproval(
    request: ApprovalRequest
  ): Promise<ApprovalResult> {
    await getEventBus().emit("approvalRequired", request.sessionId, {
      taskId: request.taskId,
      operation: request.operation,
      description: request.description,
    });

    // Show VS Code dialog
    const action = await vscode.window.showWarningMessage(
      `⚠️ Destructive operation requested:\n${request.description}`,
      { modal: true },
      "Approve",
      "Deny"
    );

    return {
      approved: action === "Approve",
      reason: action !== "Approve" ? "User denied operation" : undefined,
    };
  }

  /**
   * Resolve a path relative to workspace
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceRoot, filePath);
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(message);
    }
    console.log(`[ExecutionEngine] ${message}`);
  }

  /**
   * Reset file modification count
   */
  resetModificationCount(): void {
    this.fileModificationCount = 0;
  }

  /**
   * Get current modification count
   */
  getModificationCount(): number {
    return this.fileModificationCount;
  }
}
