/**
 * Property-Based Testing Support
 * Handles property test tagging, failure capture, and requirements validation tracking
 */

import { readState, writeState, getOrCreateState } from "./state-manager";

/**
 * Generate a property test tag comment
 * @param featureName - The feature name
 * @param propertyNumber - The property number (e.g., 1, 2, 3)
 * @param propertyText - The property description
 * @returns The formatted tag comment
 */
export function generatePropertyTestTag(
  featureName: string,
  propertyNumber: number,
  propertyText: string
): string {
  return `// **Feature: ${featureName}, Property ${propertyNumber}: ${propertyText}**`;
}

/**
 * Extract property information from a property reference string
 * @param propertyRef - The property reference (e.g., "Property 1", "Property 29")
 * @returns The property number, or null if invalid
 */
export function extractPropertyNumber(propertyRef: string): number | null {
  const match = propertyRef.match(/^Property (\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse a property test tag from a comment
 * @param tag - The tag comment string
 * @returns Parsed tag information, or null if invalid
 */
export interface PropertyTestTag {
  featureName: string;
  propertyNumber: number;
  propertyText: string;
}

export function parsePropertyTestTag(tag: string): PropertyTestTag | null {
  // Match format: // **Feature: {name}, Property {N}: {text}**
  // Allow flexible whitespace
  const match = tag.match(
    /\/\/\s*\*\*\s*Feature:\s*([^,]+?)\s*,\s*Property\s+(\d+)\s*:\s*([^*]+?)\s*\*\*/
  );

  if (!match) {
    return null;
  }

  return {
    featureName: match[1].trim(),
    propertyNumber: parseInt(match[2], 10),
    propertyText: match[3].trim(),
  };
}

/**
 * Validate that a property test tag is correctly formatted
 * @param tag - The tag comment string
 * @returns True if valid, false otherwise
 */
export function validatePropertyTestTag(tag: string): boolean {
  return parsePropertyTestTag(tag) !== null;
}

/**
 * Failure example capture
 */

import { PropertyTestFailure } from "./types";

/**
 * Parse a fast-check error message to extract the failing example
 * @param errorMessage - The error message from fast-check
 * @returns The failing example string, or null if not found
 */
export function extractFailingExample(errorMessage: string): string | null {
  // fast-check format: "Counterexample: [value1, value2, ...]"
  const counterexampleMatch = errorMessage.match(
    /Counterexample:\s*(\[.*?\]|\{.*?\}|".*?"|'.*?'|\S+)/s
  );

  if (counterexampleMatch) {
    return counterexampleMatch[1];
  }

  // Alternative format: "Got error with value: ..."
  const valueMatch = errorMessage.match(/Got.*?with value:\s*(.+?)(?:\n|$)/);
  if (valueMatch) {
    return valueMatch[1].trim();
  }

  return null;
}

/**
 * Create a PropertyTestFailure object from test failure information
 * @param taskId - The task ID
 * @param propertyNumber - The property number
 * @param errorMessage - The full error message
 * @returns A PropertyTestFailure object
 */
export function createPropertyTestFailure(
  taskId: string,
  propertyNumber: number,
  errorMessage: string
): PropertyTestFailure {
  const failingExample = extractFailingExample(errorMessage) || "Unknown";

  return {
    taskId,
    propertyNumber,
    failingExample,
    errorMessage,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Record a property test failure in the spec state
 * @param featureName - The feature name
 * @param failure - The PropertyTestFailure object
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function recordPropertyTestFailure(
  featureName: string,
  failure: PropertyTestFailure,
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);

  // Initialize propertyTestFailures if it doesn't exist
  if (!state.propertyTestFailures) {
    state.propertyTestFailures = {};
  }

  // Store the failure keyed by task ID
  state.propertyTestFailures[failure.taskId] = failure;

  // Update task status to failed
  state.taskStatuses[failure.taskId] = "failed";

  return writeState(state, workspaceRoot);
}

/**
 * Get property test failure for a task
 * @param featureName - The feature name
 * @param taskId - The task ID
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The PropertyTestFailure object, or null if not found
 */
export function getPropertyTestFailure(
  featureName: string,
  taskId: string,
  workspaceRoot?: string
): PropertyTestFailure | null {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.propertyTestFailures) {
    return null;
  }

  return state.propertyTestFailures[taskId] || null;
}

/**
 * Clear property test failure for a task
 * @param featureName - The feature name
 * @param taskId - The task ID
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function clearPropertyTestFailure(
  featureName: string,
  taskId: string,
  workspaceRoot?: string
): boolean {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.propertyTestFailures) {
    return false;
  }

  delete state.propertyTestFailures[taskId];

  return writeState(state, workspaceRoot);
}

/**
 * Requirements validation tracking
 */

import { RequirementValidation } from "./types";

/**
 * Mark requirements as validated when a property test passes
 * @param featureName - The feature name
 * @param propertyNumber - The property number
 * @param requirementIds - Array of requirement IDs validated by this property
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function markRequirementsValidated(
  featureName: string,
  propertyNumber: number,
  requirementIds: string[],
  workspaceRoot?: string
): boolean {
  const state = getOrCreateState(featureName, workspaceRoot);

  // Initialize validatedRequirements if it doesn't exist
  if (!state.validatedRequirements) {
    state.validatedRequirements = {};
  }

  const timestamp = new Date().toISOString();

  // Mark each requirement as validated
  for (const requirementId of requirementIds) {
    state.validatedRequirements[requirementId] = {
      requirementId,
      propertyNumber,
      validated: true,
      timestamp,
    };
  }

  return writeState(state, workspaceRoot);
}

/**
 * Check if a requirement is validated
 * @param featureName - The feature name
 * @param requirementId - The requirement ID (e.g., "1.1", "2.3")
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if validated, false otherwise
 */
export function isRequirementValidated(
  featureName: string,
  requirementId: string,
  workspaceRoot?: string
): boolean {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.validatedRequirements) {
    return false;
  }

  const validation = state.validatedRequirements[requirementId];
  return validation?.validated ?? false;
}

/**
 * Get validation information for a requirement
 * @param featureName - The feature name
 * @param requirementId - The requirement ID
 * @param workspaceRoot - The workspace root path (optional)
 * @returns The RequirementValidation object, or null if not found
 */
export function getRequirementValidation(
  featureName: string,
  requirementId: string,
  workspaceRoot?: string
): RequirementValidation | null {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.validatedRequirements) {
    return null;
  }

  return state.validatedRequirements[requirementId] || null;
}

/**
 * Get all validated requirements for a spec
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns Array of validated requirement IDs
 */
export function getValidatedRequirements(
  featureName: string,
  workspaceRoot?: string
): string[] {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.validatedRequirements) {
    return [];
  }

  return Object.keys(state.validatedRequirements).filter(
    (reqId) => state.validatedRequirements![reqId].validated
  );
}

/**
 * Clear validation for a requirement
 * @param featureName - The feature name
 * @param requirementId - The requirement ID
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if successful, false otherwise
 */
export function clearRequirementValidation(
  featureName: string,
  requirementId: string,
  workspaceRoot?: string
): boolean {
  const state = readState(featureName, workspaceRoot);

  if (!state || !state.validatedRequirements) {
    return false;
  }

  delete state.validatedRequirements[requirementId];

  return writeState(state, workspaceRoot);
}
