/**
 * Core type definitions for the Copilot Spec Extension
 */

export type Phase = "requirements" | "design" | "tasks" | "execution";

export type TaskStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "skipped"
  | "failed";

export type EARSPattern =
  | "ubiquitous"
  | "event-driven"
  | "state-driven"
  | "unwanted-event"
  | "optional"
  | "complex";

export interface SpecState {
  featureName: string;
  currentPhase: Phase;
  approvals: {
    requirements: boolean;
    design: boolean;
    tasks: boolean;
  };
  taskStatuses: Record<string, TaskStatus>;
  propertyTestFailures?: Record<string, PropertyTestFailure>;
  validatedRequirements?: Record<string, RequirementValidation>;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyTestFailure {
  taskId: string;
  propertyNumber: number;
  failingExample: string;
  errorMessage: string;
  timestamp: string;
}

export interface RequirementValidation {
  requirementId: string;
  propertyNumber: number;
  validated: boolean;
  timestamp: string;
}

export interface TaskProgress {
  total: number;
  completed: number;
  inProgress: number;
  optional: number;
  percentage: number;
}

export interface ValidationError {
  requirementId: string;
  rule: "EARS" | "INCOSE";
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  requirementId: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
