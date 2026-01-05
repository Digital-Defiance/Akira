/**
 * Session Manager for Autonomous Execution
 * Manages session state persistence in markdown files
 */

import * as path from "path";
import * as fs from "fs";
import { StorageLayer } from "./storage-layer";
import { getEventBus } from "./event-bus";
import {
  SessionState,
  SessionConfig,
  TaskRecord,
  SessionStatus,
  CheckboxState,
  ExecutionResult,
  DecisionResult,
  ReflectionStats,
  FailurePattern,
} from "./types";

/**
 * Get the base directory for execution files (.akira or .kiro for backwards compatibility)
 */
function getExecutionBaseDirectory(workspaceRoot: string): string {
  const akiraDir = path.join(workspaceRoot, ".akira");
  const kiroDir = path.join(workspaceRoot, ".kiro");
  
  // If .akira exists, use it
  if (fs.existsSync(akiraDir)) {
    return ".akira";
  }
  
  // If .kiro exists (backwards compatibility), use it
  if (fs.existsSync(kiroDir)) {
    return ".kiro";
  }
  
  // Neither exists, use preferred (.akira)
  return ".akira";
}

/**
 * Session Manager handles session lifecycle and persistence
 */
export class SessionManager {
  private storage: StorageLayer;
  private sessionsDir: string;
  private activeSessions: Map<string, SessionState> = new Map();

  constructor(workspaceRoot: string, specDirectory?: string) {
    this.storage = new StorageLayer(workspaceRoot);
    
    // Use provided directory or auto-detect
    const baseDir = specDirectory || getExecutionBaseDirectory(workspaceRoot);
    this.sessionsDir = path.join(baseDir, "sessions");
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Create a new session
   */
  async createSession(config: SessionConfig): Promise<string> {
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();

    const sessionState: SessionState = {
      id: sessionId,
      featureName: config.featureName,
      workspaceRoot: config.workspaceRoot,
      status: "RUNNING",
      tasks: [],
      currentPhase: 1,
      currentTaskIndex: 0,
      createdAt: now,
      updatedAt: now,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      fileModificationCount: 0,
    };

    // Create session directory and files
    const sessionDir = path.join(this.sessionsDir, sessionId);
    await this.storage.ensureDir(sessionDir);

    // Write session.md
    await this.writeSessionFile(sessionId, sessionState);

    // Initialize history.md
    await this.appendToHistory(sessionId, "Session created", {
      featureName: config.featureName,
      config: {
        maxConcurrentTasks: config.maxConcurrentTasks,
        maxTasksPerSession: config.maxTasksPerSession,
        enableTaskDetection: config.enableTaskDetection,
      },
    });

    // Store in memory
    this.activeSessions.set(sessionId, sessionState);

    // Emit event
    await getEventBus().emit("sessionStarted", sessionId, {
      featureName: config.featureName,
    });

    return sessionId;
  }

  /**
   * Get session state
   */
  async getSession(sessionId: string): Promise<SessionState | null> {
    // Check memory first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Try to load from file
    try {
      const content = await this.storage.readFile(
        path.join(this.sessionsDir, sessionId, "session.md")
      );
      const state = this.parseSessionFile(content);
      this.activeSessions.set(sessionId, state);
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Update session state
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Apply updates
    const updatedSession: SessionState = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Persist
    await this.writeSessionFile(sessionId, updatedSession);
    this.activeSessions.set(sessionId, updatedSession);
  }

  /**
   * Update session status
   */
  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.updateSession(sessionId, { status });
    
    // Log to history
    await this.appendToHistory(sessionId, `Status changed to ${status}`);

    // Emit appropriate event
    const eventType = {
      RUNNING: "sessionResumed",
      PAUSED: "sessionPaused",
      PAUSED_FOR_APPROVAL: "approvalRequired",
      COMPLETED: "sessionCompleted",
      FAILED: "sessionFailed",
      STALE: "sessionFailed",
    }[status] as any;

    if (eventType) {
      await getEventBus().emit(eventType, sessionId, { status });
    }
  }

  /**
   * Add tasks to session
   */
  async addTasks(sessionId: string, tasks: TaskRecord[]): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updatedTasks = [...session.tasks, ...tasks];
    await this.updateSession(sessionId, { tasks: updatedTasks });
  }

  /**
   * Update a specific task
   */
  async updateTask(
    sessionId: string,
    taskId: string,
    updates: Partial<TaskRecord>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const taskIndex = session.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedTasks = [...session.tasks];
    updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...updates };

    // Update counters
    let totalCompleted = session.totalTasksCompleted;
    let totalFailed = session.totalTasksFailed;

    if (updates.checkboxState === "COMPLETE" && session.tasks[taskIndex].checkboxState !== "COMPLETE") {
      totalCompleted++;
    }
    if (updates.checkboxState === "FAILED" && session.tasks[taskIndex].checkboxState !== "FAILED") {
      totalFailed++;
    }

    await this.updateSession(sessionId, {
      tasks: updatedTasks,
      totalTasksCompleted: totalCompleted,
      totalTasksFailed: totalFailed,
    });
  }

  /**
   * Mark task as complete
   */
  async markTaskComplete(sessionId: string, taskId: string): Promise<void> {
    await this.updateTask(sessionId, taskId, {
      checkboxState: CheckboxState.COMPLETE,
      completionTimestamp: new Date().toISOString(),
    });

    await this.appendToHistory(sessionId, `Task completed: ${taskId}`);
    await getEventBus().emit("taskCompleted", sessionId, { taskId });
  }

  /**
   * Mark task as failed
   */
  async markTaskFailed(
    sessionId: string,
    taskId: string,
    error: string
  ): Promise<void> {
    await this.updateTask(sessionId, taskId, {
      checkboxState: CheckboxState.FAILED,
      error,
    });

    await this.appendToHistory(sessionId, `Task failed: ${taskId}`, { error });
    await getEventBus().emit("taskFailed", sessionId, { taskId, error });
  }

  /**
   * Increment file modification count
   */
  async incrementFileModifications(
    sessionId: string,
    count: number = 1
  ): Promise<number> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const newCount = session.fileModificationCount + count;
    await this.updateSession(sessionId, { fileModificationCount: newCount });
    return newCount;
  }

  /**
   * Append entry to history.md
   */
  async appendToHistory(
    sessionId: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    const historyPath = path.join(this.sessionsDir, sessionId, "history.md");
    const timestamp = new Date().toISOString();

    let entry = `\n## ${timestamp}\n\n${message}\n`;
    if (data) {
      entry += `\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
    }

    try {
      const existing = await this.storage.readFile(historyPath);
      await this.storage.writeFileAtomic(historyPath, existing + entry);
    } catch {
      // File doesn't exist, create with header
      const header = `# Session History\n\nSession ID: ${sessionId}\n`;
      await this.storage.writeFileAtomic(historyPath, header + entry);
    }
  }

  /**
   * Log a decision to decisions.md
   */
  async logDecision(
    sessionId: string,
    taskId: string,
    decision: {
      confidence: number;
      reasoning: string;
      provider: "heuristic" | "llm";
    }
  ): Promise<void> {
    const decisionsPath = path.join(this.sessionsDir, sessionId, "decisions.md");
    const timestamp = new Date().toISOString();

    const entry = `
## ${timestamp}

- **Task:** ${taskId}
- **Confidence:** ${(decision.confidence * 100).toFixed(1)}%
- **Provider:** ${decision.provider}
- **Reasoning:** ${decision.reasoning}

`;

    try {
      const existing = await this.storage.readFile(decisionsPath);
      await this.storage.writeFileAtomic(decisionsPath, existing + entry);
    } catch {
      const header = `# Decision Log\n\nSession ID: ${sessionId}\n`;
      await this.storage.writeFileAtomic(decisionsPath, header + entry);
    }
  }

  /**
   * Log a reflection iteration to reflection.md
   */
  async logReflectionIteration(
    sessionId: string,
    taskId: string,
    iteration: number,
    result: ExecutionResult,
    evaluation: DecisionResult
  ): Promise<void> {
    const reflectionPath = path.join(this.sessionsDir, sessionId, "reflection.md");
    const timestamp = new Date().toISOString();

    // Format the status
    const status = result.success ? "Success" : "Failed";
    
    // Format actions attempted
    const actionsText = result.filesModified?.length || result.filesCreated?.length || result.commandsRun?.length
      ? [
          result.filesCreated?.length ? `- file-write: ${result.filesCreated.join(", ")}` : null,
          result.filesModified?.length ? `- file-modify: ${result.filesModified.join(", ")}` : null,
          result.commandsRun?.length ? `- command: ${result.commandsRun.join(", ")}` : null,
        ].filter(Boolean).join("\n")
      : "- No actions recorded";

    const entry = `
### Iteration ${iteration} (${timestamp})

**Status:** ${status}  
**Confidence:** ${evaluation.confidence.toFixed(1)}  
**Reasoning:** ${evaluation.reasoning}

**Actions Attempted:**

${actionsText}

**Result:** ${result.error || "Success"}

---
`;

    try {
      const existing = await this.storage.readFile(reflectionPath);
      await this.storage.writeFileAtomic(reflectionPath, existing + entry);
    } catch {
      // File doesn't exist, create with header
      const header = `# Reflection Loop Log

## Task: ${taskId}
`;
      await this.storage.writeFileAtomic(reflectionPath, header + entry);
    }

    // Also append to history
    await this.appendToHistory(
      sessionId,
      `Reflection iteration ${iteration} for task ${taskId}`,
      {
        status,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
        error: result.error,
      }
    );
  }

  /**
   * Get reflection statistics for a session
   */
  async getReflectionStats(sessionId: string): Promise<ReflectionStats> {
    const failuresPath = path.join(this.sessionsDir, sessionId, "failures.json");
    
    // Default stats
    const stats: ReflectionStats = {
      totalReflections: 0,
      averageIterations: 0,
      successRate: 0,
      commonFailurePatterns: [],
    };
    
    // Check if failures file exists
    if (!(await this.storage.exists(failuresPath))) {
      return stats;
    }
    
    try {
      const content = await this.storage.readFile(failuresPath);
      const failuresData = JSON.parse(content);
      
      if (!failuresData.tasks) {
        return stats;
      }
      
      // Collect all patterns across all tasks
      const allPatterns = new Map<string, FailurePattern>();
      let totalIterations = 0;
      let totalSuccesses = 0;
      let totalTasks = 0;
      
      for (const taskId in failuresData.tasks) {
        if (!Object.prototype.hasOwnProperty.call(failuresData.tasks, taskId)) {
          continue;
        }
        
        const taskData = failuresData.tasks[taskId];
        const attempts = taskData.attempts || [];
        
        if (attempts.length > 0) {
          totalTasks++;
          totalIterations += attempts.length;
          
          // Check if last attempt was successful
          const lastAttempt = attempts[attempts.length - 1];
          if (lastAttempt.result.success) {
            totalSuccesses++;
          }
          
          // Merge patterns
          const patterns = taskData.patterns || [];
          for (const pattern of patterns) {
            if (allPatterns.has(pattern.errorMessage)) {
              const existing = allPatterns.get(pattern.errorMessage)!;
              existing.occurrences += pattern.occurrences;
              // Update timestamps if needed
              if (pattern.firstSeen < existing.firstSeen) {
                existing.firstSeen = pattern.firstSeen;
              }
              if (pattern.lastSeen > existing.lastSeen) {
                existing.lastSeen = pattern.lastSeen;
              }
            } else {
              allPatterns.set(pattern.errorMessage, { ...pattern });
            }
          }
        }
      }
      
      stats.totalReflections = totalTasks;
      stats.averageIterations = totalTasks > 0 ? totalIterations / totalTasks : 0;
      stats.successRate = totalTasks > 0 ? totalSuccesses / totalTasks : 0;
      
      // Sort patterns by occurrence and take top 10
      stats.commonFailurePatterns = Array.from(allPatterns.values())
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10);
      
      return stats;
    } catch (error) {
      // If parsing fails, return default stats
      return stats;
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    try {
      const dirs = await this.storage.listDir(this.sessionsDir);
      return dirs.filter((d) => d.startsWith("session-"));
    } catch {
      return [];
    }
  }

  /**
   * Check for stale sessions
   */
  async checkStaleSessions(staleDays: number = 7): Promise<string[]> {
    const sessions = await this.listSessions();
    const staleSessions: string[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - staleDays);

    for (const sessionId of sessions) {
      const session = await this.getSession(sessionId);
      if (session && session.status === "PAUSED") {
        const updatedAt = new Date(session.updatedAt);
        if (updatedAt < cutoff) {
          staleSessions.push(sessionId);
          await this.setStatus(sessionId, "STALE");
        }
      }
    }

    return staleSessions;
  }

  /**
   * Write session state to session.md
   */
  private async writeSessionFile(
    sessionId: string,
    state: SessionState
  ): Promise<void> {
    const content = this.formatSessionFile(state);
    await this.storage.writeFileAtomic(
      path.join(this.sessionsDir, sessionId, "session.md"),
      content
    );
  }

  /**
   * Format session state as markdown
   */
  private formatSessionFile(state: SessionState): string {
    const taskTable = state.tasks
      .map((t) => {
        const status = t.checkboxState === "COMPLETE" ? "✅" :
                      t.checkboxState === "FAILED" ? "❌" :
                      t.checkboxState === "IN_PROGRESS" ? "🔄" : "⬜";
        return `| ${status} | ${t.id} | ${t.title} | ${t.completionTimestamp || "-"} |`;
      })
      .join("\n");

    return `---
sessionId: ${state.id}
featureName: ${state.featureName}
status: ${state.status}
currentPhase: ${state.currentPhase}
currentTaskIndex: ${state.currentTaskIndex}
createdAt: ${state.createdAt}
updatedAt: ${state.updatedAt}
totalTasksCompleted: ${state.totalTasksCompleted}
totalTasksFailed: ${state.totalTasksFailed}
fileModificationCount: ${state.fileModificationCount}
---

# Session: ${state.featureName}

**Status:** ${state.status}  
**Progress:** ${state.totalTasksCompleted}/${state.tasks.length} tasks completed

## Tasks

| Status | ID | Title | Completed |
|--------|----|----|-----------|
${taskTable || "| - | - | No tasks loaded | - |"}

## Summary

- **Total Tasks:** ${state.tasks.length}
- **Completed:** ${state.totalTasksCompleted}
- **Failed:** ${state.totalTasksFailed}
- **File Modifications:** ${state.fileModificationCount}
`;
  }

  /**
   * Parse session.md content to SessionState
   */
  private parseSessionFile(content: string): SessionState {
    // Extract YAML front matter
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
      throw new Error("Invalid session file format");
    }

    const frontMatter = frontMatterMatch[1];
    const lines = frontMatter.split("\n");
    const data: Record<string, string> = {};

    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        data[key.trim()] = valueParts.join(":").trim();
      }
    }

    // Parse tasks from table (simplified - in real impl would parse markdown table)
    const tasks: TaskRecord[] = [];

    return {
      id: data.sessionId,
      featureName: data.featureName,
      workspaceRoot: data.workspaceRoot || "",
      status: data.status as SessionStatus,
      tasks,
      currentPhase: parseInt(data.currentPhase) || 1,
      currentTaskIndex: parseInt(data.currentTaskIndex) || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      totalTasksCompleted: parseInt(data.totalTasksCompleted) || 0,
      totalTasksFailed: parseInt(data.totalTasksFailed) || 0,
      fileModificationCount: parseInt(data.fileModificationCount) || 0,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.activeSessions.clear();
  }
}
