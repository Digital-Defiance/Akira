/**
 * Status Bar Manager
 * Manages the status bar display for spec workflow progress using shared status bar
 */

import {
  registerExtension,
  unregisterExtension,
  ExtensionMetadata,
} from "@ai-capabilities-suite/vscode-shared-status-bar";
import { Phase } from "./types";

const EXTENSION_ID = "akira-spec-extension";

/**
 * Status bar manager for displaying spec workflow information
 */
export class StatusBarManager {
  private isRegistered = false;
  private currentFeature?: string;
  private currentPhase?: Phase;

  constructor() {
    // Status bar will be registered when first used
  }

  /**
   * Update the status bar with current spec information
   * @param featureName - The feature name
   * @param phase - The current phase
   * @param percentage - Optional completion percentage
   */
  async updateStatus(
    featureName: string,
    phase: Phase,
    percentage?: number
  ): Promise<void> {
    this.currentFeature = featureName;
    this.currentPhase = phase;

    // Register with shared status bar if not already registered
    if (!this.isRegistered) {
      await this.register();
    }

    // Update metadata
    const metadata: ExtensionMetadata = {
      displayName: `${featureName} • ${this.getPhaseText(phase)}${
        percentage !== undefined ? ` • ${percentage}%` : ""
      }`,
      status: "ok",
      actions: [
        {
          label: "Open Spec",
          command: "akira.openSpec",
          description: "Open the current spec",
        },
        {
          label: "Refresh",
          command: "akira.refreshSpecs",
          description: "Refresh spec list",
        },
      ],
    };

    await registerExtension(EXTENSION_ID, metadata);
  }

  /**
   * Show a progress indicator in the status bar
   * @param message - The progress message
   */
  async showProgress(message: string): Promise<void> {
    if (!this.isRegistered) {
      await this.register();
    }

    const metadata: ExtensionMetadata = {
      displayName: message,
      status: "warning",
    };

    await registerExtension(EXTENSION_ID, metadata);
  }

  /**
   * Show an error in the status bar
   * @param message - The error message
   */
  async showError(message: string): Promise<void> {
    if (!this.isRegistered) {
      await this.register();
    }

    const metadata: ExtensionMetadata = {
      displayName: message,
      status: "error",
    };

    await registerExtension(EXTENSION_ID, metadata);
  }

  /**
   * Hide the progress indicator
   */
  async hideProgress(): Promise<void> {
    // Restore previous status if available
    if (this.currentFeature && this.currentPhase) {
      await this.updateStatus(this.currentFeature, this.currentPhase);
    }
  }

  /**
   * Register with shared status bar
   */
  private async register(): Promise<void> {
    const metadata: ExtensionMetadata = {
      displayName: "Akira Spec",
      status: "ok",
      actions: [
        {
          label: "Create Spec",
          command: "akira.createSpec",
          description: "Create a new spec",
        },
        {
          label: "Refresh",
          command: "akira.refreshSpecs",
          description: "Refresh spec list",
        },
      ],
    };

    await registerExtension(EXTENSION_ID, metadata);
    this.isRegistered = true;
  }

  /**
   * Dispose of the status bar manager
   */
  async dispose(): Promise<void> {
    if (this.isRegistered) {
      await unregisterExtension(EXTENSION_ID);
      this.isRegistered = false;
    }
  }

  /**
   * Get the display text for a phase
   */
  private getPhaseText(phase: Phase): string {
    switch (phase) {
      case "requirements":
        return "Requirements";
      case "design":
        return "Design";
      case "tasks":
        return "Tasks";
      case "execution":
        return "Execution";
      default:
        return "Unknown";
    }
  }
}
