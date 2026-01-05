/**
 * Context Manager for Conversation History
 * Monitors context size and triggers summarization when limits are approached
 */

import * as path from "path";
import * as fs from "fs";
import { StorageLayer } from "./storage-layer";
import { getEventBus } from "./event-bus";
import { DecisionEngine } from "./decision-engine";
import {
  AttemptRecord,
  FailurePattern,
  EnvironmentState,
  TaskRecord,
  DecisionResult,
} from "./types";

/**
 * Context entry in conversation history
 */
export interface ContextEntry {
  timestamp: string;
  type: "user" | "assistant" | "system" | "tool";
  content: string;
  tokenEstimate: number;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Summary result
 */
export interface SummaryResult {
  summaryText: string;
  originalTokenCount: number;
  summaryTokenCount: number;
  entriesSummarized: number;
  retainedEntries: number;
}

/**
 * Context limits configuration
 */
export interface ContextLimits {
  maxTotalTokens: number;
  warningThreshold: number; // Percentage (0-100) at which to trigger warning
  summarizationThreshold: number; // Percentage (0-100) at which to trigger auto-summarization
  minEntriesBeforeSummarization: number;
  retainRecentEntries: number; // Number of recent entries to keep unsummarized
}

/**
 * Default context limits
 */
const DEFAULT_LIMITS: ContextLimits = {
  maxTotalTokens: 1_000_000, // 1M token budget
  warningThreshold: 80, // Warn at 80%
  summarizationThreshold: 85, // Summarize at 85%
  minEntriesBeforeSummarization: 10,
  retainRecentEntries: 5,
};

/**
 * Context Manager monitors conversation history and manages context limits
 */
export class ContextManager {
  private storage: StorageLayer;
  private contextDir: string;
  private conversationHistory: ContextEntry[] = [];
  private currentTokenCount: number = 0;
  private limits: ContextLimits;
  private sessionId: string | null = null;
  private summaryGenerated: boolean = false;
  private decisionEngine: DecisionEngine;
  private failuresDir: string;

  constructor(
    workspaceRoot: string,
    limits: Partial<ContextLimits> = {}
  ) {
    this.storage = new StorageLayer(workspaceRoot);
    this.contextDir = path.join(".kiro", "context");
    this.failuresDir = path.join(".kiro", "sessions");
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.decisionEngine = new DecisionEngine(workspaceRoot);
  }

  /**
   * Initialize context manager for a session
   */
  async initialize(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.summaryGenerated = false;

    // Ensure context directory exists
    await this.storage.ensureDir(this.contextDir);

    // Load existing history if available
    await this.loadHistory(sessionId);

    // Emit initialization event
    await getEventBus().emit("contextInitialized", sessionId, {
      tokenCount: this.currentTokenCount,
      entryCount: this.conversationHistory.length,
    });
  }

  /**
   * Add an entry to conversation history
   */
  async addEntry(entry: Omit<ContextEntry, "timestamp" | "tokenEstimate">): Promise<void> {
    const tokenEstimate = this.estimateTokens(entry.content);
    
    const contextEntry: ContextEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      tokenEstimate,
      sessionId: this.sessionId || undefined,
    };

    this.conversationHistory.push(contextEntry);
    this.currentTokenCount += tokenEstimate;

    // Check limits after adding
    await this.checkLimits();

    // Persist to disk
    await this.saveHistory();
  }

  /**
   * Estimate token count for content (simple heuristic)
   * More accurate estimation would use tiktoken or similar
   */
  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token on average
    // This is a simplification; actual tokenization varies by model
    return Math.ceil(content.length / 4);
  }

  /**
   * Check if context limits are approaching
   */
  private async checkLimits(): Promise<void> {
    const usage = this.getUsagePercentage();

    if (usage >= this.limits.summarizationThreshold && !this.summaryGenerated) {
      await this.triggerSummarization();
    } else if (usage >= this.limits.warningThreshold && usage < this.limits.summarizationThreshold) {
      await this.emitWarning();
    }
  }

  /**
   * Get current context usage as percentage
   */
  private getUsagePercentage(): number {
    return (this.currentTokenCount / this.limits.maxTotalTokens) * 100;
  }

  /**
   * Emit warning that context is filling up
   */
  private async emitWarning(): Promise<void> {
    const usage = this.getUsagePercentage();
    
    await getEventBus().emit("contextLimitWarning", this.sessionId || "unknown", {
      currentTokens: this.currentTokenCount,
      maxTokens: this.limits.maxTotalTokens,
      usagePercentage: usage,
      message: `Context usage at ${usage.toFixed(1)}%. Summarization will be triggered at ${this.limits.summarizationThreshold}%.`,
    });
  }

  /**
   * Trigger automatic summarization
   */
  private async triggerSummarization(): Promise<void> {
    if (this.conversationHistory.length < this.limits.minEntriesBeforeSummarization) {
      return; // Not enough entries to summarize
    }

    const usage = this.getUsagePercentage();
    
    await getEventBus().emit("contextSummarizationTriggered", this.sessionId || "unknown", {
      currentTokens: this.currentTokenCount,
      maxTokens: this.limits.maxTotalTokens,
      usagePercentage: usage,
      message: `The conversation in this session is about to reach the agent context limit. I'm summarizing earlier messages, and only the summary will be sent to the agent as context instead of the full text.`,
    });

    // Perform summarization
    const summary = await this.summarizeHistory();
    
    // Save the summary
    await this.saveSummary(summary);
    
    this.summaryGenerated = true;

    await getEventBus().emit("contextSummarized", this.sessionId || "unknown", {
      originalTokens: summary.originalTokenCount,
      summaryTokens: summary.summaryTokenCount,
      tokensSaved: summary.originalTokenCount - summary.summaryTokenCount,
      entriesSummarized: summary.entriesSummarized,
      retainedEntries: summary.retainedEntries,
    });
  }

  /**
   * Summarize conversation history
   * Keeps recent entries, summarizes older ones
   */
  private async summarizeHistory(): Promise<SummaryResult> {
    const totalEntries = this.conversationHistory.length;
    const entriesToSummarize = totalEntries - this.limits.retainRecentEntries;

    if (entriesToSummarize <= 0) {
      throw new Error("Not enough entries to summarize");
    }

    // Split history into parts to summarize and parts to retain
    const oldEntries = this.conversationHistory.slice(0, entriesToSummarize);
    const recentEntries = this.conversationHistory.slice(entriesToSummarize);

    // Calculate original token count
    const originalTokenCount = oldEntries.reduce((sum, entry) => sum + entry.tokenEstimate, 0);

    // Generate summary (simplified - in production would use LLM)
    const summaryText = this.generateSummary(oldEntries);
    const summaryTokenCount = this.estimateTokens(summaryText);

    // Create summary entry
    const summaryEntry: ContextEntry = {
      timestamp: new Date().toISOString(),
      type: "system",
      content: summaryText,
      tokenEstimate: summaryTokenCount,
      sessionId: this.sessionId || undefined,
      metadata: {
        isSummary: true,
        entriesSummarized: oldEntries.length,
        originalTokenCount,
      },
    };

    // Replace old entries with summary
    this.conversationHistory = [summaryEntry, ...recentEntries];
    this.currentTokenCount = summaryTokenCount + recentEntries.reduce((sum, e) => sum + e.tokenEstimate, 0);

    return {
      summaryText,
      originalTokenCount,
      summaryTokenCount,
      entriesSummarized: oldEntries.length,
      retainedEntries: recentEntries.length,
    };
  }

  /**
   * Generate a text summary from conversation entries
   * This is a simplified version - production would use LLM summarization
   */
  private generateSummary(entries: ContextEntry[]): string {
    const sections: string[] = [
      "# Conversation Summary",
      "",
      `This summary covers ${entries.length} earlier messages from ${entries[0]?.timestamp || "unknown"} to ${entries[entries.length - 1]?.timestamp || "unknown"}.`,
      "",
    ];

    // Group by session if available
    const sessionGroups = new Map<string, ContextEntry[]>();
    const noSessionEntries: ContextEntry[] = [];

    for (const entry of entries) {
      if (entry.sessionId) {
        if (!sessionGroups.has(entry.sessionId)) {
          sessionGroups.set(entry.sessionId, []);
        }
        sessionGroups.get(entry.sessionId)!.push(entry);
      } else {
        noSessionEntries.push(entry);
      }
    }

    // Summarize by type and key actions
    const userMessages = entries.filter(e => e.type === "user");
    const assistantMessages = entries.filter(e => e.type === "assistant");
    const toolCalls = entries.filter(e => e.type === "tool");

    sections.push("## Overview");
    sections.push(`- **User requests:** ${userMessages.length}`);
    sections.push(`- **Assistant responses:** ${assistantMessages.length}`);
    sections.push(`- **Tool executions:** ${toolCalls.length}`);
    sections.push("");

    // Extract key topics/tasks
    sections.push("## Key Topics");
    const keyTopics = this.extractKeyTopics(entries);
    for (const topic of keyTopics) {
      sections.push(`- ${topic}`);
    }
    sections.push("");

    // Session-specific summaries
    if (sessionGroups.size > 0) {
      sections.push("## Sessions");
      for (const [sessionId, sessionEntries] of sessionGroups) {
        sections.push(`### ${sessionId}`);
        sections.push(`  - Entries: ${sessionEntries.length}`);
        sections.push(`  - Period: ${sessionEntries[0].timestamp} to ${sessionEntries[sessionEntries.length - 1].timestamp}`);
      }
      sections.push("");
    }

    sections.push("---");
    sections.push("*This is an automatically generated summary. Recent messages are preserved in full.*");

    return sections.join("\n");
  }

  /**
   * Extract key topics from conversation entries
   * Simplified keyword extraction - production would use NLP
   */
  private extractKeyTopics(entries: ContextEntry[]): string[] {
    const topics = new Set<string>();
    const keywordPatterns = [
      /test(?:ing|s)?/i,
      /implement(?:ation|ed)?/i,
      /fix(?:ed)?/i,
      /bug/i,
      /feature/i,
      /scheduler/i,
      /memory leak/i,
      /hang(?:ing)?/i,
      /error/i,
      /session/i,
      /task(?:s)?/i,
    ];

    for (const entry of entries) {
      if (entry.type === "user") {
        for (const pattern of keywordPatterns) {
          if (pattern.test(entry.content)) {
            const match = entry.content.match(pattern);
            if (match) {
              topics.add(match[0].toLowerCase());
            }
          }
        }
      }
    }

    return Array.from(topics).slice(0, 10); // Limit to 10 topics
  }

  /**
   * Save conversation history to disk
   */
  private async saveHistory(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    const historyPath = path.join(this.contextDir, `${this.sessionId}.history.json`);
    const data = {
      sessionId: this.sessionId,
      totalTokens: this.currentTokenCount,
      entryCount: this.conversationHistory.length,
      lastUpdated: new Date().toISOString(),
      entries: this.conversationHistory,
    };

    await this.storage.writeFileAtomic(historyPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load conversation history from disk
   */
  private async loadHistory(sessionId: string): Promise<void> {
    try {
      const historyPath = path.join(this.contextDir, `${sessionId}.history.json`);
      const content = await this.storage.readFile(historyPath);
      const data = JSON.parse(content);

      this.conversationHistory = data.entries || [];
      this.currentTokenCount = data.totalTokens || 0;
    } catch (error) {
      // No history file exists yet - start fresh
      this.conversationHistory = [];
      this.currentTokenCount = 0;
    }
  }

  /**
   * Save summary to separate file
   */
  private async saveSummary(summary: SummaryResult): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    const summaryPath = path.join(this.contextDir, `${this.sessionId}.summary.md`);
    await this.storage.writeFileAtomic(summaryPath, summary.summaryText);
  }

  /**
   * Get current context statistics
   */
  getStats(): {
    currentTokens: number;
    maxTokens: number;
    usagePercentage: number;
    entryCount: number;
    summarized: boolean;
  } {
    return {
      currentTokens: this.currentTokenCount,
      maxTokens: this.limits.maxTotalTokens,
      usagePercentage: this.getUsagePercentage(),
      entryCount: this.conversationHistory.length,
      summarized: this.summaryGenerated,
    };
  }

  /**
   * Force summarization (for testing or manual trigger)
   */
  async forceSummarize(): Promise<SummaryResult> {
    return await this.summarizeHistory();
  }

  /**
   * Track an execution attempt for reflection loop
   */
  async trackAttempt(
    sessionId: string,
    taskId: string,
    attempt: AttemptRecord
  ): Promise<void> {
    const failuresPath = path.join(this.failuresDir, sessionId, "failures.json");
    
    // Ensure directory exists
    await this.storage.ensureDir(path.dirname(failuresPath));
    
    // Load existing failures data
    let failuresData: any = { sessionId, tasks: {} };
    if (await this.storage.exists(failuresPath)) {
      const content = await this.storage.readFile(failuresPath);
      failuresData = JSON.parse(content);
    }
    
    // Ensure tasks object exists
    if (!failuresData.tasks) {
      failuresData.tasks = {};
    }
    
    // Initialize task entry if needed (use Object.prototype.hasOwnProperty to avoid prototype pollution)
    if (!Object.prototype.hasOwnProperty.call(failuresData.tasks, taskId)) {
      failuresData.tasks[taskId] = {
        attempts: [],
        patterns: [],
      };
    }
    
    // Add the attempt
    failuresData.tasks[taskId].attempts.push(attempt);
    
    // Save back to disk
    await this.storage.writeFileAtomic(failuresPath, JSON.stringify(failuresData, null, 2));
  }

  /**
   * Get failure history for a task
   */
  async getFailureHistory(
    sessionId: string,
    taskId: string
  ): Promise<AttemptRecord[]> {
    const failuresPath = path.join(this.failuresDir, sessionId, "failures.json");
    
    if (!(await this.storage.exists(failuresPath))) {
      return [];
    }
    
    const content = await this.storage.readFile(failuresPath);
    const failuresData = JSON.parse(content);
    
    // Use Object.prototype.hasOwnProperty to avoid prototype pollution
    if (!failuresData.tasks || !Object.prototype.hasOwnProperty.call(failuresData.tasks, taskId)) {
      return [];
    }
    
    return failuresData.tasks[taskId]?.attempts || [];
  }

  /**
   * Detect failure patterns for a task
   */
  async detectFailurePatterns(
    sessionId: string,
    taskId: string
  ): Promise<FailurePattern[]> {
    const attempts = await this.getFailureHistory(sessionId, taskId);
    
    if (attempts.length === 0) {
      return [];
    }
    
    // Group by error message
    const errorCounts = new Map<string, { count: number; firstSeen: string; lastSeen: string }>();
    
    for (const attempt of attempts) {
      const errorMsg = attempt.result.error || "Unknown error";
      
      if (!errorCounts.has(errorMsg)) {
        errorCounts.set(errorMsg, {
          count: 0,
          firstSeen: attempt.timestamp,
          lastSeen: attempt.timestamp,
        });
      }
      
      const entry = errorCounts.get(errorMsg)!;
      entry.count++;
      entry.lastSeen = attempt.timestamp;
    }
    
    // Convert to FailurePattern array
    const patterns: FailurePattern[] = [];
    for (const [errorMessage, data] of errorCounts) {
      patterns.push({
        errorMessage,
        occurrences: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      });
    }
    
    // Sort by occurrence count (descending)
    patterns.sort((a, b) => b.occurrences - a.occurrences);
    
    return patterns;
  }

  /**
   * Capture current environment state
   */
  async captureEnvironmentState(
    workspaceRoot: string
  ): Promise<EnvironmentState> {
    const state: EnvironmentState = {
      filesCreated: [],
      filesModified: [],
      commandOutputs: new Map<string, string>(),
      workingDirectoryState: [],
    };
    
    try {
      // List files in workspace root (non-recursive, just top level)
      const files = await fs.promises.readdir(workspaceRoot);
      state.workingDirectoryState = files;
    } catch (error) {
      // If we can't read directory, just leave it empty
      state.workingDirectoryState = [];
    }
    
    return state;
  }

  /**
   * Evaluate task after execution
   */
  async evaluateAfterExecution(
    task: TaskRecord,
    sessionId: string
  ): Promise<DecisionResult> {
    return await this.decisionEngine.evaluateTask(task, task.successCriteria);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.conversationHistory = [];
    this.currentTokenCount = 0;
    this.sessionId = null;
  }
}
