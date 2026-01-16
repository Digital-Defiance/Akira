/**
 * Unit tests for Output Logger
 *
 * Requirements validated:
 * - REQ-4.2: Redact secrets from all log output
 * - Task 4.6: Structured log file writer to .kiro/logs/hooks.log
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { OutputLogger, OutputLoggerConfig, StructuredLogEntry } from "./outputLogger";
import { ExecutionRecord, HookTriggerContext } from "./types";
import { MetricsSnapshot } from "./metricsCollector";

// Mock VS Code
vi.mock("vscode", () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

describe("OutputLogger", () => {
  let tempDir: string;
  let logger: OutputLogger;

  beforeEach(() => {
    // Create a temporary directory for test log files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "outputlogger-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (logger) {
      logger.dispose();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Constructor and Configuration", () => {
    it("should create logger without file logging by default", () => {
      logger = new OutputLogger("Test Channel");
      
      expect(logger.isFileLoggingEnabled()).toBe(false);
      expect(logger.getLogFilePath()).toBeUndefined();
    });

    it("should create logger with file logging enabled via config", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      
      logger = new OutputLogger("Test Channel", config);
      
      expect(logger.isFileLoggingEnabled()).toBe(true);
      expect(logger.getLogFilePath()).toBe(path.join(tempDir, ".kiro", "logs", "hooks.log"));
    });

    it("should create .kiro/logs directory when file logging is enabled", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      
      logger = new OutputLogger("Test Channel", config);
      
      const logsDir = path.join(tempDir, ".kiro", "logs");
      expect(fs.existsSync(logsDir)).toBe(true);
    });

    it("should not enable file logging without workspace root", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        // No workspaceRoot
      };
      
      logger = new OutputLogger("Test Channel", config);
      
      expect(logger.isFileLoggingEnabled()).toBe(false);
    });
  });

  describe("setFileLogging", () => {
    it("should enable file logging at runtime", () => {
      logger = new OutputLogger("Test Channel");
      
      expect(logger.isFileLoggingEnabled()).toBe(false);
      
      logger.setFileLogging(true, tempDir);
      
      expect(logger.isFileLoggingEnabled()).toBe(true);
      expect(logger.getLogFilePath()).toBe(path.join(tempDir, ".kiro", "logs", "hooks.log"));
    });

    it("should disable file logging at runtime", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
      
      expect(logger.isFileLoggingEnabled()).toBe(true);
      
      logger.setFileLogging(false);
      
      expect(logger.isFileLoggingEnabled()).toBe(false);
    });

    it("should use existing workspace root if not provided", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: false,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
      
      logger.setFileLogging(true);
      
      expect(logger.isFileLoggingEnabled()).toBe(true);
      expect(logger.getLogFilePath()).toBe(path.join(tempDir, ".kiro", "logs", "hooks.log"));
    });
  });

  describe("Structured Log File Writing", () => {
    beforeEach(() => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
    });

    describe("logInfo", () => {
      it("should write info log entry to JSONL file", () => {
        const ctx: Partial<HookTriggerContext> = { hookId: "test-hook" };
        
        logger.logInfo(ctx, "Test message");
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.level).toBe("info");
        expect(entry.hookId).toBe("test-hook");
        expect(entry.message).toBe("Test message");
        expect(entry.timestamp).toBeDefined();
      });

      it("should write info log without hookId when context is null", () => {
        logger.logInfo(null, "System message");
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.level).toBe("info");
        expect(entry.hookId).toBeUndefined();
        expect(entry.message).toBe("System message");
      });
    });

    describe("logError", () => {
      it("should write error log entry to JSONL file", () => {
        const ctx: Partial<HookTriggerContext> = { hookId: "error-hook" };
        
        logger.logError(ctx, "Error occurred");
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.level).toBe("error");
        expect(entry.hookId).toBe("error-hook");
        expect(entry.error).toBe("Error occurred");
      });

      it("should write error log entry from Error object", () => {
        const ctx: Partial<HookTriggerContext> = { hookId: "error-hook" };
        const error = new Error("Something went wrong");
        
        logger.logError(ctx, error);
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.level).toBe("error");
        expect(entry.error).toBe("Something went wrong");
      });
    });

    describe("logExecution", () => {
      it("should write execution log entry to JSONL file", () => {
        const record: ExecutionRecord = {
          id: "exec-1",
          hookId: "exec-hook",
          context: {
            hookId: "exec-hook",
            trigger: "fileEdited",
            timestamp: new Date().toISOString(),
            workspaceRoot: tempDir,
          },
          status: "success",
          attempt: 1,
          duration: 150,
          exitCode: 0,
        };
        
        logger.logExecution(record);
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.level).toBe("execution");
        expect(entry.hookId).toBe("exec-hook");
        expect(entry.status).toBe("success");
        expect(entry.attempt).toBe(1);
        expect(entry.duration).toBe(150);
        expect(entry.exitCode).toBe(0);
      });

      it("should write execution log with stdout and stderr", () => {
        const record: ExecutionRecord = {
          id: "exec-2",
          hookId: "output-hook",
          context: {
            hookId: "output-hook",
            trigger: "fileEdited",
            timestamp: new Date().toISOString(),
            workspaceRoot: tempDir,
          },
          status: "failure",
          attempt: 2,
          stdout: "Standard output",
          stderr: "Standard error",
          error: "Command failed",
        };
        
        logger.logExecution(record);
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
        
        expect(entry.stdout).toBe("Standard output");
        expect(entry.stderr).toBe("Standard error");
        expect(entry.error).toBe("Command failed");
      });
    });

    describe("Multiple log entries", () => {
      it("should append multiple entries as separate JSON lines", () => {
        logger.logInfo({ hookId: "hook-1" }, "First message");
        logger.logInfo({ hookId: "hook-2" }, "Second message");
        logger.logError({ hookId: "hook-3" }, "Error message");
        
        const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
        const lines = logContent.trim().split("\n");
        
        expect(lines.length).toBe(3);
        
        const entry1 = JSON.parse(lines[0]) as StructuredLogEntry;
        const entry2 = JSON.parse(lines[1]) as StructuredLogEntry;
        const entry3 = JSON.parse(lines[2]) as StructuredLogEntry;
        
        expect(entry1.message).toBe("First message");
        expect(entry2.message).toBe("Second message");
        expect(entry3.error).toBe("Error message");
      });
    });
  });

  describe("Secrets Redaction in Log File", () => {
    beforeEach(() => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
      logger.setSecretPatterns([/secret-\w+/g, /password=\S+/g]);
    });

    it("should redact secrets from info message in log file", () => {
      logger.logInfo({ hookId: "test" }, "API key: secret-abc123");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.message).toBe("API key: [REDACTED]");
      expect(entry.message).not.toContain("secret-abc123");
    });

    it("should redact secrets from error message in log file", () => {
      logger.logError({ hookId: "test" }, "Failed with password=hunter2");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.error).toBe("Failed with [REDACTED]");
      expect(entry.error).not.toContain("hunter2");
    });

    it("should redact secrets from execution stdout in log file", () => {
      const record: ExecutionRecord = {
        id: "exec-1",
        hookId: "test-hook",
        context: {
          hookId: "test-hook",
          trigger: "fileEdited",
          timestamp: new Date().toISOString(),
          workspaceRoot: tempDir,
        },
        status: "success",
        attempt: 1,
        stdout: "Output contains secret-xyz789",
      };
      
      logger.logExecution(record);
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.stdout).toBe("Output contains [REDACTED]");
      expect(entry.stdout).not.toContain("secret-xyz789");
    });

    it("should redact secrets from execution stderr in log file", () => {
      const record: ExecutionRecord = {
        id: "exec-1",
        hookId: "test-hook",
        context: {
          hookId: "test-hook",
          trigger: "fileEdited",
          timestamp: new Date().toISOString(),
          workspaceRoot: tempDir,
        },
        status: "failure",
        attempt: 1,
        stderr: "Error: password=secret123 invalid",
      };
      
      logger.logExecution(record);
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.stderr).toBe("Error: [REDACTED] invalid");
      expect(entry.stderr).not.toContain("secret123");
    });

    it("should redact multiple secrets in same message", () => {
      logger.logInfo(
        { hookId: "test" },
        "Connecting with secret-abc and password=xyz123"
      );
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.message).toBe("Connecting with [REDACTED] and [REDACTED]");
    });
  });

  describe("File Logging Disabled", () => {
    it("should not write to file when file logging is disabled", () => {
      logger = new OutputLogger("Test Channel");
      
      logger.logInfo({ hookId: "test" }, "This should not be written");
      
      const logsDir = path.join(tempDir, ".kiro", "logs");
      expect(fs.existsSync(logsDir)).toBe(false);
    });

    it("should not create log directory when file logging is disabled", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: false,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
      
      logger.logInfo({ hookId: "test" }, "Test message");
      
      const logsDir = path.join(tempDir, ".kiro", "logs");
      expect(fs.existsSync(logsDir)).toBe(false);
    });
  });

  describe("JSONL Format Validation", () => {
    beforeEach(() => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
    });

    it("should write valid JSON on each line", () => {
      logger.logInfo({ hookId: "hook-1" }, "Message 1");
      logger.logInfo({ hookId: "hook-2" }, "Message 2");
      logger.logError({ hookId: "hook-3" }, "Error 1");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const lines = logContent.trim().split("\n");
      
      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it("should include timestamp in ISO 8601 format", () => {
      logger.logInfo({ hookId: "test" }, "Test");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      // Validate ISO 8601 format
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it("should not include undefined fields in JSON output", () => {
      logger.logInfo({ hookId: "test" }, "Simple message");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim());
      
      // Should not have undefined fields serialized
      expect(Object.keys(entry)).not.toContain("error");
      expect(Object.keys(entry)).not.toContain("stdout");
      expect(Object.keys(entry)).not.toContain("stderr");
      expect(Object.keys(entry)).not.toContain("exitCode");
    });
  });

  describe("Error Handling", () => {
    it("should handle directory creation failure gracefully", () => {
      // Use an invalid path that can't be created
      const invalidPath = "/nonexistent/root/path";
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: invalidPath,
      };
      
      // Should not throw
      expect(() => new OutputLogger("Test Channel", config)).not.toThrow();
    });

    it("should continue working if log file write fails", () => {
      const config: OutputLoggerConfig = {
        enableFileLogging: true,
        workspaceRoot: tempDir,
      };
      logger = new OutputLogger("Test Channel", config);
      
      // Make the log file read-only to cause write failure
      const logFilePath = logger.getLogFilePath()!;
      fs.writeFileSync(logFilePath, "");
      fs.chmodSync(logFilePath, 0o444);
      
      // Should not throw even when write fails
      expect(() => logger.logInfo({ hookId: "test" }, "Test")).not.toThrow();
      
      // Restore permissions for cleanup
      fs.chmodSync(logFilePath, 0o644);
    });
  });

  describe("Secret Patterns Management", () => {
    beforeEach(() => {
      logger = new OutputLogger("Test Channel");
    });

    it("should set secret patterns", () => {
      logger.setSecretPatterns([/secret/g]);
      
      // Verify by checking redaction works (indirectly through file logging)
      logger.setFileLogging(true, tempDir);
      logger.logInfo({ hookId: "test" }, "This is secret data");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.message).toBe("This is [REDACTED] data");
    });

    it("should add secret patterns from strings", () => {
      const errors = logger.addSecretPatternsFromStrings(["password=\\S+"]);
      
      expect(errors.length).toBe(0);
      
      logger.setFileLogging(true, tempDir);
      logger.logInfo({ hookId: "test" }, "Config: password=secret123");
      
      const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
      const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;
      
      expect(entry.message).toBe("Config: [REDACTED]");
    });

    it("should return errors for invalid pattern strings", () => {
      const errors = logger.addSecretPatternsFromStrings(["[invalid", "valid-\\w+"]);
      
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("Invalid pattern");
      expect(errors[0]).toContain("[invalid");
    });
  });
});


describe("logMetrics", () => {
  let tempDir: string;
  let logger: OutputLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "outputlogger-metrics-test-"));
    const config: OutputLoggerConfig = {
      enableFileLogging: true,
      workspaceRoot: tempDir,
    };
    logger = new OutputLogger("Test Channel", config);
  });

  afterEach(() => {
    if (logger) {
      logger.dispose();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should log metrics snapshot via logInfo", () => {
    const metrics = {
      queueLength: 2,
      activeExecutions: 3,
      totalEnqueued: 150,
      successCount: 140,
      failureCount: 8,
      timeoutCount: 2,
      canceledCount: 0,
      timestamp: new Date().toISOString(),
    };

    logger.logMetrics(metrics);

    const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
    const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;

    expect(entry.level).toBe("info");
    expect(entry.message).toContain("Metrics snapshot");
    expect(entry.message).toContain("Queue Length: 2");
    expect(entry.message).toContain("Active Executions: 3");
    expect(entry.message).toContain("Total Enqueued: 150");
    expect(entry.message).toContain("Success: 140");
    expect(entry.message).toContain("Failure: 8");
    expect(entry.message).toContain("Timeout: 2");
    expect(entry.message).toContain("Canceled: 0");
  });

  it("should log metrics with zero values", () => {
    const metrics = {
      queueLength: 0,
      activeExecutions: 0,
      totalEnqueued: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      canceledCount: 0,
      timestamp: new Date().toISOString(),
    };

    logger.logMetrics(metrics);

    const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
    const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;

    expect(entry.message).toContain("Queue Length: 0");
    expect(entry.message).toContain("Success: 0");
  });

  it("should log metrics without hookId context", () => {
    const metrics = {
      queueLength: 1,
      activeExecutions: 1,
      totalEnqueued: 5,
      successCount: 3,
      failureCount: 1,
      timeoutCount: 0,
      canceledCount: 0,
      timestamp: new Date().toISOString(),
    };

    logger.logMetrics(metrics);

    const logContent = fs.readFileSync(logger.getLogFilePath()!, "utf8");
    const entry = JSON.parse(logContent.trim()) as StructuredLogEntry;

    // Should not have hookId since it's a system-level log
    expect(entry.hookId).toBeUndefined();
  });
});
