/**
 * Image Analyzer Orchestrator for Multimodal Input Support
 * Requirements: REQ-1.2, REQ-1.3
 * 
 * Main orchestration component that coordinates validation, routing,
 * and results processing for image analysis. Implements the 'Analyze Image'
 * command handler with latency and progress requirements.
 */

import * as vscode from "vscode";
import {
  AnalysisRequest,
  AnalysisResult,
  AnalysisError,
  SupportedMimeType,
} from "./types";
import { ImageValidator, IImageValidator } from "./image-validator";
import { AnalysisRouter, IAnalysisRouter } from "./analysis-router";
import { ResultsManager, IResultsManager } from "./results-manager";
import { MultimodalConfigManager } from "./config-manager";
import { ConsentManager } from "./consent-manager";
import { ConcurrencyManager, IConcurrencyManager } from "./concurrency-manager";
import { OfflineQueueManager, IOfflineQueueManager } from "./offline-queue-manager";
import { PluginLoader } from "./plugin-loader";
import { PresetManager } from "./preset-manager";
import { TelemetryService } from "./telemetry-service";
import { MultimodalEventBus, getMultimodalEventBus } from "./event-bus";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the Image Analyzer
 */
export interface ImageAnalyzerConfig {
  /** Image validator instance */
  imageValidator?: IImageValidator;
  /** Analysis router instance */
  analysisRouter?: IAnalysisRouter;
  /** Results manager instance */
  resultsManager?: IResultsManager;
  /** Config manager instance */
  configManager?: MultimodalConfigManager;
  /** Consent manager instance */
  consentManager?: ConsentManager;
  /** Concurrency manager instance */
  concurrencyManager?: IConcurrencyManager;
  /** Offline queue manager instance */
  offlineQueueManager?: IOfflineQueueManager;
  /** Plugin loader instance */
  pluginLoader?: PluginLoader;
  /** Preset manager instance */
  presetManager?: PresetManager;
  /** Telemetry service instance */
  telemetryService?: TelemetryService;
  /** Event bus instance */
  eventBus?: MultimodalEventBus;
  /** Workspace root path */
  workspaceRoot?: string;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Analysis start event data
 */
export interface AnalysisStartEvent {
  imagePath: string;
  timestamp: number;
  modelId: string;
}

/**
 * Progress update event data
 */
export interface ProgressUpdateEvent {
  imagePath: string;
  progress: number;
  message?: string;
  timestamp: number;
}

/**
 * Interface for Image Analyzer
 */
export interface IImageAnalyzer {
  /**
   * Analyze an image file
   * @param imagePath - Path to the image file
   * @returns Analysis result
   */
  analyzeImage(imagePath: string): Promise<AnalysisResult>;

  /**
   * Check if analysis can be initiated
   * @returns true if analysis can proceed
   */
  canAnalyze(): boolean;

  /**
   * Get the last analysis start timestamp
   * @returns Timestamp in milliseconds or null if no analysis started
   */
  getLastAnalysisStartTime(): number | null;

  /**
   * Get progress update timestamps
   * @returns Array of progress update timestamps
   */
  getProgressUpdateTimestamps(): number[];

  /**
   * Dispose of resources
   */
  dispose(): void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum time allowed for analysis start after command invocation (ms)
 * Requirement: REQ-1.2
 */
export const MAX_ANALYSIS_START_LATENCY_MS = 500;

/**
 * Progress update interval (ms)
 * Requirement: REQ-1.3
 */
export const PROGRESS_UPDATE_INTERVAL_MS = 500;

// ============================================================================
// ImageAnalyzer Class
// ============================================================================

/**
 * ImageAnalyzer class - main orchestration component
 * Implements REQ-1.2 (analysis initiation within 500ms)
 * Implements REQ-1.3 (progress updates every 500ms)
 */
export class ImageAnalyzer implements IImageAnalyzer {
  private imageValidator: IImageValidator;
  private analysisRouter: IAnalysisRouter;
  private resultsManager: IResultsManager | null;
  private configManager: MultimodalConfigManager;
  private consentManager: ConsentManager;
  private concurrencyManager: IConcurrencyManager;
  private offlineQueueManager: IOfflineQueueManager;
  private pluginLoader: PluginLoader;
  private presetManager: PresetManager;
  private telemetryService: TelemetryService;
  private eventBus: MultimodalEventBus;
  private workspaceRoot: string;

  // Status bar item for progress display
  private statusBarItem: vscode.StatusBarItem | null = null;

  // Progress tracking
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private currentProgress: number = 0;
  private progressUpdateTimestamps: number[] = [];
  private lastAnalysisStartTime: number | null = null;

  // Event emitters for analysis lifecycle
  private readonly _onAnalysisStart = new vscode.EventEmitter<AnalysisStartEvent>();
  private readonly _onProgressUpdate = new vscode.EventEmitter<ProgressUpdateEvent>();

  /**
   * Event fired when analysis starts
   * Requirement: REQ-1.2
   */
  public readonly onAnalysisStart: vscode.Event<AnalysisStartEvent> = this._onAnalysisStart.event;

  /**
   * Event fired on progress updates
   * Requirement: REQ-1.3
   */
  public readonly onProgressUpdate: vscode.Event<ProgressUpdateEvent> = this._onProgressUpdate.event;

  constructor(config: ImageAnalyzerConfig = {}) {
    this.workspaceRoot = config.workspaceRoot || this.getDefaultWorkspaceRoot();
    
    // Initialize components with provided instances or defaults
    this.imageValidator = config.imageValidator || new ImageValidator();
    this.analysisRouter = config.analysisRouter || new AnalysisRouter();
    this.configManager = config.configManager || new MultimodalConfigManager();
    this.consentManager = config.consentManager || new ConsentManager();
    this.concurrencyManager = config.concurrencyManager || new ConcurrencyManager();
    this.offlineQueueManager = config.offlineQueueManager || new OfflineQueueManager();
    this.pluginLoader = config.pluginLoader || new PluginLoader();
    this.presetManager = config.presetManager || new PresetManager(this.workspaceRoot);
    this.telemetryService = config.telemetryService || new TelemetryService();
    this.eventBus = config.eventBus || getMultimodalEventBus();

    // Results manager needs workspace root
    this.resultsManager = config.resultsManager || null;

    // Initialize status bar
    this.initializeStatusBar();
  }

  /**
   * Get default workspace root from VS Code
   */
  private getDefaultWorkspaceRoot(): string {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return process.cwd();
  }

  /**
   * Initialize VS Code status bar item for progress display
   */
  private initializeStatusBar(): void {
    try {
      this.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99
      );
    } catch {
      // VS Code not available (testing environment)
      this.statusBarItem = null;
    }
  }

  /**
   * Get or create results manager
   */
  private getResultsManager(): IResultsManager {
    if (!this.resultsManager) {
      this.resultsManager = new ResultsManager(this.workspaceRoot);
    }
    return this.resultsManager;
  }

  /**
   * Check if analysis can be initiated
   * @returns true if analysis can proceed
   */
  canAnalyze(): boolean {
    // Check if settings are valid
    if (!this.configManager.canInitiateAnalysis()) {
      return false;
    }
    return true;
  }

  /**
   * Analyze an image file
   * Requirement: REQ-1.2 (start analysis within 500ms)
   * Requirement: REQ-1.3 (progress updates every 500ms)
   * 
   * @param imagePath - Path to the image file
   * @returns Analysis result
   */
  async analyzeImage(imagePath: string): Promise<AnalysisResult> {
    // Track command invocation time for latency measurement (REQ-1.2)
    // Note: This timestamp is used internally for progress tracking
    const commandInvocationTime = Date.now();
    void commandInvocationTime; // Suppress unused variable warning - used for timing
    
    // Reset progress tracking
    this.progressUpdateTimestamps = [];
    this.currentProgress = 0;

    // Get configuration
    const config = this.configManager.getConfig();

    // Check if analysis can be initiated (REQ-4.3)
    if (!this.canAnalyze()) {
      const errors = this.configManager.getBlockingErrors();
      throw this.createError(
        "INVALID_SETTING",
        `Cannot initiate analysis: ${errors.map(e => e.message).join(", ")}`,
        { modelId: config.modelId }
      );
    }

    // Emit analysis start event IMMEDIATELY (REQ-1.2)
    // This must happen within 500ms of command invocation
    this.lastAnalysisStartTime = Date.now();
    
    this._onAnalysisStart.fire({
      imagePath,
      timestamp: this.lastAnalysisStartTime,
      modelId: config.modelId,
    });

    // Emit event bus start event
    await this.eventBus.emitAnalysisStarted(imagePath, config.modelId, this.workspaceRoot);

    // Start progress indicator (REQ-1.3)
    this.startProgressIndicator(imagePath);

    try {
      // Validate image
      const validationResult = await this.imageValidator.validate(
        imagePath,
        config.maxImageSizeMB
      );

      if (!validationResult.valid) {
        throw this.createValidationError(validationResult.error!);
      }

      // Check consent for cloud inference
      if (config.inferenceMode === "cloud") {
        const consentResult = this.consentManager.checkExternalRequestAllowed();
        if (!consentResult.allowed) {
          throw consentResult.error!;
        }
      }

      // Build analysis request
      const request: AnalysisRequest = {
        imagePath,
        mimeType: validationResult.mimeType as SupportedMimeType,
        fileSize: validationResult.fileSize!,
        modelId: config.modelId,
        confidenceThreshold: config.confidenceThreshold,
        inferenceMode: config.inferenceMode,
        workspaceRoot: this.workspaceRoot,
      };

      // Apply preset if selected
      const presetId = this.presetManager.getSelectedPreset(this.workspaceRoot);
      const finalRequest = presetId && presetId !== "default"
        ? this.presetManager.applyPreset(presetId, request)
        : request;

      // Execute analysis through concurrency manager
      let result: AnalysisResult;
      
      if (finalRequest.inferenceMode === "cloud") {
        // Use offline queue manager for cloud requests
        result = await this.offlineQueueManager.submitCloudRequest(
          finalRequest,
          async (req) => this.executeAnalysis(req)
        );
      } else {
        // Use concurrency manager for local requests
        result = await this.concurrencyManager.submit(
          finalRequest,
          async (req) => this.executeAnalysis(req)
        );
      }

      // Execute plugins
      const pluginIds = this.presetManager.getPresetPlugins(presetId);
      if (pluginIds.length > 0) {
        result = await this.pluginLoader.executePlugins(
          result,
          pluginIds,
          this.workspaceRoot
        );
      }

      // Process result (persistence, events)
      const resultsManager = this.getResultsManager();
      await resultsManager.processResult(result);

      // Emit telemetry (non-blocking)
      this.telemetryService.emitAnalysisCompletedAsync(
        result,
        validationResult.fileSize!
      );

      return result;
    } catch (error) {
      // Emit failure event
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as AnalysisError).code;
      await this.eventBus.emitAnalysisFailed(
        imagePath,
        errorMessage,
        this.workspaceRoot,
        errorCode
      );
      throw error;
    } finally {
      // Stop progress indicator
      this.stopProgressIndicator();
    }
  }

  /**
   * Execute the actual analysis through the router
   */
  private async executeAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
    const result = await this.analysisRouter.route(request);
    
    // Ensure result has required fields
    if (!result.id) {
      result.id = this.generateUUID();
    }
    if (!result.timestamp) {
      result.timestamp = new Date().toISOString();
    }
    
    return result;
  }

  /**
   * Generate a UUID for analysis results
   */
  private generateUUID(): string {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Start the progress indicator
   * Requirement: REQ-1.3 (update every 500ms)
   */
  private startProgressIndicator(imagePath: string): void {
    this.currentProgress = 0;
    
    // Update status bar
    this.updateStatusBar("Analyzing image...", 0);

    // Start progress update interval (REQ-1.3)
    this.progressInterval = setInterval(() => {
      // Increment progress (simulate progress for long-running analysis)
      this.currentProgress = Math.min(this.currentProgress + 10, 90);
      
      // Record timestamp
      const timestamp = Date.now();
      this.progressUpdateTimestamps.push(timestamp);

      // Emit progress event
      this._onProgressUpdate.fire({
        imagePath,
        progress: this.currentProgress,
        message: `Analyzing... ${this.currentProgress}%`,
        timestamp,
      });

      // Emit event bus progress
      this.eventBus.emitAnalysisProgress(
        imagePath,
        this.currentProgress,
        this.workspaceRoot,
        `Analyzing... ${this.currentProgress}%`
      );

      // Update status bar
      this.updateStatusBar(`Analyzing image... ${this.currentProgress}%`, this.currentProgress);
    }, PROGRESS_UPDATE_INTERVAL_MS);
  }

  /**
   * Stop the progress indicator
   */
  private stopProgressIndicator(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    
    // Hide status bar
    if (this.statusBarItem) {
      this.statusBarItem.hide();
    }
  }

  /**
   * Update the status bar with progress
   */
  private updateStatusBar(message: string, _progress: number): void {
    if (this.statusBarItem) {
      this.statusBarItem.text = `$(sync~spin) ${message}`;
      this.statusBarItem.show();
    }
  }

  /**
   * Get the last analysis start timestamp
   * @returns Timestamp in milliseconds or null if no analysis started
   */
  getLastAnalysisStartTime(): number | null {
    return this.lastAnalysisStartTime;
  }

  /**
   * Get progress update timestamps
   * @returns Array of progress update timestamps
   */
  getProgressUpdateTimestamps(): number[] {
    return [...this.progressUpdateTimestamps];
  }

  /**
   * Create an analysis error
   */
  private createError(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): AnalysisError {
    return {
      code: code as AnalysisError["code"],
      message,
      details,
      retryable: false,
    };
  }

  /**
   * Create a validation error from ImageValidationError
   */
  private createValidationError(error: {
    code: string;
    message: string;
    detectedMimeType?: string;
    acceptedMimeTypes?: string[];
    maxSizeBytes?: number;
    actualSizeBytes?: number;
  }): AnalysisError {
    return {
      code: error.code as AnalysisError["code"],
      message: error.message,
      details: {
        detectedMimeType: error.detectedMimeType,
        acceptedMimeTypes: error.acceptedMimeTypes,
        maxSizeBytes: error.maxSizeBytes,
        actualSizeBytes: error.actualSizeBytes,
      },
      retryable: false,
    };
  }

  /**
   * Set workspace root
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    if (this.resultsManager) {
      (this.resultsManager as ResultsManager).setWorkspaceRoot(workspaceRoot);
    }
  }

  /**
   * Get workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopProgressIndicator();
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    this._onAnalysisStart.dispose();
    this._onProgressUpdate.dispose();
    this.configManager.dispose();
    if (this.resultsManager && typeof (this.resultsManager as ResultsManager).dispose === "function") {
      (this.resultsManager as ResultsManager).dispose();
    }
  }
}

/**
 * Create an image analyzer with the given configuration
 */
export function createImageAnalyzer(
  config: ImageAnalyzerConfig = {}
): ImageAnalyzer {
  return new ImageAnalyzer(config);
}
