/**
 * Tests for Scheduler
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler";
import { TaskRecord } from "./types";

describe("Scheduler", () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler({ maxConcurrentTasks: 2 });
  });

  afterEach(async () => {
    // Ensure scheduler is stopped and cleaned up
    if (scheduler) {
      await scheduler.stopProcessing();
      scheduler.shutdown();
    }
  });

  describe("enqueueTask", () => {
    it("should add task to queue", () => {
      const task: TaskRecord = {
        id: "1.1",
        title: "Test task",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      scheduler.enqueueTask(task, "session-123");

      const status = scheduler.getStatus();
      expect(status.queueLength).toBe(1);
    });

    it("should respect priority ordering", () => {
      const task1: TaskRecord = {
        id: "1.1",
        title: "Low priority",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      const task2: TaskRecord = {
        id: "1.2",
        title: "High priority",
        rawLine: 2,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      scheduler.enqueueTask(task1, "session-123", 1);
      scheduler.enqueueTask(task2, "session-123", 10);

      const queue = scheduler.getQueue();
      expect(queue[0].task.id).toBe("1.2"); // High priority first
      expect(queue[1].task.id).toBe("1.1");
    });
  });

  describe("concurrency control", () => {
    it.skip("should respect max concurrency", async () => {
      let activeCount = 0;
      let maxActive = 0;
      let completed = 0;

      scheduler.setExecutor(async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeCount--;
        completed++;
        return { success: true };
      });

      const tasks: TaskRecord[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Task ${i + 1}`,
        rawLine: i + 1,
        checkboxState: "PENDING" as const,
        retryCount: 0,
      }));

      scheduler.enqueueTasks(tasks, "session-123");
      
      // Start processing (don't await, it runs forever)
      scheduler.startProcessing();

      // Wait for all tasks to complete
      const maxWait = Date.now() + 5000;
      while (completed < 10 && Date.now() < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await scheduler.stopProcessing();

      expect(maxActive).toBeLessThanOrEqual(2); // Max concurrency of 2
      expect(completed).toBe(10);
    });

    it("should allow changing concurrency", () => {
      scheduler.setConcurrency(5);
      expect(() => scheduler.setConcurrency(5)).not.toThrow();
    });

    it("should reject invalid concurrency", () => {
      expect(() => scheduler.setConcurrency(0)).toThrow();
      expect(() => scheduler.setConcurrency(11)).toThrow();
    });
  });

  describe("lifecycle", () => {
    it.skip("should start and stop processing", async () => {
      const task: TaskRecord = {
        id: "1.1",
        title: "Test",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      let executed = false;
      scheduler.setExecutor(async () => {
        executed = true;
        return { success: true };
      });

      scheduler.enqueueTask(task, "session-123");
      
      // Start processing (don't await)
      scheduler.startProcessing();

      // Wait a bit for task to execute
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(executed).toBe(true);

      await scheduler.stopProcessing();
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it("should shutdown immediately and clear queue", async () => {
      const tasks: TaskRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Task ${i + 1}`,
        rawLine: i + 1,
        checkboxState: "PENDING" as const,
        retryCount: 0,
      }));

      scheduler.enqueueTasks(tasks, "session-123");
      expect(scheduler.getStatus().queueLength).toBe(5);

      await scheduler.shutdown();

      expect(scheduler.getStatus().queueLength).toBe(0);
      expect(scheduler.getStatus().isRunning).toBe(false);
    });
  });

  describe("dequeueTask", () => {
    it("should remove task from queue", () => {
      const task: TaskRecord = {
        id: "1.1",
        title: "Test",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      scheduler.enqueueTask(task, "session-123");
      expect(scheduler.getStatus().queueLength).toBe(1);

      const removed = scheduler.dequeueTask("1.1");
      expect(removed).toBe(true);
      expect(scheduler.getStatus().queueLength).toBe(0);
    });

    it("should return false for non-existent task", () => {
      const removed = scheduler.dequeueTask("999");
      expect(removed).toBe(false);
    });
  });
});
