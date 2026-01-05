/**
 * Tests for Event Bus
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventBus, getEventBus, resetEventBus } from "./event-bus";
import { ExecutionEvent, ExecutionEventType } from "./types";

describe("EventBus", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("subscribe and publish", () => {
    it("should call handler when event is published", () => {
      const handler = vi.fn();
      eventBus.subscribe("sessionStarted", handler);

      const event: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: { specPath: "/spec/test.md" },
      };

      eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call multiple handlers for same event type", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe("taskCompleted", handler1);
      eventBus.subscribe("taskCompleted", handler2);

      const event: ExecutionEvent = {
        type: "taskCompleted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: { taskId: "task-1" },
      };

      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it("should not call handler for different event type", () => {
      const handler = vi.fn();
      eventBus.subscribe("sessionStarted", handler);

      const event: ExecutionEvent = {
        type: "sessionCompleted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("wildcard handlers", () => {
    it("should call wildcard handler for any event", () => {
      const handler = vi.fn();
      eventBus.subscribe("*", handler);

      const event1: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      const event2: ExecutionEvent = {
        type: "taskCompleted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      eventBus.publish(event1);
      eventBus.publish(event2);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(event1);
      expect(handler).toHaveBeenCalledWith(event2);
    });
  });

  describe("unsubscribe", () => {
    it("should remove handler from subscriptions", () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe("sessionStarted", handler);

      unsubscribe();

      const event: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("emit", () => {
    it("should create and publish event", async () => {
      const handler = vi.fn();
      eventBus.subscribe("taskStarted", handler);

      await eventBus.emit("taskStarted", "session-1", { taskId: "task-1" });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "taskStarted",
          sessionId: "session-1",
          data: { taskId: "task-1" },
        })
      );
    });
  });

  describe("error handling", () => {
    it("should isolate errors in handlers", () => {
      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const successHandler = vi.fn();

      eventBus.subscribe("sessionStarted", errorHandler);
      eventBus.subscribe("sessionStarted", successHandler);

      const event: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      expect(() => eventBus.publish(event)).not.toThrow();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe("event history", () => {
    it("should track published events", () => {
      const event: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      eventBus.publish(event);

      const history = eventBus.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(event);
    });

    it("should filter history by session", () => {
      const event1: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        data: {},
      };

      const event2: ExecutionEvent = {
        type: "sessionStarted",
        sessionId: "session-2",
        timestamp: new Date().toISOString(),
        data: {},
      };

      eventBus.publish(event1);
      eventBus.publish(event2);

      const history = eventBus.getHistory("session-1");
      expect(history).toHaveLength(1);
      expect(history[0].sessionId).toBe("session-1");
    });

    it("should limit history size", () => {
      // Publish more than max history size (1000)
      for (let i = 0; i < 1100; i++) {
        eventBus.publish({
          type: "taskStarted",
          sessionId: "session-1",
          timestamp: new Date().toISOString(),
          data: { taskId: `task-${i}` },
        });
      }

      const history = eventBus.getHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("singleton", () => {
    it("should return same instance", () => {
      resetEventBus();
      const instance1 = getEventBus();
      const instance2 = getEventBus();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = getEventBus();
      resetEventBus();
      const instance2 = getEventBus();

      expect(instance1).not.toBe(instance2);
    });
  });
});
