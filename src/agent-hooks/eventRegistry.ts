/**
 * Event Registry
 * Manages VS Code event listener registration for hook triggers
 * 
 * Requirements:
 * - REQ-2.1: Register event listeners within 500ms
 * - REQ-2.2: No duplicate callbacks for same trigger/workspace
 * - REQ-2.3: Log failures and mark affected hooks as disabled
 */

import * as vscode from "vscode";
import { TriggerType, HookTriggerContext, DebounceConfig } from "./types";
import { OutputLogger } from "./outputLogger";

/** Default debounce configuration */
const DEFAULT_DEBOUNCE_CONFIG: DebounceConfig = {
  enabled: true,
  windowMs: 500,
};

/** Callback type for when an event is triggered */
export type EventCallback = (context: HookTriggerContext) => void;

/** Callback for registration failures */
export type RegistrationFailureCallback = (
  trigger: TriggerType,
  hookIds: string[],
  error: Error
) => void;

/** Registration entry tracking a listener */
interface RegistrationEntry {
  trigger: TriggerType;
  disposable: vscode.Disposable;
  hookIds: Set<string>;
}

/** Pending debounced event info */
interface PendingDebounceEvent {
  trigger: TriggerType;
  workspaceRoot: vscode.Uri;
  extra: { filePath?: string; gitInfo?: { commit?: string; branch?: string; message?: string } };
  timeoutId: ReturnType<typeof setTimeout>;
}

export class EventRegistry {
  /** Map<workspaceRoot, Map<trigger, RegistrationEntry>> */
  private registrations = new Map<string, Map<TriggerType, RegistrationEntry>>();
  private outputLogger: OutputLogger | null = null;
  private eventCallback: EventCallback | null = null;
  private failureCallback: RegistrationFailureCallback | null = null;
  
  /** Debounce configuration */
  private debounceConfig: DebounceConfig = { ...DEFAULT_DEBOUNCE_CONFIG };
  
  /** Map<debounceKey, PendingDebounceEvent> for tracking pending debounced events */
  private debounceTimers = new Map<string, PendingDebounceEvent>();

  constructor(outputLogger?: OutputLogger) {
    this.outputLogger = outputLogger || null;
  }

  /**
   * Set the output logger
   */
  setOutputLogger(logger: OutputLogger): void {
    this.outputLogger = logger;
  }

  /**
   * Set the callback for when events are triggered
   */
  setEventCallback(callback: EventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Set the callback for registration failures
   */
  setFailureCallback(callback: RegistrationFailureCallback): void {
    this.failureCallback = callback;
  }

  /**
   * Set the debounce configuration
   */
  setDebounceConfig(config: Partial<DebounceConfig>): void {
    this.debounceConfig = {
      ...this.debounceConfig,
      ...config,
    };
    this.outputLogger?.logInfo(null, `Debounce config updated: enabled=${this.debounceConfig.enabled}, windowMs=${this.debounceConfig.windowMs}`);
  }

  /**
   * Get the current debounce configuration
   */
  getDebounceConfig(): DebounceConfig {
    return { ...this.debounceConfig };
  }

  /**
   * Clear all pending debounced events
   * Useful for cleanup and testing
   */
  clearPendingDebounces(): void {
    for (const [, pending] of this.debounceTimers) {
      clearTimeout(pending.timeoutId);
    }
    this.debounceTimers.clear();
    this.outputLogger?.logInfo(null, "Cleared all pending debounced events");
  }

  /**
   * Get the number of pending debounced events
   * Useful for testing
   */
  getPendingDebounceCount(): number {
    return this.debounceTimers.size;
  }


  /**
   * Register listeners for the given triggers
   * Must complete within 500ms (REQ-2.1)
   * Deduplicates registrations (REQ-2.2)
   */
  async registerListeners(
    triggers: Array<{ trigger: TriggerType; hookId: string; patterns?: string[] }>,
    workspaceRoot: vscode.Uri
  ): Promise<void> {
    const startTime = Date.now();
    const rootKey = workspaceRoot.toString();

    // Get or create workspace map
    if (!this.registrations.has(rootKey)) {
      this.registrations.set(rootKey, new Map());
    }
    const workspaceMap = this.registrations.get(rootKey)!;

    // Group triggers by type for deduplication
    const triggerGroups = new Map<TriggerType, { hookIds: string[]; patterns: string[] }>();
    for (const { trigger, hookId, patterns } of triggers) {
      if (!triggerGroups.has(trigger)) {
        triggerGroups.set(trigger, { hookIds: [], patterns: [] });
      }
      const group = triggerGroups.get(trigger)!;
      group.hookIds.push(hookId);
      if (patterns) {
        group.patterns.push(...patterns);
      }
    }

    // Register each unique trigger type
    for (const [trigger, { hookIds, patterns }] of triggerGroups) {
      // Check for existing registration (REQ-2.2)
      if (workspaceMap.has(trigger)) {
        const existing = workspaceMap.get(trigger)!;
        // Add new hook IDs to existing registration
        for (const hookId of hookIds) {
          existing.hookIds.add(hookId);
        }
        this.outputLogger?.logInfo(null, `Trigger ${trigger} already registered, added hooks: ${hookIds.join(", ")}`);
        continue;
      }

      try {
        const disposable = this.createListener(trigger, workspaceRoot, patterns);
        workspaceMap.set(trigger, {
          trigger,
          disposable,
          hookIds: new Set(hookIds),
        });
        this.outputLogger?.logInfo(null, `Registered listener for ${trigger} (hooks: ${hookIds.join(", ")})`);
      } catch (error) {
        // REQ-2.3: Log failure and notify callback
        const err = error instanceof Error ? error : new Error(String(error));
        this.outputLogger?.logError(null, new Error(`Failed to register listener for ${trigger}: ${err.message}`));
        this.failureCallback?.(trigger, hookIds, err);
      }
    }

    const duration = Date.now() - startTime;
    this.outputLogger?.logInfo(null, `Event registration completed in ${duration}ms`);
  }


  /**
   * Create a VS Code event listener for the given trigger type
   */
  private createListener(
    trigger: TriggerType,
    workspaceRoot: vscode.Uri,
    patterns?: string[]
  ): vscode.Disposable {
    switch (trigger) {
      case "fileEdited":
        return vscode.workspace.onDidSaveTextDocument((doc) => {
          if (this.matchesPatterns(doc.uri, workspaceRoot, patterns)) {
            this.debouncedDispatch(trigger, workspaceRoot, { filePath: doc.uri.fsPath });
          }
        });

      case "fileCreated":
        return vscode.workspace.onDidCreateFiles((event) => {
          for (const file of event.files) {
            if (this.matchesPatterns(file, workspaceRoot, patterns)) {
              this.debouncedDispatch(trigger, workspaceRoot, { filePath: file.fsPath });
            }
          }
        });

      case "fileDeleted":
        return vscode.workspace.onDidDeleteFiles((event) => {
          for (const file of event.files) {
            if (this.matchesPatterns(file, workspaceRoot, patterns)) {
              this.debouncedDispatch(trigger, workspaceRoot, { filePath: file.fsPath });
            }
          }
        });

      case "gitCommit":
        // Git commit events require SCM API integration
        // For now, we'll use a placeholder that can be triggered manually
        return new vscode.Disposable(() => {});

      case "promptSubmit":
      case "agentStop":
      case "userTriggered":
        // These are programmatic triggers, not VS Code events
        // They will be triggered via triggerManually()
        return new vscode.Disposable(() => {});

      default:
        throw new Error(`Unknown trigger type: ${trigger}`);
    }
  }

  /**
   * Check if a file URI matches the configured patterns
   */
  private matchesPatterns(
    fileUri: vscode.Uri,
    _workspaceRoot: vscode.Uri,
    patterns?: string[]
  ): boolean {
    if (!patterns || patterns.length === 0) {
      return true; // No patterns means match all
    }

    const relativePath = vscode.workspace.asRelativePath(fileUri, false);
    
    for (const pattern of patterns) {
      // Simple glob matching (supports * and **)
      const regex = this.globToRegex(pattern);
      if (regex.test(relativePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert a glob pattern to a regex
   */
  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*\*/g, "{{GLOBSTAR}}") // Temp placeholder for **
      .replace(/\*/g, "[^/]*") // * matches anything except /
      .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches anything
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Generate a unique key for debouncing based on file path and trigger type
   */
  private getDebounceKey(
    trigger: TriggerType,
    workspaceRoot: vscode.Uri,
    filePath?: string
  ): string {
    const rootKey = workspaceRoot.toString();
    return `${rootKey}:${trigger}:${filePath || ""}`;
  }

  /**
   * Dispatch an event with debouncing for file-based triggers
   * If debouncing is enabled and this is a file-based trigger, the event will be
   * delayed by the configured window. If another event for the same file occurs
   * within the window, the timer is reset (coalescing multiple events into one).
   */
  private debouncedDispatch(
    trigger: TriggerType,
    workspaceRoot: vscode.Uri,
    extra: { filePath?: string; gitInfo?: { commit?: string; branch?: string; message?: string } }
  ): void {
    // If debouncing is disabled, dispatch immediately
    if (!this.debounceConfig.enabled) {
      this.dispatchEvent(trigger, workspaceRoot, extra);
      return;
    }

    // Only debounce file-based triggers
    const isFileTrigger = trigger === "fileEdited" || trigger === "fileCreated" || trigger === "fileDeleted";
    if (!isFileTrigger || !extra.filePath) {
      this.dispatchEvent(trigger, workspaceRoot, extra);
      return;
    }

    const debounceKey = this.getDebounceKey(trigger, workspaceRoot, extra.filePath);

    // Clear any existing timer for this key
    const existing = this.debounceTimers.get(debounceKey);
    if (existing) {
      clearTimeout(existing.timeoutId);
      this.debounceTimers.delete(debounceKey);
    }

    // Set a new timer
    const timeoutId = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      this.dispatchEvent(trigger, workspaceRoot, extra);
    }, this.debounceConfig.windowMs);

    // Store the pending event
    this.debounceTimers.set(debounceKey, {
      trigger,
      workspaceRoot,
      extra,
      timeoutId,
    });
  }


  /**
   * Dispatch an event to the callback
   */
  private dispatchEvent(
    trigger: TriggerType,
    workspaceRoot: vscode.Uri,
    extra: { filePath?: string; gitInfo?: { commit?: string; branch?: string; message?: string } }
  ): void {
    const context: HookTriggerContext = {
      hookId: "", // Will be filled by HookManager
      trigger,
      timestamp: new Date().toISOString(),
      workspaceRoot: workspaceRoot.fsPath,
      file: extra.filePath ? { path: extra.filePath } : undefined,
      git: extra.gitInfo,
    };

    this.eventCallback?.(context);
  }

  /**
   * Manually trigger an event (for programmatic triggers)
   */
  triggerManually(
    trigger: TriggerType,
    workspaceRoot: vscode.Uri,
    extra?: { userInput?: string; gitInfo?: { commit?: string; branch?: string; message?: string } }
  ): void {
    const context: HookTriggerContext = {
      hookId: "",
      trigger,
      timestamp: new Date().toISOString(),
      workspaceRoot: workspaceRoot.fsPath,
      user: extra?.userInput ? { input: extra.userInput } : undefined,
      git: extra?.gitInfo,
    };

    this.eventCallback?.(context);
  }

  /**
   * Unregister all listeners for a workspace
   */
  unregisterListeners(workspaceRoot: vscode.Uri): void {
    const rootKey = workspaceRoot.toString();
    const workspaceMap = this.registrations.get(rootKey);

    if (workspaceMap) {
      for (const [trigger, entry] of workspaceMap) {
        entry.disposable.dispose();
        this.outputLogger?.logInfo(null, `Unregistered listener for ${trigger}`);
      }
      this.registrations.delete(rootKey);
    }
    
    // Also clear any pending debounces for this workspace
    for (const [key, pending] of this.debounceTimers) {
      if (key.startsWith(rootKey)) {
        clearTimeout(pending.timeoutId);
        this.debounceTimers.delete(key);
      }
    }
  }

  /**
   * Check if a trigger is registered for a workspace
   */
  isRegistered(trigger: TriggerType, workspaceRoot: vscode.Uri): boolean {
    const rootKey = workspaceRoot.toString();
    const workspaceMap = this.registrations.get(rootKey);
    return workspaceMap?.has(trigger) ?? false;
  }

  /**
   * Get all registered triggers for a workspace
   */
  getRegisteredTriggers(workspaceRoot: vscode.Uri): TriggerType[] {
    const rootKey = workspaceRoot.toString();
    const workspaceMap = this.registrations.get(rootKey);
    return workspaceMap ? Array.from(workspaceMap.keys()) : [];
  }

  /**
   * Dispose all registrations
   */
  dispose(): void {
    // Clear all pending debounces
    this.clearPendingDebounces();
    
    for (const [, workspaceMap] of this.registrations) {
      for (const [, entry] of workspaceMap) {
        entry.disposable.dispose();
      }
    }
    this.registrations.clear();
  }
}
