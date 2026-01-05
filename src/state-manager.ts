/**
 * Workflow state management
 * Handles reading, writing, and managing spec workflow state
 */

import * as fs from "fs";
import * as path from "path";
import { SpecState, Phase, TaskStatus } from "./types";
import { getSpecDirectoryPath } from "./spec-directory";

/**
 * Get the path to the state file for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The full path to the state.json file
 */
export function getStatePath(
  featureName: string,
  workspaceRoot?: string
): string {
  const specDir = getSpecDirectoryPath(featureName, workspaceRoot);
  return path.join(specDir, "state.json");
}

/**
 * Create a new initial state for a spec
 * @param featureName - The feature name
 * @returns A new SpecState object with default values
 */
export function createInitialState(featureName: string): SpecState {
  const now = new Date().toISOString();
  return {
    featureName,
    currentPhase: "requirements",
    approvals: {
      requirements: false,
      design: false,
      tasks: false,
    },
    taskStatuses: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Read the state for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The SpecState object, or null if it doesn't exist
 */
export function readState(
  featureName: string,
  workspaceRoot?: string
): SpecState | null {
  try {
    const statePath = getStatePath(featureName, workspaceRoot);

    if (!fs.existsSync(statePath)) {
      return null;
    }

    const content = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as SpecState;

    // Validate the state has required fields
    if (!state.featureName) {
      throw new Error(`Invalid state file format: missing featureName`);
    }
    if (!state.currentPhase) {
      throw new Error(`Invalid state file format: missing currentPhase`);
    }
    if (!state.approvals) {
      throw new Error(`Invalid state file format: missing approvals`);
    }
    if (!state.taskStatuses) {
      throw new Error(`Invalid state file format: missing taskStatuses`);
    }

    return state;
  } catch (error) {
    console.error(`Error reading state for ${featureName}:`, error);
    return null;
  }
}

/**
 * Write the state for a spec
 * @param state - The SpecState object to write
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function writeState(state: SpecState, workspaceRoot?: string): boolean {
  try {
    const statePath = getStatePath(state.featureName, workspaceRoot);

    // Update the updatedAt timestamp
    state.updatedAt = new Date().toISOString();

    // Ensure the directory exists
    const specDir = path.dirname(statePath);
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    // Write the state file with pretty formatting
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

    return true;
  } catch (error) {
    console.error(`Error writing state for ${state.featureName}:`, error);
    return false;
  }
}

/**
 * Get or create the state for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The SpecState object (existing or newly created)
 */
export function getOrCreateState(
  featureName: string,
  workspaceRoot?: string
): SpecState {
  let state = readState(featureName, workspaceRoot);

  if (!state) {
    state = createInitialState(featureName);
    writeState(state, workspaceRoot);
  }

  return state;
}

/**
 * Update the current phase for a spec
 * @param featureName - The feature name
 * @param phase - The new phase
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function updatePhase(
  featureName: string,
  phase: Phase,
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);
  state.currentPhase = phase;
  return writeState(state, workspaceRoot);
}

/**
 * Approve a phase for a spec
 * @param featureName - The feature name
 * @param phase - The phase to approve
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function approvePhase(
  featureName: string,
  phase: "requirements" | "design" | "tasks",
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);
  state.approvals[phase] = true;
  return writeState(state, workspaceRoot);
}

/**
 * Unapprove a phase for a spec
 * @param featureName - The feature name
 * @param phase - The phase to unapprove
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function unapprovePhase(
  featureName: string,
  phase: "requirements" | "design" | "tasks",
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);
  state.approvals[phase] = false;
  
  // When unapproving a phase, also roll back the currentPhase if it's ahead
  // This allows re-generation of subsequent phases
  const phaseOrder: Phase[] = ["requirements", "design", "tasks"];
  const currentPhaseIndex = phaseOrder.indexOf(state.currentPhase);
  const unapprovedPhaseIndex = phaseOrder.indexOf(phase);
  
  // If the current phase is at or beyond the unapproved phase, roll back
  if (currentPhaseIndex >= unapprovedPhaseIndex) {
    state.currentPhase = phase;
  }
  
  return writeState(state, workspaceRoot);
}

/**
 * Check if a phase is approved
 * @param featureName - The feature name
 * @param phase - The phase to check
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if approved, false otherwise
 */
export function isPhaseApproved(
  featureName: string,
  phase: "requirements" | "design" | "tasks",
  workspaceRoot?: string
): boolean {
  const state = readState(featureName, workspaceRoot);
  return state?.approvals[phase] ?? false;
}

/**
 * Update the status of a task
 * @param featureName - The feature name
 * @param taskId - The task ID (e.g., "1", "1.1", "2.3")
 * @param status - The new task status
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function updateTaskStatus(
  featureName: string,
  taskId: string,
  status: TaskStatus,
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);
  state.taskStatuses[taskId] = status;
  return writeState(state, workspaceRoot);
}

/**
 * Get the status of a task
 * @param featureName - The feature name
 * @param taskId - The task ID
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The task status, or "not-started" if not found
 */
export function getTaskStatus(
  featureName: string,
  taskId: string,
  workspaceRoot?: string
): TaskStatus {
  const state = readState(featureName, workspaceRoot);
  return state?.taskStatuses[taskId] ?? "not-started";
}

/**
 * Get the current phase for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The current phase, or "requirements" if not found
 */
export function getCurrentPhase(
  featureName: string,
  workspaceRoot?: string
): Phase {
  const state = readState(featureName, workspaceRoot);
  return state?.currentPhase ?? "requirements";
}
