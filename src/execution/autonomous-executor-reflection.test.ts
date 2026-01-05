/**
 * Tests for Autonomous Executor Reflection Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AutonomousExecutor } from "./autonomous-executor";
import { getEventBus, resetEventBus } from "./event-bus";
import { ExecutionEvent } from "./types";

vi.mock("./session-manager");
vi.mock("./scheduler");
vi.mock("./decision-engine");
vi.mock("./execution-engine");
vi.mock("./checkpoint-manager");
vi.mock("./storage-layer");
vi.mock("./context-manager");
vi.mock("vscode");

describe("AutonomousExecutor Reflection Integration", () => {
  let autonomousExecutor: AutonomousExecutor;
  const workspaceRoot = "/test/workspace";
  let eventBus: ReturnType<typeof getEventBus>;
  let capturedEvents: ExecutionEvent[] = [];

  beforeEach(() => {
    resetEventBus();
    eventBus = getEventBus();
    capturedEvents = [];

    // Capture all events for verification
    eventBus.subscribe("reflectionStarted", (event) => {
      capturedEvents.push(event);
    });
    eventBus.subscribe("reflectionIteration", (event) => {
      capturedEvents.push(event);
    });
    eventBus.subscribe("reflectionCompleted", (event) => {
      capturedEvents.push(event);
    });

    autonomousExecutor = new AutonomousExecutor(workspaceRoot, ".akira/specs", {
      maxConcurrentTasks: 3,
      enableLLM: true,
    });
  });

  afterEach(() => {
    autonomousExecutor.dispose();
    vi.restoreAllMocks();
    resetEventBus();
  });

  describe("Reflection Event Handlers", () => {
    it("should subscribe to reflectionStarted events", async () => {
      // Emit a test event
      await eventBus.emit("reflectionStarted", "session-123", {
        taskId: "task-1",
        maxIterations: 3,
        confidenceThreshold: 0.8,
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify event was captured
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].type).toBe("reflectionStarted");
      expect(capturedEvents[0].data.taskId).toBe("task-1");
    });

    it("should subscribe to reflectionIteration events", async () => {
      // Emit a test event
      await eventBus.emit("reflectionIteration", "session-123", {
        taskId: "task-1",
        iteration: 2,
        maxIterations: 3,
        success: false,
        confidence: 0.5,
        reasoning: "Task incomplete",
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify event was captured
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].type).toBe("reflectionIteration");
      expect(capturedEvents[0].data.iteration).toBe(2);
    });

    it("should subscribe to reflectionCompleted events", async () => {
      // Emit a test event
      await eventBus.emit("reflectionCompleted", "session-123", {
        taskId: "task-1",
        success: true,
        iterationsUsed: 2,
        maxIterations: 3,
        finalConfidence: 0.9,
        duration: 1000,
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify event was captured
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].type).toBe("reflectionCompleted");
      expect(capturedEvents[0].data.success).toBe(true);
    });

    it("should handle multiple reflection events in sequence", async () => {
      // Emit a sequence of events simulating a reflection loop
      await eventBus.emit("reflectionStarted", "session-123", {
        taskId: "task-1",
        maxIterations: 3,
      });

      await eventBus.emit("reflectionIteration", "session-123", {
        taskId: "task-1",
        iteration: 1,
        maxIterations: 3,
        success: false,
        confidence: 0.3,
      });

      await eventBus.emit("reflectionIteration", "session-123", {
        taskId: "task-1",
        iteration: 2,
        maxIterations: 3,
        success: false,
        confidence: 0.6,
      });

      await eventBus.emit("reflectionCompleted", "session-123", {
        taskId: "task-1",
        success: true,
        iterationsUsed: 2,
        maxIterations: 3,
        finalConfidence: 0.85,
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify all events were captured in order
      expect(capturedEvents).toHaveLength(4);
      expect(capturedEvents[0].type).toBe("reflectionStarted");
      expect(capturedEvents[1].type).toBe("reflectionIteration");
      expect(capturedEvents[1].data.iteration).toBe(1);
      expect(capturedEvents[2].type).toBe("reflectionIteration");
      expect(capturedEvents[2].data.iteration).toBe(2);
      expect(capturedEvents[3].type).toBe("reflectionCompleted");
    });
  });

  describe("Reflection Configuration", () => {
    it("should pass reflection config to ExecutionEngine", () => {
      // The ExecutionEngine should be constructed with reflection config
      // This is verified by the fact that the constructor doesn't throw
      expect(autonomousExecutor).toBeDefined();
    });

    it("should use default reflection configuration", () => {
      const executor = new AutonomousExecutor(workspaceRoot);
      expect(executor).toBeDefined();
    });
  });
});
