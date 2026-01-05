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
import { DecisionEngine } from "./decision-engine";
import {
  ExecutionPlan,
  ExecutionAction,
  ExecutionResult,
  ApprovalRequest,
  ApprovalResult,
  TaskRecord,
  FailureContext,
  AttemptRecord,
  ReflectionOptions,
  ReflectionConfig,
  FailurePattern,
  EnvironmentState,
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
 * Default reflection configuration
 */
const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = {
  enabled: true,
  maxIterations: 3,
  confidenceThreshold: 0.8,
  enablePatternDetection: true,
  pauseOnPersistentFailure: true,
  persistentFailureThreshold: 2,
};

/**
 * Execution Engine handles task execution
 */
export class ExecutionEngine {
  private storage: StorageLayer;
  private llmIntegrator: LLMIntegrator;
  private decisionEngine: DecisionEngine;
  private workspaceRoot: string;
  private requireApprovalForDestructive: boolean;
  private maxFileModifications: number;
  private fileModificationCount: number = 0;
  private outputChannel: vscode.OutputChannel | null = null;
  private reflectionConfig: ReflectionConfig;

  constructor(
    workspaceRoot: string,
    options: {
      requireApprovalForDestructive?: boolean;
      maxFileModifications?: number;
      outputChannel?: vscode.OutputChannel;
      reflectionConfig?: Partial<ReflectionConfig>;
    } = {}
  ) {
    this.workspaceRoot = workspaceRoot;
    this.storage = new StorageLayer(workspaceRoot);
    this.llmIntegrator = new LLMIntegrator();
    this.decisionEngine = new DecisionEngine(workspaceRoot);
    this.requireApprovalForDestructive = options.requireApprovalForDestructive ?? true;
    this.maxFileModifications = options.maxFileModifications ?? 50;
    this.outputChannel = options.outputChannel ?? null;
    
    // Validate and merge reflection configuration with defaults
    this.reflectionConfig = this.validateReflectionConfig({
      ...DEFAULT_REFLECTION_CONFIG,
      ...options.reflectionConfig,
    });
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

        // Check if file exists BEFORE executing the action
        let fileExistedBefore = false;
        if (action.type === "file-write") {
          fileExistedBefore = await this.storage.exists(action.target);
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
          if (fileExistedBefore) {
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
   * Classify an error as transient or strategic
   * Transient errors should use standard retry logic
   * Strategic errors should use reflection loop
   */
  private isTransientError(error: {
    exitCode?: number;
    error?: string;
    type?: string;
  }): boolean {
    // Network-related errors are transient
    if (error.error) {
      const errorMsg = error.error.toLowerCase();
      
      // Network timeouts and connection issues
      if (
        errorMsg.includes("timeout") ||
        errorMsg.includes("econnrefused") ||
        errorMsg.includes("econnreset") ||
        errorMsg.includes("enetunreach") ||
        errorMsg.includes("ehostunreach") ||
        errorMsg.includes("etimedout")
      ) {
        return true;
      }

      // File lock errors
      if (
        errorMsg.includes("ebusy") ||
        errorMsg.includes("locked") ||
        errorMsg.includes("file is in use")
      ) {
        return true;
      }

      // Temporary resource unavailability
      if (
        errorMsg.includes("eagain") ||
        errorMsg.includes("ewouldblock") ||
        errorMsg.includes("resource temporarily unavailable")
      ) {
        return true;
      }

      // Rate limiting
      if (
        errorMsg.includes("rate limit") ||
        errorMsg.includes("too many requests") ||
        errorMsg.includes("429")
      ) {
        return true;
      }
    }

    // Exit codes indicating transient issues
    if (error.exitCode !== undefined) {
      // Exit code 0 = success (not an error)
      // Exit code 1 = general error (strategic - wrong approach)
      // Exit code 2 = misuse of shell command (strategic)
      // Exit code 126 = command cannot execute (strategic - permissions)
      // Exit code 127 = command not found (strategic - missing dependency)
      // Exit code 130 = terminated by Ctrl+C (transient - user interrupt)
      // Exit code 137 = killed by SIGKILL (transient - OOM or system)
      // Exit code 143 = terminated by SIGTERM (transient - system)
      
      const transientExitCodes = [130, 137, 143];
      if (transientExitCodes.includes(error.exitCode)) {
        return true;
      }
    }

    // Default to strategic (use reflection)
    return false;
  }

  /**
   * Execute a command action with retries
   */
  private async executeCommand(
    action: ExecutionAction,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<{ success: boolean; error?: string; retryExhausted?: boolean; retryAttempts?: number; mechanism?: string }> {
    const command = action.command || action.target;
    let lastError: string | undefined;
    let retryAttempts = 0;
    let usedRetryMechanism = false;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      retryAttempts = attempt + 1;
      
      if (attempt > 0) {
        usedRetryMechanism = true;
        const delay = Math.min(
          retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelayMs
        );
        this.log(`Retrying command (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}) after ${delay}ms - using standard retry mechanism`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const result = await this.runCommand(command, action.args);

        if (result.success) {
          if (usedRetryMechanism) {
            this.log(`Command succeeded: ${command} (after ${retryAttempts} attempts using standard retry)`);
          } else {
            this.log(`Command succeeded: ${command}`);
          }
          return { 
            success: true,
            retryExhausted: false,
            retryAttempts,
            mechanism: usedRetryMechanism ? "standard-retry" : "none"
          };
        }

        lastError = result.error;
        // Check if this is a transient error that should be retried
        const isTransient = this.isTransientError({
          exitCode: result.exitCode,
          error: result.error,
        });

        if (!isTransient) {
          // Strategic error - don't retry, let reflection handle it
          this.log(`Strategic error detected (exit code ${result.exitCode}), stopping retry - would use reflection mechanism`);
          return {
            success: false,
            error: `Command failed with strategic error: ${lastError}`,
            retryExhausted: false,
            retryAttempts,
            mechanism: "strategic-error"
          };
        }

        this.log(`Transient error detected (exit code ${result.exitCode}), will retry`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        // Check if the exception itself is transient
        const isTransient = this.isTransientError({
          error: lastError,
        });

        if (!isTransient) {
          this.log(`Strategic error detected in exception, stopping retry - would use reflection mechanism`);
          return {
            success: false,
            error: `Command failed with strategic error: ${lastError}`,
            retryExhausted: false,
            retryAttempts,
            mechanism: "strategic-error"
          };
        }
      }
    }

    // Retries exhausted
    this.log(`Command failed after exhausting ${retryAttempts} retry attempts - retry mechanism exhausted, would handoff to reflection`);
    return {
      success: false,
      error: `Command failed after ${retryConfig.maxRetries + 1} attempts: ${lastError}`,
      retryExhausted: true,
      retryAttempts,
      mechanism: "retry-exhausted"
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
    },
    failureContext?: FailureContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Use LLM integrator to generate actions
      const result = await this.llmIntegrator.generateActions({
        task,
        context,
        failureContext,
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
   * Execute a task with reflection: execute → evaluate → re-plan if needed
   */
  async executeWithReflection(
    task: TaskRecord,
    context: {
      specPath: string;
      sessionId: string;
      phase: number;
      previousTasks: TaskRecord[];
    },
    options: ReflectionOptions = {}
  ): Promise<ExecutionResult> {
    // Merge options with stored configuration, with options taking precedence
    const maxIterations = options.maxIterations ?? this.reflectionConfig.maxIterations;
    const confidenceThreshold = options.confidenceThreshold ?? this.reflectionConfig.confidenceThreshold;
    const enabled = options.enabled ?? this.reflectionConfig.enabled;
    const persistentFailureThreshold = options.persistentFailureThreshold ?? this.reflectionConfig.persistentFailureThreshold;
    const pauseOnPersistentFailure = options.pauseOnPersistentFailure ?? this.reflectionConfig.pauseOnPersistentFailure;
    let userGuidance = options.userGuidance;

    // If reflection is disabled, fall back to single execution
    if (!enabled) {
      this.log(`Reflection disabled, executing task ${task.id} once`);
      return await this.generateWithLLM(task, context);
    }

    const startTime = Date.now();
    const previousAttempts: AttemptRecord[] = [];
    let lastResult: ExecutionResult | null = null;
    let cumulativeEnvironmentState: EnvironmentState = {
      filesCreated: [],
      filesModified: [],
      commandOutputs: new Map<string, string>(),
      workingDirectoryState: [],
    };

    this.log(`Starting reflection loop for task ${task.id} (max ${maxIterations} iterations)`);

    // Emit reflection started event
    await getEventBus().emit("reflectionStarted", context.sessionId, {
      taskId: task.id,
      maxIterations,
      confidenceThreshold,
    });

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      this.log(`Reflection iteration ${iteration}/${maxIterations} for task ${task.id}`);

      // Check for persistent failure before continuing
      if (iteration > 1 && pauseOnPersistentFailure) {
        const patterns = this.detectFailurePatterns(previousAttempts);
        const persistentPattern = patterns.find(
          p => p.occurrences >= persistentFailureThreshold
        );

        if (persistentPattern) {
          this.log(
            `Persistent failure detected: "${persistentPattern.errorMessage}" ` +
              `occurred ${persistentPattern.occurrences} times`
          );

          // Request user guidance
          const guidance = await this.requestUserGuidance(
            task,
            previousAttempts,
            persistentPattern
          );

          if (guidance) {
            userGuidance = guidance;
            this.log(`User provided guidance: ${guidance}`);
          } else {
            // User chose to skip or stop
            this.log(`User chose not to provide guidance, stopping reflection loop`);
            
            // Emit reflection completed event with failure
            await getEventBus().emit("reflectionCompleted", context.sessionId, {
              taskId: task.id,
              success: false,
              iterationsUsed: iteration - 1,
              maxIterations,
              reason: "User chose to stop after persistent failure",
              duration: Date.now() - startTime,
            });
            
            return {
              success: false,
              taskId: task.id,
              error: `Persistent failure detected and user chose to stop: ${persistentPattern.errorMessage}`,
              filesModified: lastResult?.filesModified,
              filesCreated: lastResult?.filesCreated,
              commandsRun: lastResult?.commandsRun,
              duration: Date.now() - startTime,
            };
          }
        }
      }

      // Build failure context from previous attempts (only if there are previous attempts)
      const failureContext: FailureContext | undefined =
        previousAttempts.length > 0
          ? {
              iteration,
              previousAttempts: [...previousAttempts], // Create a copy to avoid mutation
              failurePatterns: this.detectFailurePatterns(previousAttempts),
              environmentState: { ...cumulativeEnvironmentState },
              userGuidance,
            }
          : userGuidance
          ? {
              iteration,
              previousAttempts: [],
              failurePatterns: [],
              environmentState: { ...cumulativeEnvironmentState },
              userGuidance,
            }
          : undefined;

      // Generate and execute plan with failure context
      const result = await this.generateWithLLM(task, context, failureContext);
      lastResult = result;

      // Update cumulative environment state
      if (result.filesCreated) {
        cumulativeEnvironmentState.filesCreated.push(...result.filesCreated);
      }
      if (result.filesModified) {
        cumulativeEnvironmentState.filesModified.push(...result.filesModified);
      }

      // Evaluate task completion after execution
      const evaluation = await this.decisionEngine.evaluateTask(task);

      // Record this attempt AFTER execution and evaluation
      const attemptRecord: AttemptRecord = {
        iteration,
        timestamp: new Date().toISOString(),
        actions: [], // Actions would be extracted from the execution plan
        result,
        evaluationReason: evaluation.reasoning,
        confidence: evaluation.confidence,
      };
      previousAttempts.push(attemptRecord);

      // Log iteration details
      this.log(
        `Iteration ${iteration} result: ${result.success ? "success" : "failed"}, ` +
          `evaluation confidence: ${evaluation.confidence.toFixed(2)}`
      );

      // Emit reflection iteration event
      await getEventBus().emit("reflectionIteration", context.sessionId, {
        taskId: task.id,
        iteration,
        maxIterations,
        success: result.success,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
      });

      // Check if task is complete based on confidence threshold
      if (evaluation.detected && evaluation.confidence >= confidenceThreshold) {
        this.log(
          `Task ${task.id} completed successfully after ${iteration} iteration(s) ` +
            `with confidence ${evaluation.confidence.toFixed(2)}`
        );
        
        // Emit reflection completed event with success
        await getEventBus().emit("reflectionCompleted", context.sessionId, {
          taskId: task.id,
          success: true,
          iterationsUsed: iteration,
          maxIterations,
          finalConfidence: evaluation.confidence,
          duration: Date.now() - startTime,
        });
        
        return {
          ...result,
          duration: Date.now() - startTime,
        };
      }

      // Log why we're continuing
      if (iteration < maxIterations) {
        this.log(
          `Task ${task.id} not complete (confidence ${evaluation.confidence.toFixed(2)} < ${confidenceThreshold}), ` +
            `re-planning for iteration ${iteration + 1}`
        );
        this.log(`Evaluation reasoning: ${evaluation.reasoning}`);
      }
    }

    // Max iterations reached without success
    this.log(
      `Task ${task.id} exhausted ${maxIterations} iterations without reaching completion threshold`
    );

    // Emit reflection completed event with exhaustion
    await getEventBus().emit("reflectionCompleted", context.sessionId, {
      taskId: task.id,
      success: false,
      iterationsUsed: maxIterations,
      maxIterations,
      reason: "Max iterations exhausted",
      finalConfidence: previousAttempts[previousAttempts.length - 1]?.confidence,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      taskId: task.id,
      error: `Reflection loop exhausted after ${maxIterations} iterations. Last evaluation: ${
        previousAttempts[previousAttempts.length - 1]?.evaluationReason || "unknown"
      }`,
      filesModified: lastResult?.filesModified,
      filesCreated: lastResult?.filesCreated,
      commandsRun: lastResult?.commandsRun,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Detect failure patterns from previous attempts
   */
  private detectFailurePatterns(attempts: AttemptRecord[]): any[] {
    const patterns = new Map<string, { count: number; firstSeen: string; lastSeen: string }>();

    for (const attempt of attempts) {
      if (attempt.result.error) {
        const errorMsg = attempt.result.error;
        const existing = patterns.get(errorMsg);

        if (existing) {
          existing.count++;
          existing.lastSeen = attempt.timestamp;
        } else {
          patterns.set(errorMsg, {
            count: 1,
            firstSeen: attempt.timestamp,
            lastSeen: attempt.timestamp,
          });
        }
      }
    }

    return Array.from(patterns.entries()).map(([errorMessage, data]) => ({
      errorMessage,
      occurrences: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    }));
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
   * Request user guidance when persistent failure is detected
   */
  private async requestUserGuidance(
    task: TaskRecord,
    previousAttempts: AttemptRecord[],
    persistentPattern: FailurePattern
  ): Promise<string | undefined> {
    // Build summary of attempted approaches
    const approachesSummary = previousAttempts
      .map((attempt, idx) => {
        const approach = `Attempt ${idx + 1}: ${
          attempt.result.error || "Unknown error"
        }`;
        return approach;
      })
      .join("\n");

    // Show VS Code dialog
    const message =
      `⚠️ Task execution is stuck in a failure loop.\n\n` +
      `Task: ${task.title}\n` +
      `Error: ${persistentPattern.errorMessage}\n` +
      `Occurred: ${persistentPattern.occurrences} times\n\n` +
      `Attempted approaches:\n${approachesSummary}\n\n` +
      `Would you like to provide guidance for the next attempt?`;

    const action = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Provide Guidance",
      "Skip Task",
      "Stop Execution"
    );

    if (action === "Provide Guidance") {
      // Show input box for user guidance
      const guidance = await vscode.window.showInputBox({
        prompt: "Provide guidance for the next execution attempt",
        placeHolder: "e.g., Try using a different approach, check dependencies, etc.",
        ignoreFocusOut: true,
      });

      return guidance;
    }

    // User chose to skip or stop
    return undefined;
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

  /**
   * Validate and normalize reflection configuration
   */
  private validateReflectionConfig(config: ReflectionConfig): ReflectionConfig {
    // Validate maxIterations
    if (config.maxIterations < 1) {
      this.log(`Warning: maxIterations must be >= 1, using default value 3`);
      config.maxIterations = 3;
    }
    if (config.maxIterations > 10) {
      this.log(`Warning: maxIterations > 10 may be excessive, capping at 10`);
      config.maxIterations = 10;
    }

    // Validate confidenceThreshold
    if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
      this.log(`Warning: confidenceThreshold must be between 0 and 1, using default value 0.8`);
      config.confidenceThreshold = 0.8;
    }

    // Validate persistentFailureThreshold
    if (config.persistentFailureThreshold < 1) {
      this.log(`Warning: persistentFailureThreshold must be >= 1, using default value 2`);
      config.persistentFailureThreshold = 2;
    }

    return config;
  }

  /**
   * Get current reflection configuration
   */
  getReflectionConfig(): ReflectionConfig {
    return { ...this.reflectionConfig };
  }

  /**
   * Update reflection configuration
   */
  updateReflectionConfig(config: Partial<ReflectionConfig>): void {
    this.reflectionConfig = this.validateReflectionConfig({
      ...this.reflectionConfig,
      ...config,
    });
  }
}
