/**
 * Agent Hooks Extension Entry Point
 * Manages lifecycle of the agent hooks system
 *
 * Task 3.2: Wire components in extension activation
 * - Instantiate OutputLogger, ConfigLoader, HookManager, EventRegistry, ExecutionEngine, PromptRunner
 * - Hook up ConfigLoader.onDidChange -> HookManager.setHooks -> EventRegistry.registerListeners
 */

import * as vscode from "vscode";
import { OutputLogger } from "./outputLogger";
import { ConfigLoader } from "./configLoader";
import { HookManager, HookEvent } from "./hookManager";
import { EventRegistry } from "./eventRegistry";
import { HookExecutionEngine } from "./executionEngine";
import { PromptRunner } from "./promptRunner";
import { HookTriggerContext, TriggerType, Hook } from "./types";

// Module-level component instances
let outputLogger: OutputLogger | null = null;
let configLoader: ConfigLoader | null = null;
let hookManager: HookManager | null = null;
let eventRegistry: EventRegistry | null = null;
let executionEngine: HookExecutionEngine | null = null;
let promptRunner: PromptRunner | null = null;

/**
 * Activate the agent hooks extension
 * Instantiates all components and wires them together
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("Agent Hooks extension is activating...");

  // 1. Initialize OutputLogger first (needed by other components)
  outputLogger = new OutputLogger("Agent Hooks");
  context.subscriptions.push(outputLogger);
  outputLogger.logInfo(null, "Agent Hooks extension activating...");

  // 2. Initialize PromptRunner (no dependencies)
  promptRunner = new PromptRunner();
  outputLogger.logInfo(null, "PromptRunner initialized");

  // 3. Initialize EventRegistry (depends on OutputLogger)
  eventRegistry = new EventRegistry(outputLogger);
  outputLogger.logInfo(null, "EventRegistry initialized");

  // 4. Initialize HookManager (depends on EventRegistry, OutputLogger)
  hookManager = new HookManager(eventRegistry, outputLogger);
  outputLogger.logInfo(null, "HookManager initialized");

  // 5. Initialize ExecutionEngine (depends on PromptRunner, OutputLogger)
  executionEngine = new HookExecutionEngine({
    promptRunner,
    outputLogger,
    defaultConcurrency: 4,
    defaultTimeout: 30000,
  });
  outputLogger.logInfo(null, "ExecutionEngine initialized");

  // 6. Initialize ConfigLoader (depends on OutputLogger)
  configLoader = new ConfigLoader(outputLogger);
  outputLogger.logInfo(null, "ConfigLoader initialized");

  // 7. Wire up EventRegistry callback to dispatch events to HookManager and ExecutionEngine
  eventRegistry.setEventCallback((triggerContext: HookTriggerContext) => {
    handleTriggerEvent(triggerContext);
  });

  // 8. Wire up EventRegistry failure callback to disable hooks on registration failure
  eventRegistry.setFailureCallback((trigger: TriggerType, hookIds: string[], error: Error) => {
    outputLogger?.logError(null, new Error(`Listener registration failed for ${trigger}: ${error.message}`));
    // Disable affected hooks
    for (const hookId of hookIds) {
      hookManager?.disableHook(hookId, undefined, `Listener registration failed: ${error.message}`);
    }
  });

  // 9. Wire up ConfigLoader.onDidChange to update HookManager
  const configChangeDisposable = configLoader.onDidChange(async (result) => {
    if (!result.success) {
      outputLogger?.logError(null, new Error(`Config load failed: ${result.errors?.map(e => e.message).join(", ")}`));
      return;
    }

    outputLogger?.logInfo(null, `Config changed, updating ${result.hooks.length} hooks`);

    // Update secret patterns for redaction
    updateSecretPatterns(result.hooks);

    // Update hooks for each workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        await hookManager?.setHooks(folder.uri, result.hooks);
      }
    }
  });
  context.subscriptions.push(configChangeDisposable);

  // 10. Load initial configuration for each workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  outputLogger.logInfo(null, `Workspace folders: ${workspaceFolders?.length || 0}`);

  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      outputLogger.logInfo(null, `Loading hooks for workspace: ${folder.uri.fsPath}`);

      try {
        // Load hooks from config
        const hooks = await configLoader.loadHooks(folder.uri);
        outputLogger.logInfo(null, `Loaded ${hooks.length} hooks from config`);

        // Update secret patterns for redaction
        updateSecretPatterns(hooks);

        // Set hooks in manager (this also registers event listeners)
        await hookManager.setHooks(folder.uri, hooks);

        // Start watching for config changes
        const watcherDisposable = configLoader.watchConfig(folder.uri);
        context.subscriptions.push(watcherDisposable);

        outputLogger.logInfo(null, `Hooks system initialized for workspace: ${folder.name}`);
      } catch (error) {
        outputLogger.logError(null, error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // 11. Register disposables for cleanup
  context.subscriptions.push({
    dispose: () => {
      configLoader?.dispose();
      eventRegistry?.dispose();
      hookManager?.dispose();
    },
  });

  outputLogger.logInfo(null, "Agent Hooks extension activated successfully");
  console.log("Agent Hooks extension activated successfully");
}

/**
 * Collect all secret patterns from hooks and update OutputLogger
 */
function updateSecretPatterns(hooks: Hook[]): void {
  if (!outputLogger) return;

  const allPatterns: RegExp[] = [];
  for (const hook of hooks) {
    if (hook.secretPatterns && hook.secretPatterns.length > 0) {
      for (const pattern of hook.secretPatterns) {
        try {
          allPatterns.push(new RegExp(pattern, "g"));
        } catch {
          // Invalid pattern - skip (already validated at load time)
        }
      }
    }
  }
  outputLogger.setSecretPatterns(allPatterns);
}

/**
 * Handle a trigger event from the EventRegistry
 * Finds matching hooks and enqueues them for execution
 */
async function handleTriggerEvent(triggerContext: HookTriggerContext): Promise<void> {
  if (!hookManager || !executionEngine || !outputLogger) {
    console.error("Agent Hooks: Components not initialized");
    return;
  }

  outputLogger.logInfo(null, `Event triggered: ${triggerContext.trigger} for ${triggerContext.file?.path || "workspace"}`);

  // Build HookEvent from trigger context
  const hookEvent: HookEvent = {
    trigger: triggerContext.trigger,
    workspaceRoot: triggerContext.workspaceRoot,
    filePath: triggerContext.file?.path,
    gitInfo: triggerContext.git ? {
      repoRoot: triggerContext.workspaceRoot, // Use workspace root as repo root
      commit: triggerContext.git.commit,
      branch: triggerContext.git.branch,
      message: triggerContext.git.message,
    } : undefined,
  };

  // Get matching enabled hooks
  const matchingHooks = hookManager.getEnabledHooksForEvent(hookEvent);
  outputLogger.logInfo(null, `Found ${matchingHooks.length} matching hooks for event`);

  // Enqueue each matching hook for execution
  for (const hook of matchingHooks) {
    try {
      // Create context with hook ID
      const contextWithHookId: HookTriggerContext = {
        ...triggerContext,
        hookId: hook.id,
      };

      const executionId = await executionEngine.enqueue(hook, contextWithHookId);
      outputLogger.logInfo(contextWithHookId, `Enqueued hook ${hook.id} for execution (id: ${executionId})`);
    } catch (error) {
      outputLogger.logError(
        { hookId: hook.id } as HookTriggerContext,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

/**
 * Deactivate the agent hooks extension
 * Shuts down execution engine and cleans up resources
 */
export async function deactivate(): Promise<void> {
  console.log("Agent Hooks extension is deactivating...");

  if (outputLogger) {
    outputLogger.logInfo(null, "Agent Hooks extension deactivating...");
  }

  // Shutdown execution engine (cancels active executions)
  if (executionEngine) {
    try {
      await executionEngine.shutdown();
      outputLogger?.logInfo(null, "ExecutionEngine shutdown complete");
    } catch (error) {
      outputLogger?.logError(null, error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Unregister event listeners
  if (eventRegistry) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        eventRegistry.unregisterListeners(folder.uri);
      }
    }
    eventRegistry.dispose();
    outputLogger?.logInfo(null, "EventRegistry disposed");
  }

  // Dispose config loader
  if (configLoader) {
    configLoader.dispose();
    outputLogger?.logInfo(null, "ConfigLoader disposed");
  }

  // Dispose hook manager
  if (hookManager) {
    hookManager.dispose();
    outputLogger?.logInfo(null, "HookManager disposed");
  }

  // Clear references
  executionEngine = null;
  eventRegistry = null;
  configLoader = null;
  hookManager = null;
  promptRunner = null;

  if (outputLogger) {
    outputLogger.logInfo(null, "Agent Hooks extension deactivated");
  }

  outputLogger = null;
  console.log("Agent Hooks extension deactivated");
}

/**
 * Get the output logger instance (for testing)
 */
export function getOutputLogger(): OutputLogger | null {
  return outputLogger;
}

/**
 * Get the config loader instance (for testing)
 */
export function getConfigLoader(): ConfigLoader | null {
  return configLoader;
}

/**
 * Get the hook manager instance (for testing)
 */
export function getHookManager(): HookManager | null {
  return hookManager;
}

/**
 * Get the event registry instance (for testing)
 */
export function getEventRegistry(): EventRegistry | null {
  return eventRegistry;
}

/**
 * Get the execution engine instance (for testing)
 */
export function getExecutionEngine(): HookExecutionEngine | null {
  return executionEngine;
}

/**
 * Get the prompt runner instance (for testing)
 */
export function getPromptRunner(): PromptRunner | null {
  return promptRunner;
}
