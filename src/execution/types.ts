/**
 * Type definitions for the Autonomous Execution Engine
 */

/**
 * Session phase enum
 */
export enum SessionPhase {
  PARSE_SPEC = 0,
  GENERATE_REQUIREMENTS = 1,
  GENERATE_DESIGN = 2,
  GENERATE_TASKS = 3,
  EXECUTE_TASKS = 4,
  COMPLETE = 5,
}

/**
 * Session status states
 */
export type SessionStatus =
  | "RUNNING"
  | "PAUSED"
  | "PAUSED_FOR_APPROVAL"
  | "FAILED"
  | "COMPLETED"
  | "STALE";

/**
 * Task checkbox state
 */
export enum CheckboxState {
  PENDING = "PENDING",
  COMPLETE = "COMPLETE",
  FAILED = "FAILED",
  IN_PROGRESS = "IN_PROGRESS",
  INCOMPLETE = "INCOMPLETE",
}

/**
 * Success criteria types
 */
export type SuccessCriteriaType =
  | "file-exists"
  | "command-runs"
  | "build-passes"
  | "test-passes"
  | "lint-passes"
  | "custom";

/**
 * Success criteria definition
 */
export interface SuccessCriteria {
  type: SuccessCriteriaType;
  description: string;
  validation: string;
}

/**
 * Task record for session tracking
 */
export interface TaskRecord {
  id: string;
  title: string;
  rawLine: number;
  checkboxState: CheckboxState;
  completionTimestamp?: string;
  successCriteria?: SuccessCriteria[];
  lastDecision?: {
    confidence: number;
    reason: string;
    timestamp: string;
  };
  retryCount: number;
  error?: string;
}

/**
 * Session state stored in session.md
 */
export interface SessionState {
  id: string;
  featureName: string;
  workspaceRoot: string;
  status: SessionStatus;
  tasks: TaskRecord[];
  currentPhase: number;
  currentTaskIndex: number;
  createdAt: string;
  updatedAt: string;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  fileModificationCount: number;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  featureName: string;
  workspaceRoot: string;
  specDirectory: string;
  maxConcurrentTasks?: number;
  maxTasksPerSession?: number;
  maxFileModifications?: number;
  requireConfirmationForDestructiveOps?: boolean;
  enableTaskDetection?: boolean;
  phaseTimeout?: number;
}

/**
 * Decision result from the decision engine
 */
export interface DecisionResult {
  confidence: number;
  reasoning: string;
  detected: boolean;
  provider: "heuristic" | "llm";
}

/**
 * Execution plan for a task
 */
export interface ExecutionPlan {
  taskId: string;
  actions: ExecutionAction[];
}

/**
 * Individual execution action
 */
export interface ExecutionAction {
  type: "file-write" | "file-delete" | "command" | "llm-generate";
  target: string;
  content?: string;
  command?: string;
  args?: string[];
  destructive?: boolean;
}

/**
 * Result of execution
 */
export interface ExecutionResult {
  success: boolean;
  taskId: string;
  filesModified?: string[];
  filesCreated?: string[];
  commandsRun?: string[];
  error?: string;
  duration?: number;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  checkpointId: string;
  sessionId: string;
  phase: number;
  createdAt: string;
  files: CheckpointFile[];
  gitCommit?: string;
}

/**
 * File snapshot in checkpoint
 */
export interface CheckpointFile {
  path: string;
  hash: string;
  content?: string;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  filesRestored: string[];
  error?: string;
}

/**
 * API call record for logging
 */
export interface ApiCallRecord {
  timestamp: string;
  model: string;
  endpoint: string;
  promptLength: number;
  tokens?: number;
  latency: number;
  statusCode: number;
  attempt: number;
  error?: string;
}

/**
 * Event types for the event bus
 */
export type ExecutionEventType =
  | "sessionStarted"
  | "sessionPaused"
  | "sessionResumed"
  | "sessionCompleted"
  | "sessionFailed"
  | "taskEvaluated"
  | "taskQueued"
  | "taskStarted"
  | "taskCompleted"
  | "taskFailed"
  | "checkpointCreated"
  | "rollbackPerformed"
  | "approvalRequired"
  | "progressUpdate"
  | "contextInitialized"
  | "contextLimitWarning"
  | "contextSummarizationTriggered"
  | "contextSummarized"
  | "reflectionStarted"
  | "reflectionIteration"
  | "reflectionCompleted";

/**
 * Event payload
 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  sessionId: string;
  timestamp: string;
  data: Record<string, any>;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: ExecutionEvent) => void | Promise<void>;

/**
 * Approval request for destructive operations
 */
export interface ApprovalRequest {
  sessionId: string;
  taskId: string;
  operation: string;
  description: string;
  files?: string[];
}

/**
 * Approval result
 */
export interface ApprovalResult {
  approved: boolean;
  reason?: string;
}

/**
 * Progress information
 */
export interface ProgressInfo {
  sessionId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentTask?: string;
  percentage: number;
  estimatedTimeRemaining?: number;
}

/**
 * Failure context for reflection loop
 */
export interface FailureContext {
  iteration: number;
  previousAttempts: AttemptRecord[];
  failurePatterns: FailurePattern[];
  environmentState: EnvironmentState;
  userGuidance?: string;
}

/**
 * Record of a single execution attempt
 */
export interface AttemptRecord {
  iteration: number;
  timestamp: string;
  actions: ExecutionAction[];
  result: ExecutionResult;
  evaluationReason: string;
  confidence: number;
}

/**
 * Detected failure pattern
 */
export interface FailurePattern {
  errorMessage: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Environment state snapshot
 */
export interface EnvironmentState {
  filesCreated: string[];
  filesModified: string[];
  commandOutputs: Map<string, string>;
  workingDirectoryState: string[];
}

/**
 * Reflection loop configuration (full config)
 */
export interface ReflectionConfig {
  enabled: boolean;
  maxIterations: number;
  confidenceThreshold: number;
  enablePatternDetection: boolean;
  pauseOnPersistentFailure: boolean;
  persistentFailureThreshold: number;
}

/**
 * Reflection loop options (partial config for method calls)
 */
export interface ReflectionOptions {
  maxIterations?: number;
  confidenceThreshold?: number;
  enabled?: boolean;
  persistentFailureThreshold?: number;
  pauseOnPersistentFailure?: boolean;
  userGuidance?: string;
}

/**
 * Detailed evaluation result
 */
export interface DetailedEvaluation extends DecisionResult {
  criteriaResults: CriterionResult[];
  missingElements: string[];
  suggestions: string[];
}

/**
 * Result for a single criterion
 */
export interface CriterionResult {
  criterion: SuccessCriteria;
  met: boolean;
  reason: string;
  evidence?: string;
}

/**
 * Reflection statistics for a session
 */
export interface ReflectionStats {
  totalReflections: number;
  averageIterations: number;
  successRate: number;
  commonFailurePatterns: FailurePattern[];
}
