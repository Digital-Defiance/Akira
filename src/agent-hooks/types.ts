/**
 * Type definitions for Agent Hooks system
 */

/**
 * Trigger types that can activate hooks
 */
export type TriggerType =
  | "fileEdited"
  | "fileCreated"
  | "fileDeleted"
  | "userTriggered"
  | "promptSubmit"
  | "agentStop"
  | "gitCommit";

/**
 * Hook action types
 */
export type HookActionType = "askAgent" | "runCommand";

/**
 * Hook definition from .akira/hooks.json
 */
export interface Hook {
  id: string;
  name: string;
  description?: string;
  trigger: {
    type: TriggerType;
    patterns?: string[]; // File patterns for file-based triggers
  };
  action: {
    type: HookActionType;
    prompt?: string; // For askAgent
    command?: string; // For runCommand
  };
  enabled?: boolean;
  concurrency?: number;
  timeout?: number; // milliseconds
  retry?: {
    maxAttempts?: number;
    backoffMs?: number;
    jitter?: boolean;
  };
  allowGit?: boolean; // Required for git triggers
  repoRoot?: string; // Required for git triggers
  secretPatterns?: string[]; // Regex patterns for secret redaction
}

/**
 * Runtime state for a hook
 */
export interface HookRuntime extends Hook {
  enabled: boolean;
  concurrency: number;
  timeout: number;
  retry: {
    maxAttempts: number;
    backoffMs: number;
    jitter: boolean;
  };
  disabledReason?: string;
}

/**
 * Context provided when a hook is triggered
 */
export interface HookTriggerContext {
  hookId: string;
  trigger: TriggerType;
  timestamp: string;
  workspaceRoot: string;
  file?: {
    path: string;
    content?: string;
  };
  git?: {
    commit?: string;
    branch?: string;
    message?: string;
  };
  user?: {
    input?: string;
  };
}

/**
 * Execution record for a hook run
 */
export interface ExecutionRecord {
  id: string;
  hookId: string;
  context: HookTriggerContext;
  status: "queued" | "running" | "success" | "failure" | "timeout" | "canceled";
  attempt: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

/**
 * Result from loading hooks configuration
 */
export interface HookLoadResult {
  success: boolean;
  hooks: Hook[];
  errors?: Array<{
    message: string;
    path?: string;
  }>;
}

/**
 * Options for prompt execution
 */
export interface PromptOptions {
  timeout?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
}

/**
 * Result from prompt execution
 */
export interface PromptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut?: boolean;
  canceled?: boolean;
}

/**
 * Execution ID type
 */
export type ExecutionId = string;

/**
 * Configuration for debouncing high-frequency triggers
 */
export interface DebounceConfig {
  /** Whether debouncing is enabled */
  enabled: boolean;
  /** Debounce window in milliseconds (default 500ms) */
  windowMs: number;
}
