/**
 * Execution Engine Integration Tests
 * Tests execution engine components working together (without VS Code)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { EventBus, getEventBus, resetEventBus } from "./execution/event-bus";
import { StorageLayer } from "./execution/storage-layer";
import { SessionManager } from "./execution/session-manager";
import { Scheduler } from "./execution/scheduler";
import { DecisionEngine } from "./execution/decision-engine";
import { ExecutionEngine } from "./execution/execution-engine";
import { CheckpointManager } from "./execution/checkpoint-manager";
import { GitIntegrator } from "./execution/git-integrator";
import {
  SessionState,
  TaskRecord,
  CheckboxState,
  ExecutionPlan,
} from "./execution/types";

describe("Execution Engine Integration Tests", () => {
  let tempDir: string;
  let eventBus: EventBus;
  let storage: StorageLayer;
  let sessionManager: SessionManager;
  let scheduler: Scheduler;
  let decisionEngine: DecisionEngine;
  let executionEngine: ExecutionEngine;
  let checkpointManager: CheckpointManager;
  let gitIntegrator: GitIntegrator;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "exec-integration-"));

    // Initialize components
    resetEventBus();
    eventBus = getEventBus();
    storage = new StorageLayer(tempDir);
    sessionManager = new SessionManager(tempDir);
    scheduler = new Scheduler({ maxConcurrency: 3 });
    decisionEngine = new DecisionEngine(tempDir);
    executionEngine = new ExecutionEngine(tempDir, {
      requireApprovalForDestructive: false,
      maxFileModifications: 100,
    });
    checkpointManager = new CheckpointManager(tempDir);
    gitIntegrator = new GitIntegrator(tempDir);
  });

  afterEach(async () => {
    // Clean up
    await scheduler.stopProcessing();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    resetEventBus();
  });

  describe("Complete Session Lifecycle", () => {
    it("should create, run, and complete a session", async () => {
      // Create a spec file
      const specPath = path.join(tempDir, "test-spec.md");
      await fs.writeFile(
        specPath,
        `# Test Feature

## Requirements
- [ ] Requirement 1

## Design
- Design 1

## Tasks
- [ ] Task 1: Create test file
- [ ] Task 2: Write content
`
      );

      // Create session
      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      expect(sessionId).toMatch(/^session-\d+$/);

      // Verify session was created
      const session = await sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.specPath).toBe(specPath);
      expect(session?.status).toBe("INITIALIZING");

      // Update session to running
      await sessionManager.updateSession(sessionId, {
        status: "RUNNING",
      });

      const updatedSession = await sessionManager.getSession(sessionId);
      expect(updatedSession?.status).toBe("RUNNING");

      // Complete session
      await sessionManager.updateSession(sessionId, {
        status: "COMPLETED",
      });

      const completedSession = await sessionManager.getSession(sessionId);
      expect(completedSession?.status).toBe("COMPLETED");
    });

    it("should track events throughout session lifecycle", async () => {
      const events: any[] = [];
      eventBus.subscribe("*", (event) => events.push(event));

      const specPath = path.join(tempDir, "event-test-spec.md");
      await fs.writeFile(specPath, "# Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      await eventBus.emit("sessionStarted", sessionId, { specPath });
      await eventBus.emit("taskStarted", sessionId, { taskId: "task-1" });
      await eventBus.emit("taskCompleted", sessionId, { taskId: "task-1" });

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "sessionStarted")).toBe(true);
      expect(events.some((e) => e.type === "taskStarted")).toBe(true);
      expect(events.some((e) => e.type === "taskCompleted")).toBe(true);
    });
  });

  describe("Task Execution Flow", () => {
    it("should execute a complete task flow", async () => {
      const specPath = path.join(tempDir, "task-flow-spec.md");
      await fs.writeFile(
        specPath,
        `# Task Flow Test

## Tasks
- [ ] Create output.txt file

**Success Criteria:**
- File output.txt exists with content
`
      );

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Create execution plan
      const plan: ExecutionPlan = {
        taskId: "task-1",
        actions: [
          {
            type: "file-write",
            target: path.join(tempDir, "output.txt"),
            content: "Test content",
          },
        ],
      };

      // Execute plan
      const result = await executionEngine.executePlan(plan, sessionId);
      expect(result.success).toBe(true);
      expect(result.filesCreated).toContain(path.join(tempDir, "output.txt"));

      // Verify file was created
      const fileExists = await storage.fileExists(
        path.join(tempDir, "output.txt")
      );
      expect(fileExists).toBe(true);

      // Check with decision engine
      const task: TaskRecord = {
        id: "task-1",
        title: "Create output.txt file",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
        successCriteria: [
          {
            type: "file-exists",
            description: "File output.txt exists with content",
            validation: "output.txt",
          },
        ],
      };

      const decision = await decisionEngine.evaluateTask(task);
      expect(decision.detected).toBe(true);
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it("should handle task with command execution", async () => {
      const specPath = path.join(tempDir, "command-test-spec.md");
      await fs.writeFile(specPath, "# Command Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Create plan with command
      const plan: ExecutionPlan = {
        taskId: "task-cmd",
        actions: [
          {
            type: "command",
            target: "echo",
            command: "echo",
            args: ["Hello World"],
          },
        ],
      };

      // Execute command
      const result = await executionEngine.executePlan(plan, sessionId);
      expect(result.success).toBe(true);
      expect(result.commandsRun).toContain("echo");
    });
  });

  describe("Scheduler Integration", () => {
    it("should schedule and execute tasks concurrently", async () => {
      const specPath = path.join(tempDir, "scheduler-test-spec.md");
      await fs.writeFile(specPath, "# Scheduler Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      scheduler.startProcessing();

      const executedTasks: string[] = [];

      // Enqueue multiple tasks
      for (let i = 1; i <= 5; i++) {
        scheduler.enqueueTask(
          `task-${i}`,
          async () => {
            executedTasks.push(`task-${i}`);
            await new Promise((resolve) => setTimeout(resolve, 100));
          },
          { priority: i }
        );
      }

      // Wait for all tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(executedTasks.length).toBe(5);
    });

    it("should respect concurrency limits", async () => {
      const limitedScheduler = new Scheduler({ maxConcurrency: 2 });
      limitedScheduler.startProcessing();

      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 10 }, (_, i) =>
        limitedScheduler.enqueueTask(`task-${i}`, async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrent--;
        })
      );

      await Promise.all(tasks);
      await limitedScheduler.stopProcessing();

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("Checkpoint and Rollback", () => {
    it("should create and restore checkpoints", async () => {
      const specPath = path.join(tempDir, "checkpoint-test-spec.md");
      await fs.writeFile(specPath, "# Checkpoint Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Create some files
      const testFile1 = path.join(tempDir, "file1.txt");
      const testFile2 = path.join(tempDir, "file2.txt");
      await fs.writeFile(testFile1, "Content 1");
      await fs.writeFile(testFile2, "Content 2");

      // Create checkpoint
      const checkpointId = await checkpointManager.createCheckpoint(
        sessionId,
        1,
        [testFile1, testFile2]
      );

      expect(checkpointId).toMatch(/^phase-1-\d+$/);

      // Modify files
      await fs.writeFile(testFile1, "Modified Content 1");
      await fs.writeFile(testFile2, "Modified Content 2");

      // Verify modification
      const modified1 = await fs.readFile(testFile1, "utf-8");
      expect(modified1).toBe("Modified Content 1");

      // Restore checkpoint
      const result = await checkpointManager.restoreCheckpoint(
        sessionId,
        checkpointId
      );

      expect(result.success).toBe(true);
      expect(result.filesRestored.length).toBe(2);

      // Verify restoration
      const restored1 = await fs.readFile(testFile1, "utf-8");
      const restored2 = await fs.readFile(testFile2, "utf-8");
      expect(restored1).toBe("Content 1");
      expect(restored2).toBe("Content 2");
    });

    it("should list checkpoints", async () => {
      const specPath = path.join(tempDir, "list-checkpoint-spec.md");
      await fs.writeFile(specPath, "# List Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Create multiple checkpoints
      await checkpointManager.createCheckpoint(sessionId, 1, []);
      await checkpointManager.createCheckpoint(sessionId, 2, []);
      await checkpointManager.createCheckpoint(sessionId, 3, []);

      const checkpoints = await checkpointManager.listCheckpoints(sessionId);
      expect(checkpoints.length).toBe(3);
      expect(checkpoints[0].phase).toBe(1);
      expect(checkpoints[1].phase).toBe(2);
      expect(checkpoints[2].phase).toBe(3);
    });
  });

  describe("Decision Engine Integration", () => {
    it("should detect completion based on file existence", async () => {
      const testFile = path.join(tempDir, "decision-test.txt");

      const task: TaskRecord = {
        id: "task-file",
        title: "Create decision-test.txt",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
        successCriteria: [
          {
            type: "file-exists",
            description: "File decision-test.txt exists",
            validation: "decision-test.txt",
          },
        ],
      };

      // File doesn't exist yet
      let decision = await decisionEngine.evaluateTask(task);
      expect(decision.detected).toBe(false);

      // Create file
      await fs.writeFile(testFile, "test");

      // Now it should be detected
      decision = await decisionEngine.evaluateTask(task);
      expect(decision.detected).toBe(true);
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it("should parse success criteria from task description", async () => {
      const task: TaskRecord = {
        id: "task-parse",
        title: "Create files",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      const description = `Create test files

**Success Criteria:**
- File test1.txt exists
- File test2.txt exists
- Command \`npm test\` runs successfully
`;

      const criteria = decisionEngine.parseSuccessCriteriaFromDescription(
        description
      );

      expect(criteria.length).toBeGreaterThan(0);
      expect(criteria.some((c) => c.type === "file-exists")).toBe(true);
      expect(criteria.some((c) => c.type === "command-success")).toBe(true);
    });
  });

  describe("Git Integration", () => {
    it("should detect git availability", async () => {
      const canUseGit = await gitIntegrator.canRollbackWithGit();
      // Result depends on whether git is available and workspace is a repo
      expect(typeof canUseGit).toBe("boolean");
    });

    it("should get modified files if git available", async () => {
      const canUseGit = await gitIntegrator.canRollbackWithGit();

      if (canUseGit) {
        const modifiedFiles = await gitIntegrator.getModifiedFiles();
        expect(Array.isArray(modifiedFiles)).toBe(true);
      }
    });
  });

  describe("Storage Layer Integration", () => {
    it("should write files atomically", async () => {
      const testFile = path.join(tempDir, "atomic-test.txt");

      await storage.writeFileAtomic(testFile, "atomic content");

      const exists = await storage.fileExists(testFile);
      expect(exists).toBe(true);

      const content = await storage.readFile(testFile);
      expect(content).toBe("atomic content");
    });

    it("should queue and debounce writes", async () => {
      const testFile = path.join(tempDir, "queued-test.txt");

      // Queue multiple writes
      storage.queueWrite(testFile, "write 1");
      storage.queueWrite(testFile, "write 2");
      storage.queueWrite(testFile, "write 3");

      // Wait for debounce (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 200));

      const content = await storage.readFile(testFile);
      expect(content).toBe("write 3"); // Last write wins
    });

    it("should calculate file hashes", () => {
      const content1 = "test content";
      const content2 = "test content";
      const content3 = "different content";

      const hash1 = storage.calculateHash(content1);
      const hash2 = storage.calculateHash(content2);
      const hash3 = storage.calculateHash(content3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe("Event Bus Integration", () => {
    it("should coordinate events across components", async () => {
      const events: string[] = [];

      eventBus.subscribe("*", (event) => {
        events.push(event.type);
      });

      const specPath = path.join(tempDir, "event-coord-spec.md");
      await fs.writeFile(specPath, "# Event Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Simulate execution flow with events
      await eventBus.emit("sessionStarted", sessionId, {});
      await eventBus.emit("taskStarted", sessionId, { taskId: "task-1" });
      await eventBus.emit("taskCompleted", sessionId, { taskId: "task-1" });
      await eventBus.emit("checkpointCreated", sessionId, { phase: 1 });
      await eventBus.emit("sessionCompleted", sessionId, {});

      expect(events).toContain("sessionStarted");
      expect(events).toContain("taskStarted");
      expect(events).toContain("taskCompleted");
      expect(events).toContain("checkpointCreated");
      expect(events).toContain("sessionCompleted");
    });
  });

  describe("Error Recovery", () => {
    it("should retry failed operations", async () => {
      const specPath = path.join(tempDir, "retry-spec.md");
      await fs.writeFile(specPath, "# Retry Test");

      const sessionId = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      let attempts = 0;
      const failingTask = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Transient failure");
        }
        return "success";
      };

      scheduler.startProcessing();
      await scheduler.enqueueTask("retry-task", failingTask);

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have retried and succeeded
      expect(attempts).toBe(3);
    });

    it("should handle session recovery", async () => {
      const specPath = path.join(tempDir, "recovery-spec.md");
      await fs.writeFile(specPath, "# Recovery Test");

      // Create session
      const sessionId1 = await sessionManager.createSession({
        specPath,
        workspaceRoot: tempDir,
      });

      // Simulate crash - just get the session again
      const recoveredSession = await sessionManager.getSession(sessionId1);

      expect(recoveredSession).toBeDefined();
      expect(recoveredSession?.id).toBe(sessionId1);
    });
  });

  describe("Multi-Session Management", () => {
    it("should handle multiple concurrent sessions", async () => {
      const sessions: string[] = [];

      for (let i = 1; i <= 3; i++) {
        const specPath = path.join(tempDir, `spec-${i}.md`);
        await fs.writeFile(specPath, `# Spec ${i}`);

        const sessionId = await sessionManager.createSession({
          specPath,
          workspaceRoot: tempDir,
        });
        sessions.push(sessionId);
      }

      expect(sessions.length).toBe(3);

      // All sessions should be retrievable
      for (const sessionId of sessions) {
        const session = await sessionManager.getSession(sessionId);
        expect(session).toBeDefined();
      }
    });

    it("should list all sessions", async () => {
      // Create multiple sessions
      for (let i = 1; i <= 5; i++) {
        const specPath = path.join(tempDir, `multi-spec-${i}.md`);
        await fs.writeFile(specPath, `# Multi Spec ${i}`);
        await sessionManager.createSession({
          specPath,
          workspaceRoot: tempDir,
        });
      }

      const allSessions = await sessionManager.listSessions();
      expect(allSessions.length).toBeGreaterThanOrEqual(5);
    });
  });
});
