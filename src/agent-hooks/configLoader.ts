/**
 * Config Loader
 * Loads and validates .akira/hooks.json configuration
 * 
 * Requirements:
 * - REQ-1.1: Load .akira/hooks.json within 2000ms
 * - REQ-1.2: Validate against schema, emit errors to output pane
 * - REQ-1.3: Persist normalized in-memory representation
 */

import * as vscode from "vscode";
import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { Hook, HookLoadResult, HookRuntime } from "./types";
import { validatePatterns } from "./secretsRedactor";
import { OutputLogger } from "./outputLogger";

// Load schema
const schema = require("./schema/.kiro.hooks.schema.json");

/** Maximum time allowed for config load (REQ-1.1) */
const LOAD_TIMEOUT_MS = 2000;

export class ConfigLoader {
  private ajv: Ajv;
  private validate: ValidateFunction;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private _onDidChange = new vscode.EventEmitter<HookLoadResult>();
  public readonly onDidChange = this._onDidChange.event;
  private outputLogger: OutputLogger | null = null;
  private previousHooks: Hook[] = [];

  constructor(outputLogger?: OutputLogger) {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.validate = this.ajv.compile(schema);
    this.outputLogger = outputLogger || null;
  }

  /**
   * Set the output logger for error reporting
   */
  setOutputLogger(logger: OutputLogger): void {
    this.outputLogger = logger;
  }

  /**
   * Load hooks from workspace root
   * Must complete within 2000ms (REQ-1.1)
   * @param workspaceRoot Workspace root URI
   * @returns Promise resolving to array of normalized hooks
   */
  async loadHooks(workspaceRoot: vscode.Uri): Promise<Hook[]> {
    const startTime = Date.now();
    const configPath = vscode.Uri.joinPath(workspaceRoot, ".akira", "hooks.json");

    try {
      // Create a timeout promise for the 2000ms budget
      const loadPromise = this.doLoadHooks(configPath);
      const timeoutPromise = new Promise<Hook[]>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Config load exceeded ${LOAD_TIMEOUT_MS}ms timeout`));
        }, LOAD_TIMEOUT_MS);
      });

      const hooks = await Promise.race([loadPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      this.outputLogger?.logInfo(null, `Loaded ${hooks.length} hooks in ${duration}ms`);
      
      // Store successful load for fallback
      this.previousHooks = hooks;
      
      return hooks;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Log error to output pane (REQ-1.2)
      this.outputLogger?.logError(null, new Error(`Failed to load hooks config: ${errorMsg}`));

      // Emit error event
      this._onDidChange.fire({
        success: false,
        hooks: [],
        errors: [{ message: errorMsg, path: configPath.fsPath }],
      });

      // Return previous valid config if available, otherwise empty
      return this.previousHooks;
    }
  }

  /**
   * Internal load implementation
   */
  private async doLoadHooks(configPath: vscode.Uri): Promise<Hook[]> {
    // Check if file exists
    try {
      await vscode.workspace.fs.stat(configPath);
    } catch {
      // File doesn't exist - not an error, just no hooks
      return [];
    }

    // Read file
    const fileData = await vscode.workspace.fs.readFile(configPath);
    const configText = Buffer.from(fileData).toString("utf8");
    
    let config: unknown;
    try {
      config = JSON.parse(configText);
    } catch (parseError) {
      throw new Error(`Invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Validate schema (REQ-1.2)
    const valid = this.validate(config);
    if (!valid) {
      const errors = this.validate.errors?.map(
        (err) => `${err.instancePath || "root"} ${err.message}`
      );
      throw new Error(`Schema validation failed: ${errors?.join("; ")}`);
    }

    // Normalize hooks (REQ-1.3)
    const rawHooks = (config as { hooks?: Hook[] }).hooks || [];
    const hooks = this.normalizeHooks(rawHooks);

    // Validate secret patterns at load time
    for (const hook of hooks) {
      if (hook.secretPatterns && hook.secretPatterns.length > 0) {
        const { errors } = validatePatterns(hook.secretPatterns);
        if (errors.length > 0) {
          throw new Error(
            `Invalid secret patterns in hook "${hook.id}": ${errors.join(", ")}`
          );
        }
      }
    }

    // Validate unique hook IDs
    const ids = new Set<string>();
    for (const hook of hooks) {
      if (ids.has(hook.id)) {
        throw new Error(`Duplicate hook ID: "${hook.id}"`);
      }
      ids.add(hook.id);
    }

    return hooks;
  }

  /**
   * Normalize hooks with default values
   */
  private normalizeHooks(hooks: Hook[]): HookRuntime[] {
    return hooks.map((hook) => ({
      ...hook,
      enabled: hook.enabled !== undefined ? hook.enabled : true,
      concurrency: hook.concurrency || 4,
      timeout: hook.timeout || 30000,
      retry: {
        maxAttempts: hook.retry?.maxAttempts || 3,
        backoffMs: hook.retry?.backoffMs || 1000,
        jitter: hook.retry?.jitter !== undefined ? hook.retry.jitter : true,
      },
    }));
  }

  /**
   * Watch for changes to hooks.json
   */
  watchConfig(workspaceRoot: vscode.Uri): vscode.Disposable {
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      ".akira/hooks.json"
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Reload on change
    this.fileWatcher.onDidChange(async () => {
      this.outputLogger?.logInfo(null, "Hooks config changed, reloading...");
      const hooks = await this.loadHooks(workspaceRoot);
      this._onDidChange.fire({
        success: true,
        hooks,
      });
    });

    // Reload on create
    this.fileWatcher.onDidCreate(async () => {
      this.outputLogger?.logInfo(null, "Hooks config created, loading...");
      const hooks = await this.loadHooks(workspaceRoot);
      this._onDidChange.fire({
        success: true,
        hooks,
      });
    });

    // Clear on delete
    this.fileWatcher.onDidDelete(() => {
      this.outputLogger?.logInfo(null, "Hooks config deleted, clearing hooks");
      this.previousHooks = [];
      this._onDidChange.fire({
        success: true,
        hooks: [],
      });
    });

    return this.fileWatcher;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this._onDidChange.dispose();
  }
}
