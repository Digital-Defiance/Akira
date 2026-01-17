/**
 * Preset Manager for Multimodal Input Support
 * Requirements: REQ-10.2
 * 
 * Manages model presets and configurations for image analysis.
 * Implements preset discovery, application, and persistence.
 */

import * as path from "path";
import { ModelPreset, AnalysisRequest } from "./types";

// Conditionally import vscode and fs only when available
let vscode: typeof import("vscode") | undefined;
let fs: typeof import("fs") | undefined;

// Allow tests to inject vscode mock
export function __setVSCodeForTesting(vscodeMock: unknown): void {
  vscode = vscodeMock as typeof vscode;
}

// Allow tests to inject fs mock
export function __setFsForTesting(fsMock: unknown): void {
  fs = fsMock as typeof fs;
}

try {
  vscode = require("vscode");
} catch {
  try {
    const requireFunc = eval("require");
    vscode = requireFunc("vscode");
  } catch {
    vscode = undefined;
  }
}

try {
  fs = require("fs");
} catch {
  try {
    const requireFunc = eval("require");
    fs = requireFunc("fs");
  } catch {
    fs = undefined;
  }
}

// ============================================================================
// Constants
// ============================================================================

const PRESETS_DIRECTORY = ".vscode/image-analysis/presets";
const PRESETS_FILE = "presets.json";
const SELECTED_PRESET_KEY = "akira.multimodal.selectedPreset";

// ============================================================================
// Types
// ============================================================================

/**
 * Structure of the presets file
 */
export interface PresetsFile {
  version: string;
  presets: ModelPreset[];
}

/**
 * Result of preset application
 */
export interface PresetApplicationResult {
  success: boolean;
  request: AnalysisRequest;
  appliedPreset?: ModelPreset;
  error?: string;
}

// ============================================================================
// Default Presets
// ============================================================================

/**
 * Built-in default presets
 */
export const DEFAULT_PRESETS: ModelPreset[] = [
  {
    id: "default",
    name: "Default",
    modelId: "default",
    confidenceThreshold: 50,
    plugins: [],
  },
  {
    id: "high-accuracy",
    name: "High Accuracy",
    modelId: "default",
    confidenceThreshold: 80,
    plugins: [],
  },
  {
    id: "fast-detection",
    name: "Fast Detection",
    modelId: "default",
    confidenceThreshold: 30,
    plugins: [],
  },
];

// ============================================================================
// PresetManager Class
// ============================================================================

/**
 * PresetManager class for managing model presets
 * Implements REQ-10.2 (preset application and persistence)
 */
export class PresetManager {
  // In-memory presets storage
  private presets: Map<string, ModelPreset> = new Map();
  
  // Selected preset per workspace
  private selectedPresets: Map<string, string> = new Map();
  
  // Workspace root for file operations
  private workspaceRoot: string | undefined;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot;
    
    // Initialize with default presets
    for (const preset of DEFAULT_PRESETS) {
      this.presets.set(preset.id, preset);
    }
  }

  /**
   * Set workspace root for file operations
   * @param workspaceRoot - Workspace root path
   */
  public setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get the presets directory path for a workspace
   * @param workspaceRoot - Workspace root path (optional, uses instance root if not provided)
   * @returns Full path to presets directory
   */
  public getPresetsDirectory(workspaceRoot?: string): string {
    const root = workspaceRoot || this.workspaceRoot || "";
    return path.join(root, PRESETS_DIRECTORY);
  }

  /**
   * Get the presets file path for a workspace
   * @param workspaceRoot - Workspace root path (optional, uses instance root if not provided)
   * @returns Full path to presets file
   */
  public getPresetsFilePath(workspaceRoot?: string): string {
    return path.join(this.getPresetsDirectory(workspaceRoot), PRESETS_FILE);
  }

  /**
   * Get all available presets
   * Requirement: REQ-10.2
   * @returns Array of model presets
   */
  public getPresets(): ModelPreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * Get a preset by ID
   * @param presetId - Preset identifier
   * @returns Preset if found, undefined otherwise
   */
  public getPreset(presetId: string): ModelPreset | undefined {
    return this.presets.get(presetId);
  }

  /**
   * Apply preset to analysis request
   * Requirement: REQ-10.2
   * @param presetId - Preset identifier
   * @param request - Base analysis request
   * @returns Request with preset applied
   */
  public applyPreset(presetId: string, request: AnalysisRequest): AnalysisRequest {
    const preset = this.presets.get(presetId);
    
    if (!preset) {
      // Return original request if preset not found
      return request;
    }

    // Apply preset's model id, confidence threshold, and plugin list (REQ-10.2)
    return {
      ...request,
      modelId: preset.modelId,
      confidenceThreshold: preset.confidenceThreshold,
    };
  }

  /**
   * Apply preset and return detailed result
   * @param presetId - Preset identifier
   * @param request - Base analysis request
   * @returns Application result with details
   */
  public applyPresetWithResult(
    presetId: string,
    request: AnalysisRequest
  ): PresetApplicationResult {
    const preset = this.presets.get(presetId);
    
    if (!preset) {
      return {
        success: false,
        request,
        error: `Preset not found: ${presetId}`,
      };
    }

    const appliedRequest = this.applyPreset(presetId, request);
    
    return {
      success: true,
      request: appliedRequest,
      appliedPreset: preset,
    };
  }

  /**
   * Get the plugin list from a preset
   * @param presetId - Preset identifier
   * @returns Array of plugin IDs, empty if preset not found
   */
  public getPresetPlugins(presetId: string): string[] {
    const preset = this.presets.get(presetId);
    return preset ? [...preset.plugins] : [];
  }

  /**
   * Save a preset
   * Requirement: REQ-10.2
   * @param preset - Preset to save
   */
  public async savePreset(preset: ModelPreset): Promise<void> {
    // Validate preset
    if (!preset.id || preset.id.length === 0) {
      throw new Error("Preset must have a non-empty id");
    }
    if (!preset.name || preset.name.length === 0) {
      throw new Error("Preset must have a non-empty name");
    }
    if (!preset.modelId || preset.modelId.length === 0) {
      throw new Error("Preset must have a non-empty modelId");
    }
    if (typeof preset.confidenceThreshold !== "number" || 
        preset.confidenceThreshold < 0 || 
        preset.confidenceThreshold > 100) {
      throw new Error("Preset confidenceThreshold must be a number between 0 and 100");
    }
    if (!Array.isArray(preset.plugins)) {
      throw new Error("Preset plugins must be an array");
    }

    // Store in memory
    this.presets.set(preset.id, { ...preset });

    // Persist to file if workspace root is available
    if (this.workspaceRoot && fs) {
      await this.persistPresets();
    }
  }

  /**
   * Delete a preset
   * @param presetId - Preset identifier
   * @returns true if preset was deleted, false if not found
   */
  public async deletePreset(presetId: string): Promise<boolean> {
    // Don't allow deleting default presets
    if (DEFAULT_PRESETS.some(p => p.id === presetId)) {
      return false;
    }

    const deleted = this.presets.delete(presetId);
    
    if (deleted && this.workspaceRoot && fs) {
      await this.persistPresets();
    }

    return deleted;
  }

  /**
   * Get the selected preset for a workspace
   * Requirement: REQ-10.2 (persist preset selection per workspace)
   * @param workspaceRoot - Workspace root path
   * @returns Selected preset ID, or "default" if none selected
   */
  public getSelectedPreset(workspaceRoot: string): string {
    // Check in-memory cache first
    const cached = this.selectedPresets.get(workspaceRoot);
    if (cached) {
      return cached;
    }

    // Try to load from VS Code workspace state
    if (vscode && vscode.workspace) {
      const workspaceState = this.getWorkspaceState();
      if (workspaceState) {
        const selected = workspaceState.get<string>(SELECTED_PRESET_KEY);
        if (selected) {
          this.selectedPresets.set(workspaceRoot, selected);
          return selected;
        }
      }
    }

    return "default";
  }

  /**
   * Set the selected preset for a workspace
   * Requirement: REQ-10.2 (persist preset selection per workspace)
   * @param workspaceRoot - Workspace root path
   * @param presetId - Preset identifier to select
   */
  public async setSelectedPreset(workspaceRoot: string, presetId: string): Promise<void> {
    // Verify preset exists
    if (!this.presets.has(presetId)) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    // Store in memory
    this.selectedPresets.set(workspaceRoot, presetId);

    // Persist to VS Code workspace state
    if (vscode && vscode.workspace) {
      const workspaceState = this.getWorkspaceState();
      if (workspaceState) {
        await workspaceState.update(SELECTED_PRESET_KEY, presetId);
      }
    }
  }

  /**
   * Load presets from workspace file
   * @param workspaceRoot - Workspace root path (optional, uses instance root if not provided)
   */
  public async loadPresets(workspaceRoot?: string): Promise<void> {
    const root = workspaceRoot || this.workspaceRoot;
    if (!root || !fs) {
      return;
    }

    const presetsPath = this.getPresetsFilePath(root);

    try {
      if (!fs.existsSync(presetsPath)) {
        return;
      }

      const content = fs.readFileSync(presetsPath, "utf-8");
      const presetsFile: PresetsFile = JSON.parse(content);

      // Add loaded presets to the map (don't replace defaults)
      for (const preset of presetsFile.presets) {
        // Skip if it's a default preset (don't override)
        if (!DEFAULT_PRESETS.some(p => p.id === preset.id)) {
          this.presets.set(preset.id, preset);
        }
      }
    } catch (error) {
      // Log error but don't throw - presets are optional
      console.error(`Failed to load presets from ${presetsPath}:`, error);
    }
  }

  /**
   * Persist presets to workspace file
   */
  private async persistPresets(): Promise<void> {
    if (!this.workspaceRoot || !fs) {
      return;
    }

    const presetsDir = this.getPresetsDirectory();
    const presetsPath = this.getPresetsFilePath();

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(presetsDir)) {
        fs.mkdirSync(presetsDir, { recursive: true });
      }

      // Get non-default presets for persistence
      const customPresets = Array.from(this.presets.values()).filter(
        p => !DEFAULT_PRESETS.some(d => d.id === p.id)
      );

      const presetsFile: PresetsFile = {
        version: "1.0.0",
        presets: customPresets,
      };

      fs.writeFileSync(presetsPath, JSON.stringify(presetsFile, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to persist presets to ${presetsPath}:`, error);
      throw error;
    }
  }

  /**
   * Get VS Code workspace state (for testing injection)
   */
  private getWorkspaceState(): { get<T>(key: string): T | undefined; update(key: string, value: unknown): Promise<void> } | undefined {
    // This would normally come from ExtensionContext.workspaceState
    // For now, return undefined as we don't have access to extension context
    return undefined;
  }

  /**
   * Register a preset (for testing)
   * @param preset - Preset to register
   */
  public registerPreset(preset: ModelPreset): void {
    this.presets.set(preset.id, { ...preset });
  }

  /**
   * Clear all custom presets (for testing)
   */
  public clearCustomPresets(): void {
    // Keep only default presets
    const defaultIds = new Set(DEFAULT_PRESETS.map(p => p.id));
    for (const [id] of this.presets) {
      if (!defaultIds.has(id)) {
        this.presets.delete(id);
      }
    }
    this.selectedPresets.clear();
  }

  /**
   * Reset to default state (for testing)
   */
  public reset(): void {
    this.presets.clear();
    this.selectedPresets.clear();
    
    // Re-initialize with default presets
    for (const preset of DEFAULT_PRESETS) {
      this.presets.set(preset.id, preset);
    }
  }
}

/**
 * Create a preset manager instance
 * @param workspaceRoot - Optional workspace root path
 */
export function createPresetManager(workspaceRoot?: string): PresetManager {
  return new PresetManager(workspaceRoot);
}
