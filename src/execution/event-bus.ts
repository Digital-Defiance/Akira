/**
 * Event Bus for Autonomous Execution
 * Central pub/sub system for execution events
 */

import {
  ExecutionEvent,
  ExecutionEventType,
  EventHandler,
} from "./types";

/**
 * Event Bus for managing execution events
 */
export class EventBus {
  private handlers: Map<ExecutionEventType | "*", Set<EventHandler>> = new Map();
  private eventHistory: ExecutionEvent[] = [];
  private maxHistorySize: number = 1000;

  /**
   * Subscribe to a specific event type or all events ("*")
   */
  subscribe(eventType: ExecutionEventType | "*", handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Publish an event to all subscribers
   */
  async publish(event: ExecutionEvent): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify specific handlers
    const specificHandlers = this.handlers.get(event.type);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      }
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error in wildcard event handler:`, error);
        }
      }
    }
  }

  /**
   * Create and publish an event
   */
  async emit(
    type: ExecutionEventType,
    sessionId: string,
    data: Record<string, any> = {}
  ): Promise<void> {
    const event: ExecutionEvent = {
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      data,
    };
    await this.publish(event);
  }

  /**
   * Get event history for a session
   */
  getHistory(sessionId?: string): ExecutionEvent[] {
    if (sessionId) {
      return this.eventHistory.filter((e) => e.sessionId === sessionId);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Remove all handlers
   */
  dispose(): void {
    this.handlers.clear();
    this.eventHistory = [];
  }
}

// Singleton instance
let eventBusInstance: EventBus | null = null;

/**
 * Get the global event bus instance
 */
export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

/**
 * Reset the event bus (for testing)
 */
export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.dispose();
    eventBusInstance = null;
  }
}
