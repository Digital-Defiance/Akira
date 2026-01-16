/**
 * Hook Manager
 * Authoritative in-memory store of hooks and lifecycle operations
 * 
 * Requirements:
 * - REQ-1.3: Persist normalized in-memory representation
 * - REQ-2.3: Mark affected hooks as disabled on registration failure
 * - REQ-3.1: Enqueue matching enabled hooks within 1000ms
 * - REQ-4.1: Filter git hooks by allowGit and repoRoot
 */

import * as vscode from "vscode";
import { Hook, HookRuntime, HookTriggerContext, TriggerType } from "./types";
import { EventRegistry } from "./eventRegistry";
import { OutputLogger } from "./outputLogger";

/** Event representing a hook trigger */
export interface HookEvent {
  trigger: TriggerType;
  workspaceRoot: string;
  filePath?: string;
  gitInfo?: {
    repoRoot?: string;
    commit?: string;
    branch?: string;
    message?: string;
  };
}

export class HookManager {
  /** Map<workspaceRoot, Map<hookId, HookRuntime>> */
  private hooks = new Map<string, Map<string, HookRuntime>>();
  private eventRegistry: EventRegistry | null = null;
  private outputLogger: OutputLogger | null = null;

  constructor(eventRegistry?: EventRegistry, outputLogger?: OutputLogger) {
    this.eventRegistry = eventRegistry || null;
    this.outputLogger = outputLogger || null;
  }

  /**
   * Set the event registry
   */
  setEventRegistry(registry: EventRegistry): void {
    this.eventRegistry = registry;
  }

  /**
   * Set the output logger
   */
  setOutputLogger(logger: OutputLogger): void {
    this.outputLogger = logger;
  }


  /**
   * Set hooks for a workspace
   * Normalizes hooks and registers event listeners
   */
  async setHooks(workspaceRoot: vscode.Uri, hooks: Hook[]): Promise<void> {
    const rootKey = workspaceRoot.toString();

    // Normalize hooks to HookRuntime
    const runtimeHooks = this.normalizeHooks(hooks);

    // Create workspace map
    const hookMap = new Map<string, HookRuntime>();
    for (const hook of runtimeHooks) {
      // Check for duplicate IDs
      if (hookMap.has(hook.id)) {
        this.outputLogger?.logError(null, new Error(`Duplicate hook ID: ${hook.id}`));
        continue;
      }
      hookMap.set(hook.id, hook);
    }

    this.hooks.set(rootKey, hookMap);
    this.outputLogger?.logInfo(null, `Set ${hookMap.size} hooks for workspace`);

    // Register event listeners for distinct triggers
    if (this.eventRegistry) {
      const triggers = this.getDistinctTriggers(runtimeHooks);
      await this.eventRegistry.registerListeners(triggers, workspaceRoot);
    }
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
   * Get distinct triggers from hooks for registration
   */
  private getDistinctTriggers(
    hooks: HookRuntime[]
  ): Array<{ trigger: TriggerType; hookId: string; patterns?: string[] }> {
    const triggers: Array<{ trigger: TriggerType; hookId: string; patterns?: string[] }> = [];

    for (const hook of hooks) {
      if (!hook.enabled) continue;

      triggers.push({
        trigger: hook.trigger.type,
        hookId: hook.id,
        patterns: hook.trigger.patterns,
      });
    }

    return triggers;
  }


  /**
   * Get enabled hooks that match an event
   * Filters by enabled status, pattern matching, and git allowlist (REQ-4.1)
   */
  getEnabledHooksForEvent(event: HookEvent): HookRuntime[] {
    const hookMap = this.hooks.get(event.workspaceRoot);
    if (!hookMap) {
      return [];
    }

    const matchingHooks: HookRuntime[] = [];

    for (const [, hook] of hookMap) {
      // Skip disabled hooks
      if (!hook.enabled) {
        continue;
      }

      // Check trigger type matches
      if (hook.trigger.type !== event.trigger) {
        continue;
      }

      // For git triggers, check allowGit and repoRoot (REQ-4.1)
      if (event.trigger === "gitCommit") {
        if (!hook.allowGit) {
          this.outputLogger?.logInfo(
            { hookId: hook.id } as HookTriggerContext,
            `Skipping hook ${hook.id}: allowGit is false`
          );
          continue;
        }
        if (hook.repoRoot && event.gitInfo?.repoRoot !== hook.repoRoot) {
          this.outputLogger?.logInfo(
            { hookId: hook.id } as HookTriggerContext,
            `Skipping hook ${hook.id}: repoRoot mismatch`
          );
          continue;
        }
      }

      // Check file pattern matching for file-based triggers
      if (event.filePath && hook.trigger.patterns && hook.trigger.patterns.length > 0) {
        if (!this.matchesPatterns(event.filePath, hook.trigger.patterns)) {
          continue;
        }
      }

      matchingHooks.push(hook);
    }

    return matchingHooks;
  }

  /**
   * Check if a file path matches any of the patterns
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      const regex = this.globToRegex(pattern);
      if (regex.test(filePath)) {
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
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/{{GLOBSTAR}}/g, ".*");
    return new RegExp(`^${escaped}$`);
  }


  /**
   * Disable a hook with an optional reason (REQ-2.3)
   */
  disableHook(hookId: string, workspaceRoot?: string, reason?: string): void {
    const workspaces = workspaceRoot 
      ? [workspaceRoot] 
      : Array.from(this.hooks.keys());

    for (const ws of workspaces) {
      const hookMap = this.hooks.get(ws);
      if (hookMap?.has(hookId)) {
        const hook = hookMap.get(hookId)!;
        hook.enabled = false;
        hook.disabledReason = reason;
        this.outputLogger?.logInfo(
          { hookId } as HookTriggerContext,
          `Hook ${hookId} disabled${reason ? `: ${reason}` : ""}`
        );
      }
    }
  }

  /**
   * Enable a previously disabled hook
   */
  enableHook(hookId: string, workspaceRoot?: string): void {
    const workspaces = workspaceRoot 
      ? [workspaceRoot] 
      : Array.from(this.hooks.keys());

    for (const ws of workspaces) {
      const hookMap = this.hooks.get(ws);
      if (hookMap?.has(hookId)) {
        const hook = hookMap.get(hookId)!;
        hook.enabled = true;
        hook.disabledReason = undefined;
        this.outputLogger?.logInfo(
          { hookId } as HookTriggerContext,
          `Hook ${hookId} enabled`
        );
      }
    }
  }

  /**
   * Get a specific hook by ID
   */
  getHook(hookId: string, workspaceRoot: string): HookRuntime | undefined {
    return this.hooks.get(workspaceRoot)?.get(hookId);
  }

  /**
   * Get all hooks for a workspace
   */
  getHooks(workspaceRoot: string): HookRuntime[] {
    const hookMap = this.hooks.get(workspaceRoot);
    return hookMap ? Array.from(hookMap.values()) : [];
  }

  /**
   * Get all enabled hooks for a workspace
   */
  getEnabledHooks(workspaceRoot: string): HookRuntime[] {
    return this.getHooks(workspaceRoot).filter((h) => h.enabled);
  }

  /**
   * Clear all hooks for a workspace
   */
  clearHooks(workspaceRoot: vscode.Uri): void {
    const rootKey = workspaceRoot.toString();
    this.hooks.delete(rootKey);
    this.eventRegistry?.unregisterListeners(workspaceRoot);
    this.outputLogger?.logInfo(null, "Cleared all hooks for workspace");
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.hooks.clear();
  }
}
