/**
 * Output Logger for Agent Hooks
 * Provides structured logging to VS Code output channel
 * 
 * Requirements:
 * - REQ-4.2: Redact secrets from all log output
 * - Task 4.6: Optional structured log file writer to .kiro/logs/hooks.log
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ExecutionRecord, HookTriggerContext } from "./types";
import { redact } from "./secretsRedactor";
import { MetricsSnapshot } from "./metricsCollector";

/**
 * Configuration options for OutputLogger
 */
export interface OutputLoggerConfig {
  /** Enable structured log file writing to .kiro/logs/hooks.log */
  enableFileLogging?: boolean;
  /** Workspace root path for log file location */
  workspaceRoot?: string;
}

/**
 * Structured log entry for JSONL file output
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: "info" | "error" | "execution";
  hookId?: string;
  message?: string;
  status?: string;
  attempt?: number;
  duration?: number;
  exitCode?: number;
  error?: string;
  stdout?: string;
  stderr?: string;
}

export class OutputLogger {
  private outputChannel: vscode.OutputChannel;
  private secretPatterns: RegExp[] = [];
  private fileLoggingEnabled: boolean = false;
  private workspaceRoot: string | undefined;
  private logFilePath: string | undefined;

  constructor(channelName: string = "Agent Hooks", config?: OutputLoggerConfig) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
    
    if (config) {
      this.fileLoggingEnabled = config.enableFileLogging ?? false;
      this.workspaceRoot = config.workspaceRoot;
      
      if (this.fileLoggingEnabled && this.workspaceRoot) {
        this.initializeLogFile();
      }
    }
  }

  /**
   * Initialize the log file directory and path
   */
  private initializeLogFile(): void {
    if (!this.workspaceRoot) {
      return;
    }

    const logsDir = path.join(this.workspaceRoot, ".kiro", "logs");
    this.logFilePath = path.join(logsDir, "hooks.log");

    try {
      // Create .kiro/logs directory if it doesn't exist
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (error) {
      // Log to output channel if directory creation fails
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] ERROR: Failed to create log directory: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      this.fileLoggingEnabled = false;
    }
  }

  /**
   * Enable or disable file logging at runtime
   */
  setFileLogging(enabled: boolean, workspaceRoot?: string): void {
    this.fileLoggingEnabled = enabled;
    
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
    }
    
    if (enabled && this.workspaceRoot) {
      this.initializeLogFile();
    }
  }

  /**
   * Get the current log file path
   */
  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  /**
   * Check if file logging is enabled
   */
  isFileLoggingEnabled(): boolean {
    return this.fileLoggingEnabled && !!this.logFilePath;
  }

  /**
   * Write a structured log entry to the JSONL file
   * Ensures redaction is applied before writing
   */
  private writeToLogFile(entry: StructuredLogEntry): void {
    if (!this.fileLoggingEnabled || !this.logFilePath) {
      return;
    }

    try {
      // Redact sensitive data from all string fields
      const redactedEntry: StructuredLogEntry = {
        ...entry,
        message: entry.message ? this.redactText(entry.message) : undefined,
        error: entry.error ? this.redactText(entry.error) : undefined,
        stdout: entry.stdout ? this.redactText(entry.stdout) : undefined,
        stderr: entry.stderr ? this.redactText(entry.stderr) : undefined,
      };

      // Remove undefined fields for cleaner JSON
      const cleanEntry = Object.fromEntries(
        Object.entries(redactedEntry).filter(([_, v]) => v !== undefined)
      );

      const jsonLine = JSON.stringify(cleanEntry) + "\n";
      fs.appendFileSync(this.logFilePath, jsonLine, "utf8");
    } catch (error) {
      // Silently fail file writes to avoid disrupting main functionality
      // Log to output channel for debugging
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] ERROR: Failed to write to log file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Set secret patterns for redaction
   * All log output will be redacted using these patterns
   */
  setSecretPatterns(patterns: RegExp[]): void {
    this.secretPatterns = patterns;
  }

  /**
   * Add secret patterns from string array (validates and compiles)
   */
  addSecretPatternsFromStrings(patternStrings: string[]): string[] {
    const errors: string[] = [];
    for (const pattern of patternStrings) {
      try {
        this.secretPatterns.push(new RegExp(pattern, "g"));
      } catch (error) {
        errors.push(`Invalid pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return errors;
  }

  /**
   * Redact text using configured secret patterns
   */
  private redactText(text: string): string {
    return redact(text, this.secretPatterns);
  }

  /**
   * Log informational message
   */
  logInfo(ctx: Partial<HookTriggerContext> | null, message: string): void {
    const timestamp = new Date().toISOString();
    const hookId = ctx?.hookId || "system";
    const contextStr = ctx
      ? ` [${hookId}]`
      : "";
    const redactedMessage = this.redactText(message);
    this.outputChannel.appendLine(`[${timestamp}]${contextStr} INFO: ${redactedMessage}`);

    // Write to structured log file
    this.writeToLogFile({
      timestamp,
      level: "info",
      hookId: ctx?.hookId,
      message,
    });
  }

  /**
   * Log error message
   */
  logError(ctx: Partial<HookTriggerContext> | null, error: Error | string): void {
    const timestamp = new Date().toISOString();
    const contextStr = ctx
      ? ` [${ctx.hookId || "system"}]`
      : "";
    const errorMsg = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    
    const redactedErrorMsg = this.redactText(errorMsg);
    this.outputChannel.appendLine(`[${timestamp}]${contextStr} ERROR: ${redactedErrorMsg}`);
    if (stack) {
      const redactedStack = this.redactText(stack);
      this.outputChannel.appendLine(`  Stack: ${redactedStack}`);
    }

    // Write to structured log file
    this.writeToLogFile({
      timestamp,
      level: "error",
      hookId: ctx?.hookId,
      error: errorMsg,
    });
  }

  /**
   * Log execution record
   */
  logExecution(record: ExecutionRecord): void {
    const timestamp = new Date().toISOString();
    const duration = record.duration ? `${record.duration}ms` : "N/A";
    const status = record.status.toUpperCase();
    
    this.outputChannel.appendLine(
      `[${timestamp}] [${record.hookId}] EXECUTION ${status} (attempt ${record.attempt}, duration: ${duration})`
    );

    if (record.exitCode !== undefined) {
      this.outputChannel.appendLine(`  Exit Code: ${record.exitCode}`);
    }

    if (record.stdout) {
      const redactedStdout = this.redactText(record.stdout);
      this.outputChannel.appendLine(`  Stdout: ${redactedStdout.substring(0, 500)}${redactedStdout.length > 500 ? "..." : ""}`);
    }

    if (record.stderr) {
      const redactedStderr = this.redactText(record.stderr);
      this.outputChannel.appendLine(`  Stderr: ${redactedStderr.substring(0, 500)}${redactedStderr.length > 500 ? "..." : ""}`);
    }

    if (record.error) {
      const redactedError = this.redactText(record.error);
      this.outputChannel.appendLine(`  Error: ${redactedError}`);
    }

    // Write to structured log file
    this.writeToLogFile({
      timestamp,
      level: "execution",
      hookId: record.hookId,
      status: record.status,
      attempt: record.attempt,
      duration: record.duration,
      exitCode: record.exitCode,
      stdout: record.stdout,
      stderr: record.stderr,
      error: record.error,
    });
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * Dispose the output channel
   */
  dispose(): void {
    this.outputChannel.dispose();
  }

  /**
   * Log metrics snapshot
   * Logs current metrics via logInfo for observability
   */
  logMetrics(metrics: MetricsSnapshot): void {
    const metricsMessage = [
      `Metrics snapshot:`,
      `  Queue Length: ${metrics.queueLength}`,
      `  Active Executions: ${metrics.activeExecutions}`,
      `  Total Enqueued: ${metrics.totalEnqueued}`,
      `  Success: ${metrics.successCount}`,
      `  Failure: ${metrics.failureCount}`,
      `  Timeout: ${metrics.timeoutCount}`,
      `  Canceled: ${metrics.canceledCount}`,
    ].join("\n");

    this.logInfo(null, metricsMessage);
  }
}
