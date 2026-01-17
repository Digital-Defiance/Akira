/**
 * Plugin Loader for Multimodal Input Support
 * Requirements: REQ-10.1, REQ-10.3
 * 
 * Loads and executes workspace plugins for image analysis post-processing.
 * Implements plugin discovery, validation, and exception isolation.
 */

import * as path from "path";
import { ImageAnalysisPlugin, AnalysisResult, AnalysisError } from "./types";

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
// Plugin Types
// ============================================================================

/**
 * Result of plugin validation
 */
export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Result of plugin execution
 */
export interface PluginExecutionResult {
  success: boolean;
  result?: AnalysisResult;
  error?: AnalysisError;
  pluginId: string;
}

/**
 * Plugin execution log entry
 */
export interface PluginExecutionLog {
  pluginId: string;
  success: boolean;
  error?: string;
  stackTrace?: string;
  duration: number;
}

// ============================================================================
// Constants
// ============================================================================

const PLUGINS_DIRECTORY = ".vscode/image-analysis/plugins";
const PLUGIN_MANIFEST_FILE = "plugin.json";

// ============================================================================
// PluginLoader Class
// ============================================================================

/**
 * PluginLoader class for loading and executing workspace plugins
 * Implements REQ-10.1 (plugin discovery and execution)
 * Implements REQ-10.3 (exception isolation)
 */
export class PluginLoader {
  // In-memory plugins for testing
  private inMemoryPlugins: Map<string, ImageAnalysisPlugin> = new Map();
  
  // Execution log for tracking plugin execution
  private executionLog: PluginExecutionLog[] = [];

  // Output channel for logging
  private outputChannel: { appendLine: (message: string) => void } | undefined;

  constructor() {
    if (vscode) {
      this.outputChannel = vscode.window.createOutputChannel("Image Analysis Plugins");
    }
  }

  /**
   * Set output channel for testing
   */
  public setOutputChannel(channel: { appendLine: (message: string) => void }): void {
    this.outputChannel = channel;
  }

  /**
   * Get the plugins directory path for a workspace
   * @param workspaceRoot - Workspace root path
   * @returns Full path to plugins directory
   */
  public getPluginsDirectory(workspaceRoot: string): string {
    return path.join(workspaceRoot, PLUGINS_DIRECTORY);
  }

  /**
   * Check if a plugin has a valid interface
   * Requirement: REQ-10.1
   * @param plugin - Plugin object to validate
   * @returns Validation result with errors if invalid
   */
  public validatePluginInterface(plugin: unknown): PluginValidationResult {
    const errors: string[] = [];

    if (!plugin || typeof plugin !== "object") {
      return { valid: false, errors: ["Plugin must be an object"] };
    }

    const p = plugin as Record<string, unknown>;

    // Check required string properties
    if (typeof p.id !== "string" || p.id.length === 0) {
      errors.push("Plugin must have a non-empty 'id' string property");
    }

    if (typeof p.name !== "string" || p.name.length === 0) {
      errors.push("Plugin must have a non-empty 'name' string property");
    }

    if (typeof p.version !== "string" || p.version.length === 0) {
      errors.push("Plugin must have a non-empty 'version' string property");
    }

    // Check processImage function
    if (typeof p.processImage !== "function") {
      errors.push("Plugin must have a 'processImage' function");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Load plugins from workspace directory
   * Requirement: REQ-10.1
   * @param workspaceRoot - Workspace root path
   * @returns Array of loaded plugins
   */
  public async loadPlugins(workspaceRoot: string): Promise<ImageAnalysisPlugin[]> {
    // If we have in-memory plugins (for testing), return those
    if (this.inMemoryPlugins.size > 0) {
      return Array.from(this.inMemoryPlugins.values());
    }

    if (!fs) {
      this.log("File system not available, returning empty plugin list");
      return [];
    }

    const pluginsDir = this.getPluginsDirectory(workspaceRoot);

    // Check if plugins directory exists
    if (!fs.existsSync(pluginsDir)) {
      this.log(`Plugins directory not found: ${pluginsDir}`);
      return [];
    }

    const plugins: ImageAnalysisPlugin[] = [];
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginDir = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_FILE);

      try {
        // Check if manifest exists
        if (!fs.existsSync(manifestPath)) {
          this.log(`Plugin manifest not found: ${manifestPath}`);
          continue;
        }

        // Load and parse manifest
        const manifestContent = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestContent);

        // Load the plugin module
        const mainFile = manifest.main || "index.js";
        const pluginPath = path.join(pluginDir, mainFile);

        if (!fs.existsSync(pluginPath)) {
          this.log(`Plugin main file not found: ${pluginPath}`);
          continue;
        }

        // Dynamically require the plugin
        const requireFunc = eval("require");
        const pluginModule = requireFunc(pluginPath);
        const plugin = pluginModule.default || pluginModule;

        // Merge manifest properties with plugin
        const fullPlugin: ImageAnalysisPlugin = {
          id: manifest.id || plugin.id,
          name: manifest.name || plugin.name,
          version: manifest.version || plugin.version,
          processImage: plugin.processImage.bind(plugin),
        };

        // Validate plugin interface
        const validation = this.validatePluginInterface(fullPlugin);
        if (!validation.valid) {
          this.log(`Invalid plugin ${entry.name}: ${validation.errors.join(", ")}`);
          continue;
        }

        plugins.push(fullPlugin);
        this.log(`Loaded plugin: ${fullPlugin.id} v${fullPlugin.version}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`Failed to load plugin from ${pluginDir}: ${errorMessage}`);
      }
    }

    return plugins;
  }

  /**
   * Execute plugins on analysis result in order
   * Requirement: REQ-10.1, REQ-10.3
   * @param result - Analysis result to process
   * @param pluginIds - Plugin IDs to execute in order
   * @param workspaceRoot - Workspace root path
   * @returns Processed result after all plugins
   */
  public async executePlugins(
    result: AnalysisResult,
    pluginIds: string[],
    workspaceRoot: string
  ): Promise<AnalysisResult> {
    // Clear execution log for this run
    this.executionLog = [];

    // Load all available plugins
    const availablePlugins = await this.loadPlugins(workspaceRoot);
    const pluginMap = new Map(availablePlugins.map(p => [p.id, p]));

    let currentResult = { ...result };

    // Execute plugins in the specified order (REQ-10.1)
    for (const pluginId of pluginIds) {
      const plugin = pluginMap.get(pluginId);
      
      if (!plugin) {
        this.log(`Plugin not found: ${pluginId}`);
        this.executionLog.push({
          pluginId,
          success: false,
          error: `Plugin not found: ${pluginId}`,
          duration: 0,
        });
        continue;
      }

      const startTime = Date.now();

      try {
        // Execute plugin synchronously in listed order (REQ-10.1)
        currentResult = await plugin.processImage(result.imagePath, currentResult);
        
        const duration = Date.now() - startTime;
        this.executionLog.push({
          pluginId,
          success: true,
          duration,
        });
        this.log(`Plugin ${pluginId} executed successfully in ${duration}ms`);
      } catch (error) {
        // Exception isolation (REQ-10.3)
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stackTrace = error instanceof Error ? error.stack : undefined;

        // Log plugin id and stack trace to output pane (REQ-10.3)
        this.log(`Plugin ${pluginId} threw exception: ${errorMessage}`);
        if (stackTrace) {
          this.log(`Stack trace:\n${stackTrace}`);
        }

        this.executionLog.push({
          pluginId,
          success: false,
          error: errorMessage,
          stackTrace,
          duration,
        });

        // Continue executing remaining plugins (REQ-10.3)
      }
    }

    return currentResult;
  }

  /**
   * Execute a single plugin
   * @param plugin - Plugin to execute
   * @param imagePath - Path to image
   * @param result - Current analysis result
   * @returns Execution result
   */
  public async executeSinglePlugin(
    plugin: ImageAnalysisPlugin,
    imagePath: string,
    result: AnalysisResult
  ): Promise<PluginExecutionResult> {
    try {
      const processedResult = await plugin.processImage(imagePath, result);
      return {
        success: true,
        result: processedResult,
        pluginId: plugin.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : undefined;

      // Log to output pane (REQ-10.3)
      this.log(`Plugin ${plugin.id} threw exception: ${errorMessage}`);
      if (stackTrace) {
        this.log(`Stack trace:\n${stackTrace}`);
      }

      return {
        success: false,
        error: {
          code: "PLUGIN_EXECUTION_ERROR",
          message: `Plugin ${plugin.id} failed: ${errorMessage}`,
          details: {
            pluginId: plugin.id,
            stackTrace,
          },
          retryable: false,
        },
        pluginId: plugin.id,
      };
    }
  }

  /**
   * Get execution log from last executePlugins call
   * @returns Array of execution log entries
   */
  public getExecutionLog(): PluginExecutionLog[] {
    return [...this.executionLog];
  }

  /**
   * Clear execution log
   */
  public clearExecutionLog(): void {
    this.executionLog = [];
  }

  /**
   * Register an in-memory plugin (for testing)
   * @param plugin - Plugin to register
   */
  public registerPlugin(plugin: ImageAnalysisPlugin): void {
    const validation = this.validatePluginInterface(plugin);
    if (!validation.valid) {
      throw new Error(`Invalid plugin: ${validation.errors.join(", ")}`);
    }
    this.inMemoryPlugins.set(plugin.id, plugin);
  }

  /**
   * Unregister an in-memory plugin (for testing)
   * @param pluginId - ID of plugin to unregister
   */
  public unregisterPlugin(pluginId: string): void {
    this.inMemoryPlugins.delete(pluginId);
  }

  /**
   * Clear all in-memory plugins (for testing)
   */
  public clearPlugins(): void {
    this.inMemoryPlugins.clear();
  }

  /**
   * Get all registered in-memory plugins (for testing)
   * @returns Map of plugin ID to plugin
   */
  public getRegisteredPlugins(): Map<string, ImageAnalysisPlugin> {
    return new Map(this.inMemoryPlugins);
  }

  /**
   * Log a message to the output channel
   * @param message - Message to log
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    }
  }
}

/**
 * Create a plugin loader instance
 */
export function createPluginLoader(): PluginLoader {
  return new PluginLoader();
}
