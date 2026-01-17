/**
 * Results Manager for Multimodal Input Support
 * Coordinates persistence, annotations, and event emission for analysis results
 * Requirements: REQ-5.1, REQ-8.2
 */

import * as vscode from "vscode";
import {
  AnalysisResult,
  PersistedResult,
} from "./types";
import {
  PersistenceService,
  createPersistedResult,
} from "./persistence-service";
import {
  MultimodalEventBus,
  getMultimodalEventBus,
} from "./event-bus";

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event data emitted when analysis completes
 * Requirement: REQ-8.2
 */
export interface AnalysisCompletedEventData {
  result: AnalysisResult;
  workspaceRoot: string;
  timestamp: string;
}

// ============================================================================
// Results Manager Interface
// ============================================================================

/**
 * Interface for results manager operations
 */
export interface IResultsManager {
  /**
   * Process and store analysis result
   * @param result - Analysis result to process
   * @returns Processed result with persistence confirmation
   */
  processResult(result: AnalysisResult): Promise<PersistedResult>;

  /**
   * Get analysis history for workspace
   * @param workspaceRoot - Workspace root path
   * @returns Array of persisted results
   */
  getHistory(workspaceRoot: string): Promise<PersistedResult[]>;

  /**
   * Clear analysis history
   * @param workspaceRoot - Workspace root path
   */
  clearHistory(workspaceRoot: string): Promise<void>;
}

// ============================================================================
// ResultsManager Class
// ============================================================================

/**
 * Results Manager for coordinating analysis result processing
 * Requirements: REQ-5.1, REQ-8.2
 */
export class ResultsManager implements IResultsManager {
  private persistenceService: PersistenceService;
  private workspaceRoot: string;
  private eventBus: MultimodalEventBus;

  /**
   * Event emitter for analysis completion events
   * Requirement: REQ-8.2
   */
  private readonly _onAnalysisCompleted = new vscode.EventEmitter<AnalysisCompletedEventData>();

  /**
   * Event fired when an analysis completes
   * External extensions and CI listeners can subscribe to this event
   * Requirement: REQ-8.2
   */
  public readonly onAnalysisCompleted: vscode.Event<AnalysisCompletedEventData> =
    this._onAnalysisCompleted.event;

  constructor(
    workspaceRoot: string,
    persistenceService?: PersistenceService,
    eventBus?: MultimodalEventBus
  ) {
    this.workspaceRoot = workspaceRoot;
    this.persistenceService = persistenceService ?? new PersistenceService();
    this.eventBus = eventBus ?? getMultimodalEventBus();
  }

  /**
   * Process and store an analysis result
   * Coordinates persistence, annotations, and event emission
   * Requirements: REQ-5.1, REQ-8.2
   * 
   * @param result - The analysis result to process
   * @returns The persisted result with storage confirmation
   */
  public async processResult(result: AnalysisResult): Promise<PersistedResult> {
    // Create persisted result format
    const persistedResult = createPersistedResult(result);

    // Write to persistence storage
    // Requirement: REQ-5.1
    await this.persistenceService.writeResult(this.workspaceRoot, persistedResult);

    // Emit workspace event for external consumers via event bus
    // Requirement: REQ-8.2
    await this.eventBus.emitAnalysisCompleted(result, this.workspaceRoot);

    // Emit local event for internal consumers
    // Requirement: REQ-8.2
    this._onAnalysisCompleted.fire({
      result,
      workspaceRoot: this.workspaceRoot,
      timestamp: new Date().toISOString(),
    });

    return persistedResult;
  }

  /**
   * Get analysis history for the workspace
   * Requirement: REQ-5.1
   * 
   * @param workspaceRoot - Workspace root path
   * @returns Array of persisted results
   */
  public async getHistory(workspaceRoot: string): Promise<PersistedResult[]> {
    const resultsFile = await this.persistenceService.readResults(workspaceRoot);
    return resultsFile.results;
  }

  /**
   * Clear analysis history for the workspace
   * 
   * @param workspaceRoot - Workspace root path
   */
  public async clearHistory(workspaceRoot: string): Promise<void> {
    await this.persistenceService.clearResults(workspaceRoot);
  }

  /**
   * Get the persistence service instance
   * Useful for advanced operations like checking file size or rotation
   */
  public getPersistenceService(): PersistenceService {
    return this.persistenceService;
  }

  /**
   * Get the event bus instance
   * Useful for subscribing to events from external consumers
   * Requirement: REQ-8.2
   */
  public getEventBus(): MultimodalEventBus {
    return this.eventBus;
  }

  /**
   * Update the workspace root
   * 
   * @param workspaceRoot - New workspace root path
   */
  public setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get the current workspace root
   */
  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._onAnalysisCompleted.dispose();
  }
}
