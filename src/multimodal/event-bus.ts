/**
 * Event Bus for Multimodal Input Support
 * Provides workspace event emission for analysis completion
 * Requirements: REQ-8.2
 */

import * as vscode from "vscode";
import { AnalysisResult } from "./types";

// ============================================================================
// Event Types
// ============================================================================

/**
 * Types of multimodal events that can be emitted
 */
export type MultimodalEventType =
  | "analysis.started"
  | "analysis.completed"
  | "analysis.failed"
  | "analysis.progress";

/**
 * Base event structure for multimodal events
 */
export interface MultimodalEvent {
  type: MultimodalEventType;
  timestamp: string;
  workspaceRoot: string;
  data: Record<string, unknown>;
}

/**
 * Event data for analysis completion
 * Requirement: REQ-8.2
 */
export interface AnalysisCompletedEvent extends MultimodalEvent {
  type: "analysis.completed";
  data: {
    result: AnalysisResult;
  };
}

/**
 * Event data for analysis start
 */
export interface AnalysisStartedEvent extends MultimodalEvent {
  type: "analysis.started";
  data: {
    imagePath: string;
    modelId: string;
  };
}

/**
 * Event data for analysis failure
 */
export interface AnalysisFailedEvent extends MultimodalEvent {
  type: "analysis.failed";
  data: {
    imagePath: string;
    error: string;
    errorCode?: string;
  };
}

/**
 * Event data for analysis progress
 */
export interface AnalysisProgressEvent extends MultimodalEvent {
  type: "analysis.progress";
  data: {
    imagePath: string;
    progress: number;
    message?: string;
  };
}

/**
 * Union type for all multimodal events
 */
export type AnyMultimodalEvent =
  | AnalysisCompletedEvent
  | AnalysisStartedEvent
  | AnalysisFailedEvent
  | AnalysisProgressEvent;

/**
 * Event handler function type
 */
export type MultimodalEventHandler = (event: AnyMultimodalEvent) => void | Promise<void>;

// ============================================================================
// Event Bus Interface
// ============================================================================

/**
 * Interface for the multimodal event bus
 */
export interface IMultimodalEventBus {
  /**
   * Subscribe to events of a specific type or all events ("*")
   * @param eventType - Event type to subscribe to, or "*" for all events
   * @param handler - Handler function to call when event is emitted
   * @returns Disposable to unsubscribe
   */
  subscribe(
    eventType: MultimodalEventType | "*",
    handler: MultimodalEventHandler
  ): vscode.Disposable;

  /**
   * Emit an event to all subscribers
   * @param event - Event to emit
   */
  emit(event: AnyMultimodalEvent): Promise<void>;

  /**
   * Emit an analysis completed event
   * Requirement: REQ-8.2
   * @param result - Analysis result
   * @param workspaceRoot - Workspace root path
   */
  emitAnalysisCompleted(result: AnalysisResult, workspaceRoot: string): Promise<void>;

  /**
   * Get event history
   * @param eventType - Optional event type to filter by
   * @returns Array of events
   */
  getHistory(eventType?: MultimodalEventType): AnyMultimodalEvent[];

  /**
   * Clear event history
   */
  clearHistory(): void;

  /**
   * Dispose of resources
   */
  dispose(): void;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Multimodal Event Bus for workspace event emission
 * Provides pub/sub functionality for analysis events
 * Requirement: REQ-8.2
 */
export class MultimodalEventBus implements IMultimodalEventBus {
  private handlers: Map<MultimodalEventType | "*", Set<MultimodalEventHandler>> = new Map();
  private eventHistory: AnyMultimodalEvent[] = [];
  private maxHistorySize: number;
  private disposables: vscode.Disposable[] = [];

  /**
   * VS Code event emitter for external extension consumers
   * Requirement: REQ-8.2
   */
  private readonly _onEvent = new vscode.EventEmitter<AnyMultimodalEvent>();

  /**
   * VS Code event for external extension consumers
   * Other extensions can subscribe to this event
   * Requirement: REQ-8.2
   */
  public readonly onEvent: vscode.Event<AnyMultimodalEvent> = this._onEvent.event;

  /**
   * VS Code event emitter specifically for analysis completion
   * Requirement: REQ-8.2
   */
  private readonly _onAnalysisCompleted = new vscode.EventEmitter<AnalysisCompletedEvent>();

  /**
   * VS Code event for analysis completion
   * External extensions and CI listeners can subscribe to this event
   * Requirement: REQ-8.2
   */
  public readonly onAnalysisCompleted: vscode.Event<AnalysisCompletedEvent> =
    this._onAnalysisCompleted.event;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
    this.disposables.push(this._onEvent, this._onAnalysisCompleted);
  }

  /**
   * Subscribe to events of a specific type or all events
   * @param eventType - Event type to subscribe to, or "*" for all events
   * @param handler - Handler function
   * @returns Disposable to unsubscribe
   */
  public subscribe(
    eventType: MultimodalEventType | "*",
    handler: MultimodalEventHandler
  ): vscode.Disposable {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return {
      dispose: () => {
        this.handlers.get(eventType)?.delete(handler);
      },
    };
  }

  /**
   * Emit an event to all subscribers
   * @param event - Event to emit
   */
  public async emit(event: AnyMultimodalEvent): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Fire VS Code event for external consumers
    // Requirement: REQ-8.2
    this._onEvent.fire(event);

    // Fire specific event type for analysis completion
    if (event.type === "analysis.completed") {
      this._onAnalysisCompleted.fire(event as AnalysisCompletedEvent);
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
   * Emit an analysis completed event
   * Requirement: REQ-8.2
   * @param result - Analysis result
   * @param workspaceRoot - Workspace root path
   */
  public async emitAnalysisCompleted(
    result: AnalysisResult,
    workspaceRoot: string
  ): Promise<void> {
    const event: AnalysisCompletedEvent = {
      type: "analysis.completed",
      timestamp: new Date().toISOString(),
      workspaceRoot,
      data: {
        result,
      },
    };
    await this.emit(event);
  }

  /**
   * Emit an analysis started event
   * @param imagePath - Path to the image being analyzed
   * @param modelId - Model identifier
   * @param workspaceRoot - Workspace root path
   */
  public async emitAnalysisStarted(
    imagePath: string,
    modelId: string,
    workspaceRoot: string
  ): Promise<void> {
    const event: AnalysisStartedEvent = {
      type: "analysis.started",
      timestamp: new Date().toISOString(),
      workspaceRoot,
      data: {
        imagePath,
        modelId,
      },
    };
    await this.emit(event);
  }

  /**
   * Emit an analysis failed event
   * @param imagePath - Path to the image
   * @param error - Error message
   * @param errorCode - Optional error code
   * @param workspaceRoot - Workspace root path
   */
  public async emitAnalysisFailed(
    imagePath: string,
    error: string,
    workspaceRoot: string,
    errorCode?: string
  ): Promise<void> {
    const event: AnalysisFailedEvent = {
      type: "analysis.failed",
      timestamp: new Date().toISOString(),
      workspaceRoot,
      data: {
        imagePath,
        error,
        errorCode,
      },
    };
    await this.emit(event);
  }

  /**
   * Emit an analysis progress event
   * @param imagePath - Path to the image
   * @param progress - Progress percentage (0-100)
   * @param workspaceRoot - Workspace root path
   * @param message - Optional progress message
   */
  public async emitAnalysisProgress(
    imagePath: string,
    progress: number,
    workspaceRoot: string,
    message?: string
  ): Promise<void> {
    const event: AnalysisProgressEvent = {
      type: "analysis.progress",
      timestamp: new Date().toISOString(),
      workspaceRoot,
      data: {
        imagePath,
        progress,
        message,
      },
    };
    await this.emit(event);
  }

  /**
   * Get event history
   * @param eventType - Optional event type to filter by
   * @returns Array of events
   */
  public getHistory(eventType?: MultimodalEventType): AnyMultimodalEvent[] {
    if (eventType) {
      return this.eventHistory.filter((e) => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.handlers.clear();
    this.eventHistory = [];
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let eventBusInstance: MultimodalEventBus | null = null;

/**
 * Get the global multimodal event bus instance
 * Requirement: REQ-8.2
 */
export function getMultimodalEventBus(): MultimodalEventBus {
  if (!eventBusInstance) {
    eventBusInstance = new MultimodalEventBus();
  }
  return eventBusInstance;
}

/**
 * Reset the event bus (for testing)
 */
export function resetMultimodalEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.dispose();
    eventBusInstance = null;
  }
}
