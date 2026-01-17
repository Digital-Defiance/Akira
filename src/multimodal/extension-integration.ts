/**
 * VS Code Extension Integration for Multimodal Input Support
 * 
 * This module registers VS Code commands, context menus, and status bar items
 * for the multimodal image analysis feature.
 * 
 * Requirements: REQ-1.2, REQ-1.3, REQ-2.2, REQ-6.3
 */

import * as vscode from "vscode";
import { ImageAnalyzer, createImageAnalyzer } from "./image-analyzer";
import { ResultsPanel } from "./results-panel";
import { OfflineQueueManager, NetworkState } from "./offline-queue-manager";
import { AnalysisResult } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the multimodal extension integration
 */
export interface MultimodalExtensionConfig {
  /** Image analyzer instance (optional, will create default if not provided) */
  imageAnalyzer?: ImageAnalyzer;
  /** Offline queue manager instance (optional, will create default if not provided) */
  offlineQueueManager?: OfflineQueueManager;
  /** Output channel for logging */
  outputChannel?: vscode.LogOutputChannel;
}

/**
 * Status bar state for multimodal analysis
 */
interface StatusBarState {
  isAnalyzing: boolean;
  progress: number;
  message: string;
  queuedCount: number;
  networkState: NetworkState;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Command IDs for multimodal features
 */
export const MULTIMODAL_COMMANDS = {
  ANALYZE_IMAGE: "akira.multimodal.analyzeImage",
  OPEN_RESULTS_PANEL: "akira.multimodal.openResultsPanel",
  CLEAR_RESULTS: "akira.multimodal.clearResults",
} as const;

/**
 * Supported image file extensions for context menu
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
];

// ============================================================================
// MultimodalExtensionIntegration Class
// ============================================================================

/**
 * Manages VS Code integration for multimodal image analysis
 * Handles command registration, status bar, and context menus
 */
export class MultimodalExtensionIntegration implements vscode.Disposable {
  private imageAnalyzer: ImageAnalyzer;
  private offlineQueueManager: OfflineQueueManager;
  private outputChannel: vscode.LogOutputChannel | null;
  private disposables: vscode.Disposable[] = [];
  
  // Status bar items
  private progressStatusBarItem: vscode.StatusBarItem | null = null;
  private queueStatusBarItem: vscode.StatusBarItem | null = null;
  
  // State tracking
  private statusBarState: StatusBarState = {
    isAnalyzing: false,
    progress: 0,
    message: "",
    queuedCount: 0,
    networkState: "unknown",
  };
  
  // Progress update interval
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private lastResult: AnalysisResult | null = null;

  constructor(config: MultimodalExtensionConfig = {}) {
    this.imageAnalyzer = config.imageAnalyzer || createImageAnalyzer();
    this.offlineQueueManager = config.offlineQueueManager || new OfflineQueueManager();
    this.outputChannel = config.outputChannel || null;
    
    this.initializeStatusBar();
    this.setupEventListeners();
  }

  /**
   * Initialize status bar items
   * Requirements: REQ-1.3, REQ-6.3
   */
  private initializeStatusBar(): void {
    // Progress status bar item (REQ-1.3)
    this.progressStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.progressStatusBarItem.name = "Image Analysis Progress";
    this.disposables.push(this.progressStatusBarItem);

    // Queue status bar item (REQ-6.3)
    this.queueStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      98
    );
    this.queueStatusBarItem.name = "Image Analysis Queue";
    this.queueStatusBarItem.command = MULTIMODAL_COMMANDS.OPEN_RESULTS_PANEL;
    this.disposables.push(this.queueStatusBarItem);
  }

  /**
   * Set up event listeners for analysis lifecycle
   */
  private setupEventListeners(): void {
    // Listen for analysis start events
    this.disposables.push(
      this.imageAnalyzer.onAnalysisStart((event) => {
        this.log(`Analysis started for: ${event.imagePath}`);
        this.statusBarState.isAnalyzing = true;
        this.statusBarState.progress = 0;
        this.statusBarState.message = "Starting analysis...";
        this.updateProgressStatusBar();
      })
    );

    // Listen for progress updates
    this.disposables.push(
      this.imageAnalyzer.onProgressUpdate((event) => {
        this.statusBarState.progress = event.progress;
        this.statusBarState.message = event.message || `Analyzing... ${event.progress}%`;
        this.updateProgressStatusBar();
      })
    );

    // Set up offline queue manager callback
    this.offlineQueueManager.setStatusBarCallback((queuedCount, networkState) => {
      this.statusBarState.queuedCount = queuedCount;
      this.statusBarState.networkState = networkState;
      this.updateQueueStatusBar();
    });
  }

  /**
   * Register all multimodal commands with VS Code
   * @param context - Extension context for subscription management
   */
  registerCommands(context: vscode.ExtensionContext): void {
    // Register 'Analyze Image' command (REQ-1.2)
    const analyzeImageCommand = vscode.commands.registerCommand(
      MULTIMODAL_COMMANDS.ANALYZE_IMAGE,
      async (uri?: vscode.Uri) => {
        await this.handleAnalyzeImageCommand(uri);
      }
    );
    context.subscriptions.push(analyzeImageCommand);
    this.disposables.push(analyzeImageCommand);

    // Register 'Open Results Panel' command (REQ-2.2)
    const openResultsPanelCommand = vscode.commands.registerCommand(
      MULTIMODAL_COMMANDS.OPEN_RESULTS_PANEL,
      () => {
        this.handleOpenResultsPanelCommand();
      }
    );
    context.subscriptions.push(openResultsPanelCommand);
    this.disposables.push(openResultsPanelCommand);

    // Register 'Clear Results' command
    const clearResultsCommand = vscode.commands.registerCommand(
      MULTIMODAL_COMMANDS.CLEAR_RESULTS,
      () => {
        this.handleClearResultsCommand();
      }
    );
    context.subscriptions.push(clearResultsCommand);
    this.disposables.push(clearResultsCommand);

    this.log("Multimodal commands registered");
  }

  /**
   * Handle the 'Analyze Image' command
   * Requirement: REQ-1.2 (start analysis within 500ms)
   * @param uri - Optional URI of the image file
   */
  private async handleAnalyzeImageCommand(uri?: vscode.Uri): Promise<void> {
    let imagePath: string;

    if (uri) {
      // Called from context menu with file URI
      imagePath = uri.fsPath;
    } else {
      // Called from command palette - prompt for file selection
      const selectedFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "Images": ["png", "jpg", "jpeg", "webp", "gif"],
        },
        title: "Select Image to Analyze",
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      imagePath = selectedFiles[0].fsPath;
    }

    // Validate file extension
    const ext = imagePath.toLowerCase().substring(imagePath.lastIndexOf("."));
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      vscode.window.showErrorMessage(
        `Unsupported image format: ${ext}. Supported formats: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`
      );
      return;
    }

    this.log(`Analyzing image: ${imagePath}`);

    try {
      // Start analysis (REQ-1.2: must start within 500ms)
      const result = await this.imageAnalyzer.analyzeImage(imagePath);
      
      // Store last result
      this.lastResult = result;

      // Analysis complete - update status bar
      this.statusBarState.isAnalyzing = false;
      this.statusBarState.progress = 100;
      this.statusBarState.message = "Analysis complete";
      this.updateProgressStatusBar();

      // Show results panel with the result
      ResultsPanel.createOrShow(result);

      // Show success notification
      const labelCount = result.labels.length;
      vscode.window.showInformationMessage(
        `Image analysis complete: ${labelCount} label${labelCount !== 1 ? "s" : ""} detected`
      );

      this.log(`Analysis complete: ${labelCount} labels detected`);
    } catch (error) {
      // Analysis failed - update status bar
      this.statusBarState.isAnalyzing = false;
      this.statusBarState.progress = 0;
      this.statusBarState.message = "";
      this.updateProgressStatusBar();

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Analysis failed: ${errorMessage}`, "error");

      // Show error message with details
      vscode.window.showErrorMessage(`Image analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Handle the 'Open Results Panel' command
   * Requirement: REQ-2.2
   */
  private handleOpenResultsPanelCommand(): void {
    ResultsPanel.createOrShow(this.lastResult || undefined);
    this.log("Results panel opened");
  }

  /**
   * Handle the 'Clear Results' command
   */
  private handleClearResultsCommand(): void {
    if (ResultsPanel.currentPanel) {
      ResultsPanel.currentPanel.clear();
    }
    this.lastResult = null;
    this.log("Results cleared");
  }

  /**
   * Update the progress status bar item
   * Requirement: REQ-1.3 (update every 500ms)
   */
  private updateProgressStatusBar(): void {
    if (!this.progressStatusBarItem) {
      return;
    }

    if (this.statusBarState.isAnalyzing) {
      const progress = this.statusBarState.progress;
      this.progressStatusBarItem.text = `$(sync~spin) ${this.statusBarState.message}`;
      this.progressStatusBarItem.tooltip = `Image Analysis: ${progress}% complete`;
      this.progressStatusBarItem.show();
    } else if (this.statusBarState.progress === 100) {
      // Show completion briefly
      this.progressStatusBarItem.text = "$(check) Analysis complete";
      this.progressStatusBarItem.tooltip = "Image analysis completed successfully";
      this.progressStatusBarItem.show();
      
      // Hide after 3 seconds
      setTimeout(() => {
        if (this.progressStatusBarItem && !this.statusBarState.isAnalyzing) {
          this.progressStatusBarItem.hide();
        }
      }, 3000);
    } else {
      this.progressStatusBarItem.hide();
    }
  }

  /**
   * Update the queue status bar item
   * Requirement: REQ-6.3 (show queued state when offline)
   */
  private updateQueueStatusBar(): void {
    if (!this.queueStatusBarItem) {
      return;
    }

    const { queuedCount, networkState } = this.statusBarState;

    if (networkState === "offline") {
      this.queueStatusBarItem.text = `$(cloud-offline) Offline${queuedCount > 0 ? ` (${queuedCount} queued)` : ""}`;
      this.queueStatusBarItem.tooltip = queuedCount > 0
        ? `${queuedCount} analysis request${queuedCount !== 1 ? "s" : ""} queued. Will process when online.`
        : "Network offline. Cloud analysis requests will be queued.";
      this.queueStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.queueStatusBarItem.show();
    } else if (queuedCount > 0) {
      this.queueStatusBarItem.text = `$(sync~spin) Processing ${queuedCount} queued`;
      this.queueStatusBarItem.tooltip = `Processing ${queuedCount} queued analysis request${queuedCount !== 1 ? "s" : ""}`;
      this.queueStatusBarItem.backgroundColor = undefined;
      this.queueStatusBarItem.show();
    } else {
      this.queueStatusBarItem.hide();
    }
  }

  /**
   * Start network monitoring for offline queue
   */
  startNetworkMonitoring(): void {
    this.offlineQueueManager.startMonitoring();
    this.log("Network monitoring started");
  }

  /**
   * Stop network monitoring
   */
  stopNetworkMonitoring(): void {
    this.offlineQueueManager.stopMonitoring();
    this.log("Network monitoring stopped");
  }

  /**
   * Get the image analyzer instance
   */
  getImageAnalyzer(): ImageAnalyzer {
    return this.imageAnalyzer;
  }

  /**
   * Get the offline queue manager instance
   */
  getOfflineQueueManager(): OfflineQueueManager {
    return this.offlineQueueManager;
  }

  /**
   * Get the last analysis result
   */
  getLastResult(): AnalysisResult | null {
    return this.lastResult;
  }

  /**
   * Log a message to the output channel
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    if (this.outputChannel) {
      switch (level) {
        case "warn":
          this.outputChannel.warn(`[Multimodal] ${message}`);
          break;
        case "error":
          this.outputChannel.error(`[Multimodal] ${message}`);
          break;
        default:
          this.outputChannel.info(`[Multimodal] ${message}`);
      }
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    this.offlineQueueManager.dispose();
    this.imageAnalyzer.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * Create and initialize the multimodal extension integration
 * @param context - VS Code extension context
 * @param config - Optional configuration
 * @returns Initialized MultimodalExtensionIntegration instance
 */
export function activateMultimodalExtension(
  context: vscode.ExtensionContext,
  config: MultimodalExtensionConfig = {}
): MultimodalExtensionIntegration {
  const integration = new MultimodalExtensionIntegration(config);
  
  // Register commands
  integration.registerCommands(context);
  
  // Start network monitoring
  integration.startNetworkMonitoring();
  
  // Add to subscriptions for cleanup
  context.subscriptions.push(integration);
  
  return integration;
}

/**
 * Get the package.json contribution for multimodal commands
 * This is used to document what should be added to package.json
 */
export function getPackageJsonContributions(): {
  commands: Array<{ command: string; title: string; category: string; icon?: string }>;
  menus: {
    "explorer/context": Array<{ command: string; when: string; group: string }>;
    commandPalette: Array<{ command: string; when?: string }>;
  };
} {
  return {
    commands: [
      {
        command: MULTIMODAL_COMMANDS.ANALYZE_IMAGE,
        title: "Analyze Image",
        category: "Akira",
        icon: "$(eye)",
      },
      {
        command: MULTIMODAL_COMMANDS.OPEN_RESULTS_PANEL,
        title: "Open Image Analysis Results",
        category: "Akira",
        icon: "$(output)",
      },
      {
        command: MULTIMODAL_COMMANDS.CLEAR_RESULTS,
        title: "Clear Image Analysis Results",
        category: "Akira",
      },
    ],
    menus: {
      "explorer/context": [
        {
          command: MULTIMODAL_COMMANDS.ANALYZE_IMAGE,
          when: "resourceExtname =~ /\\.(png|jpg|jpeg|webp|gif)$/i",
          group: "akira@1",
        },
      ],
      commandPalette: [
        {
          command: MULTIMODAL_COMMANDS.ANALYZE_IMAGE,
        },
        {
          command: MULTIMODAL_COMMANDS.OPEN_RESULTS_PANEL,
        },
        {
          command: MULTIMODAL_COMMANDS.CLEAR_RESULTS,
        },
      ],
    },
  };
}
