/**
 * Autonomous Executor
 * Main orchestrator for autonomous spec execution
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { SessionManager } from "./session-manager";
import { Scheduler } from "./scheduler";
import { DecisionEngine } from "./decision-engine";
import { ExecutionEngine } from "./execution-engine";
import { StorageLayer } from "./storage-layer";
import { ContextManager } from "./context-manager";
import { getEventBus, EventBus } from "./event-bus";
import {
  SessionState,
  TaskRecord,
  CheckboxState,
  ProgressInfo,
  ExecutionPlan,
} from "./types";
import { parseTasks, ParsedTask } from "../autonomous-executor";

/**
 * Configuration for autonomous execution
 */
export interface AutonomousConfig {
  maxConcurrentTasks: number;
  maxTasksPerSession: number;
  maxFileModifications: number;
  requireConfirmationForDestructiveOps: boolean;
  enableTaskDetection: boolean;
  enableLLM: boolean;
  phaseTimeout: number;
  checkpointRetention: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AutonomousConfig = {
  maxConcurrentTasks: 3,
  maxTasksPerSession: 100,
  maxFileModifications: 50,
  requireConfirmationForDestructiveOps: true,
  enableTaskDetection: true,
  enableLLM: true, // Enable LLM generation by default
  phaseTimeout: 600000, // 10 minutes
  checkpointRetention: 30, // days
};

/**
 * Autonomous Executor orchestrates the entire execution process
 */
export class AutonomousExecutor {
  private sessionManager: SessionManager;
  private scheduler: Scheduler;
  private decisionEngine: DecisionEngine;
  private executionEngine: ExecutionEngine;
  private storage: StorageLayer;
  private contextManager: ContextManager;
  private eventBus: EventBus;
  private config: AutonomousConfig;
  private outputChannel: vscode.OutputChannel | null = null;
  private statusBarItem: vscode.StatusBarItem | null = null;
  private currentSessionId: string | null = null;
  private eventUnsubscribers: Array<() => void> = [];

  constructor(
    private workspaceRoot: string,
    private specDirectory: string = ".akira/specs",
    config: Partial<AutonomousConfig> = {},
    outputChannel?: vscode.OutputChannel
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.outputChannel = outputChannel ?? null;
    this.eventBus = getEventBus();
    this.storage = new StorageLayer(workspaceRoot);
    
    this.sessionManager = new SessionManager(workspaceRoot, ".akira");
    this.scheduler = new Scheduler({ maxConcurrentTasks: this.config.maxConcurrentTasks });
    this.decisionEngine = new DecisionEngine(workspaceRoot);
    this.executionEngine = new ExecutionEngine(workspaceRoot, {
      requireApprovalForDestructive: this.config.requireConfirmationForDestructiveOps,
      maxFileModifications: this.config.maxFileModifications,
      outputChannel: outputChannel,
      reflectionConfig: {
        enabled: true,
        maxIterations: 3,
        confidenceThreshold: 0.8,
        enablePatternDetection: true,
        pauseOnPersistentFailure: true,
        persistentFailureThreshold: 2,
      },
    });
    this.contextManager = new ContextManager(workspaceRoot);

    // Set up scheduler executor
    this.scheduler.setExecutor(this.executeTask.bind(this));

    // Subscribe to events for UI updates
    this.setupEventHandlers();
  }

  /**
   * Start a new autonomous session for a feature
   */
  async startSession(featureName: string): Promise<string> {
    this.log(`Starting autonomous session for: ${featureName}`);

    // Load tasks from tasks.md
    const tasksPath = path.join(this.workspaceRoot, this.specDirectory, featureName, "tasks.md");
    if (!fs.existsSync(tasksPath)) {
      throw new Error(`Tasks file not found: ${tasksPath}`);
    }

    const tasksContent = fs.readFileSync(tasksPath, "utf-8");
    const parsedTasks = parseTasks(tasksContent, {});

    if (parsedTasks.length === 0) {
      throw new Error("No tasks found in tasks.md");
    }

    // Create session
    const sessionId = await this.sessionManager.createSession({
      featureName,
      workspaceRoot: this.workspaceRoot,
      specDirectory: this.specDirectory,
      ...this.config,
    });

    // Initialize context manager for this session
    await this.contextManager.initialize(sessionId);
    
    // Log session start in context
    await this.contextManager.addEntry({
      type: "system",
      content: `Session ${sessionId} started for feature: ${featureName}`,
      metadata: { featureName, taskCount: parsedTasks.length },
    });

    this.currentSessionId = sessionId;

    // Convert parsed tasks to TaskRecords and add to session
    const taskRecords = this.convertToTaskRecords(parsedTasks);
    await this.sessionManager.addTasks(sessionId, taskRecords);

    // Update status bar
    this.updateStatusBar(sessionId, featureName, 0, taskRecords.length);

    // Start processing
    await this.scheduler.startProcessing();

    // Enqueue non-optional incomplete tasks
    const tasksToExecute = taskRecords.filter(
      (t) => t.checkboxState === "PENDING" && !this.isOptionalTask(t.id)
    );
    this.scheduler.enqueueTasks(tasksToExecute, sessionId);

    this.log(`Session started: ${sessionId} with ${tasksToExecute.length} tasks`);

    return sessionId;
  }

  /**
   * Pause the current session
   */
  async pauseSession(sessionId?: string): Promise<void> {
    const sid = sessionId || this.currentSessionId;
    if (!sid) {
      throw new Error("No active session to pause");
    }

    this.log(`Pausing session: ${sid}`);

    await this.scheduler.stopProcessing();
    await this.sessionManager.setStatus(sid, "PAUSED");

    this.updateStatusBar(sid, "", 0, 0, "PAUSED");
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "PAUSED" && session.status !== "PAUSED_FOR_APPROVAL") {
      throw new Error(`Session is not paused: ${session.status}`);
    }

    this.log(`Resuming session: ${sessionId}`);
    this.currentSessionId = sessionId;

    await this.sessionManager.setStatus(sessionId, "RUNNING");

    // Re-enqueue pending tasks
    const pendingTasks = session.tasks.filter(
      (t) => t.checkboxState === "PENDING" && !this.isOptionalTask(t.id)
    );
    
    await this.scheduler.startProcessing();
    this.scheduler.enqueueTasks(pendingTasks, sessionId);

    this.updateStatusBar(
      sessionId,
      session.featureName,
      session.totalTasksCompleted,
      session.tasks.length
    );
  }

  /**
   * Stop the current session
   */
  async stopSession(sessionId?: string): Promise<void> {
    const sid = sessionId || this.currentSessionId;
    if (!sid) {
      throw new Error("No active session to stop");
    }

    this.log(`Stopping session: ${sid}`);

    this.scheduler.shutdown();
    
    const session = await this.sessionManager.getSession(sid);
    if (session) {
      const allComplete = session.tasks.every(
        (t) => t.checkboxState === CheckboxState.COMPLETE || this.isOptionalTask(t.id)
      );
      await this.sessionManager.setStatus(
        sid,
        allComplete ? "COMPLETED" : "PAUSED"
      );
    }

    this.currentSessionId = null;
    this.hideStatusBar();
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: TaskRecord,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    this.log(`Executing task: ${task.id} - ${task.title}`);

    try {
      // Update task status to in-progress
      await this.sessionManager.updateTask(sessionId, task.id, {
        checkboxState: CheckboxState.IN_PROGRESS,
      });

      // Check if task detection is enabled
      if (this.config.enableTaskDetection) {
        const decision = await this.decisionEngine.evaluateTask(task);
        
        // Log decision
        await this.sessionManager.logDecision(sessionId, task.id, decision);

        if (decision.detected && decision.confidence >= 0.8) {
          this.log(`Task ${task.id} already complete (confidence: ${decision.confidence})`);
          
          await this.sessionManager.markTaskComplete(sessionId, task.id);
          await this.updateTaskCheckbox(sessionId, task.id, CheckboxState.COMPLETE);
          
          return { success: true };
        }
      }

      // Build execution plan
      const plan = await this.buildExecutionPlan(task, sessionId);

      if (!plan) {
        // Session not found
        return { success: false, error: "Session not found" };
      }

      if (plan.actions.length === 0) {
        // No automated actions possible - need human intervention
        this.log(`Task ${task.id} requires manual implementation`);
        
        // Show guidance
        await this.showTaskGuidance(task, sessionId);
        
        // Keep task in progress for manual completion
        return { success: true };
      }

      // Execute with reflection loop
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: "Session not found" };
      }

      const result = await this.executionEngine.executeWithReflection(
        task,
        {
          specPath: path.join(this.workspaceRoot, this.specDirectory, session.featureName),
          sessionId,
          phase: session.currentPhase,
          previousTasks: session.tasks.filter(
            (t) => t.checkboxState === CheckboxState.COMPLETE
          ),
        },
        { maxIterations: 3 }
      );

      if (result.success) {
        await this.sessionManager.markTaskComplete(sessionId, task.id);
        await this.updateTaskCheckbox(sessionId, task.id, CheckboxState.COMPLETE);
        
        // Update progress
        const session = await this.sessionManager.getSession(sessionId);
        if (session) {
          this.updateStatusBar(
            sessionId,
            session.featureName,
            session.totalTasksCompleted,
            session.tasks.length
          );
        }
      } else {
        await this.sessionManager.markTaskFailed(sessionId, task.id, result.error || "Unknown error");
        await this.updateTaskCheckbox(sessionId, task.id, CheckboxState.FAILED);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.sessionManager.markTaskFailed(sessionId, task.id, errorMessage);
      await this.updateTaskCheckbox(sessionId, task.id, CheckboxState.FAILED);
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Build an execution plan for a task
   */
  private async buildExecutionPlan(
    task: TaskRecord,
    sessionId: string
  ): Promise<ExecutionPlan | null> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Build context for LLM generation
    const context = {
      specPath: path.join(this.workspaceRoot, this.specDirectory, session.featureName),
      sessionId,
      phase: session.currentPhase,
      previousTasks: session.tasks.filter((t) => t.checkboxState === CheckboxState.COMPLETE),
    };

    // Try LLM generation if enabled
    if (this.config.enableLLM) {
      try {
        const result = await this.executionEngine.generateWithLLM(task, context);
        
        if (result.success) {
          // LLM generated a plan successfully
          await getEventBus().emit("taskCompleted", sessionId, {
            taskId: task.id,
            actionsGenerated: result.filesCreated?.length || 0,
          });

          // Return an execution plan based on the result
          // The result already executed, so return empty plan
          return {
            taskId: task.id,
            actions: [],
          };
        }
      } catch (error) {
        this.log(`LLM generation failed: ${error}. Falling back to manual guidance.`);
      }
    }

    // Fallback to manual execution
    return {
      taskId: task.id,
      actions: [],
    };
  }

  /**
   * Show task guidance for manual implementation
   */
  private async showTaskGuidance(
    task: TaskRecord,
    sessionId: string
  ): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) return;

    // Show in output channel
    if (this.outputChannel) {
      this.outputChannel.show(true);
      this.outputChannel.appendLine(`\n${"=".repeat(80)}`);
      this.outputChannel.appendLine(`🔨 TASK: ${task.id} - ${task.title}`);
      this.outputChannel.appendLine(`${"=".repeat(80)}\n`);
      this.outputChannel.appendLine(`This task requires manual implementation.`);
      this.outputChannel.appendLine(`\nUse GitHub Copilot or the @spec chat participant for assistance.`);
      this.outputChannel.appendLine(`\nMark the task complete in tasks.md when done.`);
    }

    // Show notification
    const action = await vscode.window.showInformationMessage(
      `Task ${task.id} ready for implementation: ${task.title}`,
      "View Task",
      "Ask Copilot"
    );

    if (action === "View Task") {
      const tasksPath = path.join(
        this.workspaceRoot,
        this.specDirectory,
        session.featureName,
        "tasks.md"
      );
      const doc = await vscode.workspace.openTextDocument(tasksPath);
      await vscode.window.showTextDocument(doc);
    } else if (action === "Ask Copilot") {
      await vscode.commands.executeCommand("workbench.action.chat.open");
    }
  }

  /**
   * Update task checkbox in tasks.md
   */
  private async updateTaskCheckbox(
    sessionId: string,
    taskId: string,
    state: CheckboxState
  ): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) return;

    const tasksPath = path.join(
      this.workspaceRoot,
      this.specDirectory,
      session.featureName,
      "tasks.md"
    );

    try {
      const content = fs.readFileSync(tasksPath, "utf-8");
      const lines = content.split("\n");

      // Find and update the task line
      const taskRegex = new RegExp(
        `^(\\s*)- \\[[ x~-]\\](\\*)?\\s+${taskId.replace(".", "\\.")}[.\\s]`
      );

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(taskRegex);
        if (match) {
          const indent = match[1];
          const optional = match[2] || "";
          const checkbox = state === CheckboxState.COMPLETE ? "x" :
                          state === CheckboxState.IN_PROGRESS ? "~" :
                          state === CheckboxState.FAILED ? "-" : " ";
          
          // Preserve the rest of the line after the checkbox
          const restOfLine = lines[i].substring(match[0].length);
          lines[i] = `${indent}- [${checkbox}]${optional} ${taskId}${restOfLine}`;
          break;
        }
      }

      await this.storage.writeFileAtomic(tasksPath, lines.join("\n"));
    } catch (error) {
      this.log(`Failed to update task checkbox: ${error}`);
    }
  }

  /**
   * Convert ParsedTask to TaskRecord
   */
  private convertToTaskRecords(tasks: ParsedTask[]): TaskRecord[] {
    return tasks.map((task) => ({
      id: task.id,
      title: task.description,
      rawLine: task.line,
      checkboxState: task.status === "completed" ? CheckboxState.COMPLETE :
                     task.status === "in-progress" ? CheckboxState.IN_PROGRESS :
                     task.status === "failed" ? CheckboxState.FAILED : CheckboxState.PENDING,
      retryCount: 0,
    }));
  }

  /**
   * Check if a task ID indicates an optional task
   */
  private isOptionalTask(taskId: string): boolean {
    // Optional tasks are typically marked with * in the task line
    // For now, assume task IDs starting with "O." are optional
    return taskId.startsWith("O.");
  }

  /**
   * Set up event handlers for UI updates
   */
  private setupEventHandlers(): void {
    const unsubTaskCompleted = this.eventBus.subscribe("taskCompleted", async (event) => {
      const session = await this.sessionManager.getSession(event.sessionId);
      if (session) {
        const percentage = Math.round(
          (session.totalTasksCompleted / session.tasks.length) * 100
        );
        
        // Show milestone notifications
        if (percentage === 25 || percentage === 50 || percentage === 75 || percentage === 100) {
          vscode.window.showInformationMessage(
            `🎯 ${percentage}% complete: ${session.totalTasksCompleted}/${session.tasks.length} tasks done`
          );
        }
      }
    });

    const unsubTaskFailed = this.eventBus.subscribe("taskFailed", async (event) => {
      vscode.window.showWarningMessage(
        `❌ Task ${event.data.taskId} failed: ${event.data.error}`
      );
    });

    const unsubSessionCompleted = this.eventBus.subscribe("sessionCompleted", async (event) => {
      vscode.window.showInformationMessage(
        `✅ Session completed: ${event.sessionId}`
      );
      this.hideStatusBar();
    });

    // Context limit warning
    const unsubContextWarning = this.eventBus.subscribe("contextLimitWarning", async (event) => {
      const usage = event.data.usagePercentage.toFixed(1);
      this.log(`⚠️ Context usage at ${usage}%`);
    });

    // Context summarization triggered
    const unsubContextSummarization = this.eventBus.subscribe("contextSummarizationTriggered", async (event) => {
      vscode.window.showInformationMessage(event.data.message);
      this.log(`📝 ${event.data.message}`);
    });

    // Context summarized
    const unsubContextSummarized = this.eventBus.subscribe("contextSummarized", async (event) => {
      const tokensSaved = event.data.tokensSaved;
      this.log(`✅ Context summarized: saved ${tokensSaved} tokens`);
    });

    // Reflection started
    const unsubReflectionStarted = this.eventBus.subscribe("reflectionStarted", async (event) => {
      const { taskId, maxIterations } = event.data;
      this.log(`🔄 Starting reflection loop for task ${taskId} (max ${maxIterations} iterations)`);
      
      // Update status bar to show reflection is active
      const session = await this.sessionManager.getSession(event.sessionId);
      if (session && this.statusBarItem) {
        this.statusBarItem.text = `$(sync~spin) Akira: 🔄 Reflecting...`;
        this.statusBarItem.tooltip = `Reflection loop active for task ${taskId}`;
      }
      
      // Show notification
      vscode.window.showInformationMessage(
        `🔄 Starting adaptive execution for task ${taskId}`
      );
    });

    // Reflection iteration
    const unsubReflectionIteration = this.eventBus.subscribe("reflectionIteration", async (event) => {
      const { taskId, iteration, maxIterations, success, confidence, reasoning } = event.data;
      
      // Update status bar with iteration progress
      if (this.statusBarItem) {
        this.statusBarItem.text = `$(sync~spin) Akira: 🔄 Iteration ${iteration}/${maxIterations}`;
        this.statusBarItem.tooltip = `Task ${taskId}: Iteration ${iteration}/${maxIterations}\nConfidence: ${(confidence * 100).toFixed(0)}%`;
      }
      
      // Log detailed progress
      if (success) {
        this.log(`🔄 Iteration ${iteration}/${maxIterations}: Trying approach...`);
      } else {
        this.log(`❌ Iteration ${iteration}/${maxIterations} failed. Analyzing and adjusting strategy...`);
        this.log(`   Reason: ${reasoning}`);
      }
      
      // Stream to output channel with user-friendly messages
      if (this.outputChannel) {
        if (iteration === 1) {
          this.outputChannel.appendLine(`🔄 Iteration ${iteration}/${maxIterations}: Trying initial approach...`);
        } else {
          this.outputChannel.appendLine(`🔄 Iteration ${iteration}/${maxIterations}: Trying alternative approach...`);
        }
        
        if (!success || confidence < 0.8) {
          this.outputChannel.appendLine(`   ❌ Failed: ${reasoning}. Analyzing and adjusting strategy...`);
        }
      }
    });

    // Reflection completed
    const unsubReflectionCompleted = this.eventBus.subscribe("reflectionCompleted", async (event) => {
      const { taskId, success, iterationsUsed, maxIterations, finalConfidence, reason } = event.data;
      
      // Restore normal status bar
      const session = await this.sessionManager.getSession(event.sessionId);
      if (session) {
        this.updateStatusBar(
          event.sessionId,
          session.featureName,
          session.totalTasksCompleted,
          session.tasks.length
        );
      }
      
      // Show completion message
      if (success) {
        const message = `✅ Success after ${iterationsUsed}/${maxIterations} iteration${iterationsUsed > 1 ? 's' : ''}!`;
        this.log(message);
        
        if (this.outputChannel) {
          this.outputChannel.appendLine(message);
        }
        
        // Show notification for multi-iteration success
        if (iterationsUsed > 1) {
          vscode.window.showInformationMessage(
            `✅ Task ${taskId} completed after ${iterationsUsed} iterations (confidence: ${(finalConfidence * 100).toFixed(0)}%)`
          );
        }
      } else {
        const message = `❌ Reflection loop completed without success after ${iterationsUsed} iterations`;
        this.log(message);
        this.log(`   Reason: ${reason || 'Unknown'}`);
        
        if (this.outputChannel) {
          this.outputChannel.appendLine(message);
          if (reason) {
            this.outputChannel.appendLine(`   Reason: ${reason}`);
          }
        }
        
        // Show warning notification
        vscode.window.showWarningMessage(
          `⚠️ Task ${taskId} could not be completed automatically. ${reason || 'Manual intervention may be required.'}`
        );
      }
    });

    // Store unsubscribe functions for cleanup
    this.eventUnsubscribers.push(
      unsubTaskCompleted, 
      unsubTaskFailed, 
      unsubSessionCompleted,
      unsubContextWarning,
      unsubContextSummarization,
      unsubContextSummarized,
      unsubReflectionStarted,
      unsubReflectionIteration,
      unsubReflectionCompleted
    );
  }

  /**
   * Update status bar
   */
  private updateStatusBar(
    sessionId: string,
    featureName: string,
    completed: number,
    total: number,
    status?: string
  ): void {
    if (!this.statusBarItem) {
      this.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
      );
      this.statusBarItem.command = "akira.showSessionMenu";
    }

    const statusText = status || `${completed}/${total}`;
    this.statusBarItem.text = `$(sync~spin) Akira: ${statusText}`;
    this.statusBarItem.tooltip = `Session: ${sessionId}\nFeature: ${featureName}`;
    this.statusBarItem.show();
  }

  /**
   * Hide status bar
   */
  private hideStatusBar(): void {
    if (this.statusBarItem) {
      this.statusBarItem.hide();
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[AutonomousExecutor] ${message}`);
    }
    console.log(`[AutonomousExecutor] ${message}`);
  }

  /**
   * Get current session state
   */
  async getCurrentSession(): Promise<SessionState | null> {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessionManager.getSession(this.currentSessionId);
  }

  /**
   * Get progress info for current session
   */
  async getProgress(): Promise<ProgressInfo | null> {
    const session = await this.getCurrentSession();
    if (!session) {
      return null;
    }

    const currentTask = session.tasks.find(
      (t) => t.checkboxState === "IN_PROGRESS"
    );

    return {
      sessionId: session.id,
      totalTasks: session.tasks.length,
      completedTasks: session.totalTasksCompleted,
      failedTasks: session.totalTasksFailed,
      currentTask: currentTask?.id,
      percentage: Math.round((session.totalTasksCompleted / session.tasks.length) * 100),
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Unsubscribe from all events to prevent memory leaks
    this.eventUnsubscribers.forEach((unsub) => unsub());
    this.eventUnsubscribers = [];
    
    this.scheduler.shutdown();
    this.sessionManager.dispose();
    this.contextManager.dispose();
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    if (this.outputChannel) {
      this.outputChannel.dispose();
    }
  }
}

// Singleton instance
let executorInstance: AutonomousExecutor | null = null;

/**
 * Get or create the autonomous executor instance
 */
export function getAutonomousExecutor(
  workspaceRoot: string,
  specDirectory?: string,
  config?: Partial<AutonomousConfig>,
  outputChannel?: vscode.OutputChannel
): AutonomousExecutor {
  if (!executorInstance) {
    executorInstance = new AutonomousExecutor(
      workspaceRoot,
      specDirectory,
      config,
      outputChannel
    );
  }
  return executorInstance;
}

/**
 * Reset the executor (for testing)
 */
export function resetAutonomousExecutor(): void {
  if (executorInstance) {
    executorInstance.dispose();
    executorInstance = null;
  }
}
