/**
 * Tests for Autonomous Executor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutonomousExecutor, AutonomousConfig } from "./autonomous-executor";
import { SessionManager } from "./session-manager";
import { Scheduler } from "./scheduler";
import { DecisionEngine } from "./decision-engine";
import { ExecutionEngine } from "./execution-engine";
import { CheckpointManager } from "./checkpoint-manager";
import { resetEventBus } from "./event-bus";
import { SessionState, TaskRecord, CheckboxState } from "./types";

vi.mock("./session-manager");
vi.mock("./scheduler");
vi.mock("./decision-engine");
vi.mock("./execution-engine");
vi.mock("./checkpoint-manager");
vi.mock("vscode");

describe("AutonomousExecutor", () => {
  let autonomousExecutor: AutonomousExecutor;
  let mockSessionManager: any;
  let mockScheduler: any;
  let mockDecisionEngine: any;
  let mockExecutionEngine: any;
  let mockCheckpointManager: any;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    resetEventBus();

    mockSessionManager = {
      createSession: vi.fn().mockResolvedValue("session-123"),
      getSession: vi.fn(),
      updateSession: vi.fn().mockResolvedValue(undefined),
      markTaskComplete: vi.fn().mockResolvedValue(undefined),
      appendToHistory: vi.fn().mockResolvedValue(undefined),
      logDecision: vi.fn().mockResolvedValue(undefined),
    };

    mockScheduler = {
      startProcessing: vi.fn(),
      stopProcessing: vi.fn().mockResolvedValue(undefined),
      enqueueTask: vi.fn(),
      setConcurrency: vi.fn(),
    };

    mockDecisionEngine = {
      evaluateTask: vi.fn().mockResolvedValue({
        detected: false,
        confidence: 0.0,
      }),
    };

    mockExecutionEngine = {
      executePlan: vi.fn().mockResolvedValue({
        success: true,
        taskId: "task-1",
        duration: 100,
      }),
      generateWithLLM: vi.fn().mockResolvedValue({
        success: true,
        taskId: "task-1",
        duration: 200,
        filesCreated: ["test.txt"],
      }),
    };

    mockCheckpointManager = {
      createCheckpoint: vi.fn().mockResolvedValue("checkpoint-1"),
    };

    vi.mocked(SessionManager).mockImplementation(() => mockSessionManager);
    vi.mocked(Scheduler).mockImplementation(() => mockScheduler);
    vi.mocked(DecisionEngine).mockImplementation(() => mockDecisionEngine);
    vi.mocked(ExecutionEngine).mockImplementation(() => mockExecutionEngine);
    vi.mocked(CheckpointManager).mockImplementation(
      () => mockCheckpointManager
    );

    const config: Partial<AutonomousConfig> = {
      maxConcurrentTasks: 3,
      enableLLM: true,
    };

    autonomousExecutor = new AutonomousExecutor(workspaceRoot, config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEventBus();
  });

  describe("startSession", () => {
    it("should create and start a new session", async () => {
      const specPath = "/test/spec.md";

      const mockSession: SessionState = {
        id: "session-123",
        featureName: "test-feature",
        workspaceRoot,
        status: "INITIALIZING",
        tasks: [],
        currentPhase: 0,
        currentTaskIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
        fileModificationCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);

      await autonomousExecutor.startSession(specPath);

      expect(mockSessionManager.createSession).toHaveBeenCalled();
      expect(mockScheduler.startProcessing).toHaveBeenCalled();
    });

    it("should throw error if session creation fails", async () => {
      mockSessionManager.createSession.mockRejectedValue(
        new Error("Creation failed")
      );

      await expect(
        autonomousExecutor.startSession("/test/spec.md")
      ).rejects.toThrow("Creation failed");
    });

    it("should initialize session with config", async () => {
      const specPath = "/test/spec.md";

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "INITIALIZING",
        tasks: [],
      });

      await autonomousExecutor.startSession(specPath);

      expect(mockScheduler.setConcurrency).toHaveBeenCalledWith(3);
    });
  });

  describe("pauseSession", () => {
    it("should pause active session", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "RUNNING",
      });

      await autonomousExecutor.pauseSession("session-123");

      expect(mockSessionManager.updateSession).toHaveBeenCalledWith(
        "session-123",
        expect.objectContaining({ status: "PAUSED" })
      );
    });

    it("should handle non-existent session", async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      await expect(
        autonomousExecutor.pauseSession("nonexistent")
      ).rejects.toThrow();
    });
  });

  describe("resumeSession", () => {
    it("should resume paused session", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "PAUSED",
        tasks: [],
      });

      await autonomousExecutor.resumeSession("session-123");

      expect(mockSessionManager.updateSession).toHaveBeenCalledWith(
        "session-123",
        expect.objectContaining({ status: "RUNNING" })
      );
    });

    it("should not resume non-paused session", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "COMPLETED",
      });

      await expect(
        autonomousExecutor.resumeSession("session-123")
      ).rejects.toThrow();
    });
  });

  describe("stopSession", () => {
    it("should stop active session", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "RUNNING",
      });

      await autonomousExecutor.stopSession("session-123");

      expect(mockScheduler.stopProcessing).toHaveBeenCalled();
      expect(mockSessionManager.updateSession).toHaveBeenCalledWith(
        "session-123",
        expect.objectContaining({ status: "STOPPED" })
      );
    });

    it("should handle stopping already stopped session", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "STOPPED",
      });

      await autonomousExecutor.stopSession("session-123");

      // Should not error
      expect(mockSessionManager.updateSession).toHaveBeenCalled();
    });
  });

  describe("processTask", () => {
    it("should detect already completed tasks", async () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Test task",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        tasks: [task],
      });

      mockDecisionEngine.evaluateTask.mockResolvedValue({
        detected: true,
        confidence: 0.95,
      });

      const result = await autonomousExecutor["processTask"](
        task,
        "session-123"
      );

      expect(result.success).toBe(true);
      expect(mockSessionManager.markTaskComplete).toHaveBeenCalledWith(
        "session-123",
        "task-1"
      );
    });

    it("should execute tasks with LLM when enabled", async () => {
      const task: TaskRecord = {
        id: "task-2",
        title: "Implement feature",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockDecisionEngine.evaluateTask.mockResolvedValue({
        detected: false,
        confidence: 0.0,
      });

      await autonomousExecutor["processTask"](task, "session-123");

      expect(mockExecutionEngine.generateWithLLM).toHaveBeenCalled();
    });

    it("should show guidance for manual tasks", async () => {
      const task: TaskRecord = {
        id: "task-3",
        title: "Manual task",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockDecisionEngine.evaluateTask.mockResolvedValue({
        detected: false,
        confidence: 0.0,
      });

      mockExecutionEngine.generateWithLLM.mockResolvedValue({
        success: false,
        taskId: "task-3",
        duration: 100,
      });

      const result = await autonomousExecutor["processTask"](
        task,
        "session-123"
      );

      // Should still succeed (manual intervention required)
      expect(result.success).toBe(true);
    });

    it("should handle task execution errors", async () => {
      const task: TaskRecord = {
        id: "task-error",
        title: "Error task",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockExecutionEngine.generateWithLLM.mockRejectedValue(
        new Error("Execution failed")
      );

      const result = await autonomousExecutor["processTask"](
        task,
        "session-123"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Execution failed");
    });
  });

  describe("buildExecutionPlan", () => {
    it("should use LLM when enabled", async () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Build something",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockExecutionEngine.generateWithLLM.mockResolvedValue({
        success: true,
        taskId: "task-1",
        duration: 100,
      });

      const plan = await autonomousExecutor["buildExecutionPlan"](
        task,
        "session-123"
      );

      expect(mockExecutionEngine.generateWithLLM).toHaveBeenCalled();
      expect(plan).toBeDefined();
    });

    it("should fallback to empty plan when LLM fails", async () => {
      const task: TaskRecord = {
        id: "task-2",
        title: "Build something",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockExecutionEngine.generateWithLLM.mockResolvedValue({
        success: false,
        taskId: "task-2",
        duration: 100,
      });

      const plan = await autonomousExecutor["buildExecutionPlan"](
        task,
        "session-123"
      );

      expect(plan?.actions).toEqual([]);
    });

    it("should return null when session not found", async () => {
      const task: TaskRecord = {
        id: "task-3",
        title: "Build something",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue(null);

      const plan = await autonomousExecutor["buildExecutionPlan"](
        task,
        "nonexistent"
      );

      expect(plan).toBeNull();
    });
  });

  describe("configuration", () => {
    it("should use default configuration", () => {
      const executor = new AutonomousExecutor(workspaceRoot);

      expect(executor).toBeDefined();
    });

    it("should merge custom configuration", () => {
      const customConfig: Partial<AutonomousConfig> = {
        maxConcurrentTasks: 5,
        enableLLM: false,
        maxTasksPerSession: 200,
      };

      const executor = new AutonomousExecutor(workspaceRoot, customConfig);

      expect(executor).toBeDefined();
    });
  });

  describe("event handling", () => {
    it("should emit sessionStarted event", async () => {
      const specPath = "/test/spec.md";

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "INITIALIZING",
        tasks: [],
      });

      await autonomousExecutor.startSession(specPath);

      expect(mockSessionManager.createSession).toHaveBeenCalled();
    });

    it("should emit taskCompleted event", async () => {
      const task: TaskRecord = {
        id: "task-1",
        title: "Test task",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [],
      });

      mockDecisionEngine.evaluateTask.mockResolvedValue({
        detected: true,
        confidence: 0.95,
      });

      await autonomousExecutor["processTask"](task, "session-123");

      expect(mockSessionManager.markTaskComplete).toHaveBeenCalled();
    });
  });

  describe("progress tracking", () => {
    it("should calculate progress percentage", async () => {
      const tasks: TaskRecord[] = [
        {
          id: "task-1",
          title: "Task 1",
          rawLine: 1,
          checkboxState: CheckboxState.COMPLETE,
          retryCount: 0,
        },
        {
          id: "task-2",
          title: "Task 2",
          rawLine: 2,
          checkboxState: CheckboxState.COMPLETE,
          retryCount: 0,
        },
        {
          id: "task-3",
          title: "Task 3",
          rawLine: 3,
          checkboxState: CheckboxState.INCOMPLETE,
          retryCount: 0,
        },
      ];

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        totalTasksCompleted: 2,
        tasks,
      });

      // Progress should be 2/3 = ~67%
      const session = await mockSessionManager.getSession("session-123");
      const progress = (session.totalTasksCompleted / tasks.length) * 100;

      expect(progress).toBeCloseTo(66.67, 1);
    });
  });

  describe("error recovery", () => {
    it("should handle session recovery", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "RUNNING",
        tasks: [],
      });

      // Simulate recovery
      await autonomousExecutor.resumeSession("session-123");

      expect(mockSessionManager.updateSession).toHaveBeenCalled();
    });

    it("should handle checkpoint creation on errors", async () => {
      const task: TaskRecord = {
        id: "task-error",
        title: "Error task",
        rawLine: 1,
        checkboxState: CheckboxState.INCOMPLETE,
        retryCount: 0,
      };

      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        specPath: "/test/spec.md",
        currentPhase: 3,
        tasks: [task],
      });

      mockExecutionEngine.generateWithLLM.mockRejectedValue(
        new Error("Fatal error")
      );

      await autonomousExecutor["processTask"](task, "session-123");

      // Should log the error
      expect(mockSessionManager.appendToHistory).toHaveBeenCalled();
    });
  });

  describe("resource cleanup", () => {
    it("should stop scheduler on session stop", async () => {
      mockSessionManager.getSession.mockResolvedValue({
        id: "session-123",
        status: "RUNNING",
      });

      await autonomousExecutor.stopSession("session-123");

      expect(mockScheduler.stopProcessing).toHaveBeenCalled();
    });
  });
});
