/**
 * EARS (Easy Approach to Requirements Syntax) Pattern Validator
 * Validates requirements against the six EARS patterns
 */

import { EARSPattern } from "./types";

export interface EARSValidationResult {
  isValid: boolean;
  pattern?: EARSPattern;
  message?: string;
}

/**
 * Validates if a requirement follows one of the six EARS patterns
 */
export function validateEARSPattern(requirement: string): EARSValidationResult {
  const normalized = requirement.trim();

  // Check each pattern in order
  if (isUbiquitous(normalized)) {
    return { isValid: true, pattern: "ubiquitous" };
  }

  if (isEventDriven(normalized)) {
    return { isValid: true, pattern: "event-driven" };
  }

  if (isStateDriven(normalized)) {
    return { isValid: true, pattern: "state-driven" };
  }

  if (isUnwantedEvent(normalized)) {
    return { isValid: true, pattern: "unwanted-event" };
  }

  if (isOptional(normalized)) {
    return { isValid: true, pattern: "optional" };
  }

  if (isComplex(normalized)) {
    return { isValid: true, pattern: "complex" };
  }

  return {
    isValid: false,
    message:
      "Requirement does not follow any EARS pattern. Expected one of: Ubiquitous (THE <system> SHALL <response>), Event-driven (WHEN <trigger>, THE <system> SHALL <response>), State-driven (WHILE <condition>, THE <system> SHALL <response>), Unwanted event (IF <condition>, THEN THE <system> SHALL <response>), Optional (WHERE <option>, THE <system> SHALL <response>), or Complex ([WHERE] [WHILE] [WHEN/IF] THE <system> SHALL <response>)",
  };
}

/**
 * Ubiquitous: THE <system> SHALL <response>
 */
function isUbiquitous(requirement: string): boolean {
  const pattern = /^THE\s+\S+.*\s+SHALL\s+\S+/i;
  return (
    pattern.test(requirement) &&
    !requirement.toUpperCase().includes("WHEN ") &&
    !requirement.toUpperCase().includes("WHILE ") &&
    !requirement.toUpperCase().includes("WHERE ") &&
    !requirement.toUpperCase().includes("IF ")
  );
}

/**
 * Event-driven: WHEN <trigger>, THE <system> SHALL <response>
 */
function isEventDriven(requirement: string): boolean {
  const pattern = /^WHEN\s+.+,\s*THEN\s+THE\s+\S+.*\s+SHALL\s+\S+/i;
  if (pattern.test(requirement)) {
    return true;
  }

  // Also accept without THEN
  const patternWithoutThen = /^WHEN\s+.+,\s*THE\s+\S+.*\s+SHALL\s+\S+/i;
  return (
    patternWithoutThen.test(requirement) &&
    !requirement.toUpperCase().includes("WHERE ") &&
    !requirement.toUpperCase().includes("WHILE ")
  );
}

/**
 * State-driven: WHILE <condition>, THE <system> SHALL <response>
 */
function isStateDriven(requirement: string): boolean {
  const pattern = /^WHILE\s+.+,\s*THE\s+\S+.*\s+SHALL\s+\S+/i;
  return (
    pattern.test(requirement) &&
    !requirement.toUpperCase().includes("WHERE ") &&
    !requirement.toUpperCase().includes("WHEN ")
  );
}

/**
 * Unwanted event: IF <condition>, THEN THE <system> SHALL <response>
 */
function isUnwantedEvent(requirement: string): boolean {
  const pattern = /^IF\s+.+,\s*THEN\s+THE\s+\S+.*\s+SHALL\s+\S+/i;
  return (
    pattern.test(requirement) &&
    !requirement.toUpperCase().includes("WHERE ") &&
    !requirement.toUpperCase().includes("WHILE ")
  );
}

/**
 * Optional: WHERE <option>, THE <system> SHALL <response>
 */
function isOptional(requirement: string): boolean {
  const pattern = /^WHERE\s+.+,\s*THE\s+\S+.*\s+SHALL\s+\S+/i;
  return (
    pattern.test(requirement) &&
    !requirement.toUpperCase().includes("WHEN ") &&
    !requirement.toUpperCase().includes("WHILE ") &&
    !requirement.toUpperCase().includes("IF ")
  );
}

/**
 * Complex: [WHERE] [WHILE] [WHEN/IF] THE <system> SHALL <response>
 * Order must be: WHERE → WHILE → WHEN/IF → THE → SHALL
 */
function isComplex(requirement: string): boolean {
  const upper = requirement.toUpperCase();

  // Must have THE and SHALL
  if (!upper.includes("THE ") || !upper.includes(" SHALL ")) {
    return false;
  }

  // Must have at least two of: WHERE, WHILE, WHEN, IF
  const hasWhere = upper.includes("WHERE ");
  const hasWhile = upper.includes("WHILE ");
  const hasWhen = upper.includes("WHEN ");
  const hasIf = upper.includes("IF ");

  const count = [hasWhere, hasWhile, hasWhen, hasIf].filter(Boolean).length;
  if (count < 2) {
    return false;
  }

  // Check order: WHERE → WHILE → WHEN/IF → THE → SHALL
  const whereIdx = hasWhere ? upper.indexOf("WHERE ") : Infinity;
  const whileIdx = hasWhile ? upper.indexOf("WHILE ") : Infinity;
  const whenIdx = hasWhen ? upper.indexOf("WHEN ") : Infinity;
  const ifIdx = hasIf ? upper.indexOf("IF ") : Infinity;
  const theIdx = upper.indexOf("THE ");
  const shallIdx = upper.indexOf(" SHALL ");

  // WHERE must come before WHILE
  if (hasWhere && hasWhile && whereIdx > whileIdx) {
    return false;
  }

  // WHILE must come before WHEN/IF
  if (hasWhile && hasWhen && whileIdx > whenIdx) {
    return false;
  }
  if (hasWhile && hasIf && whileIdx > ifIdx) {
    return false;
  }

  // WHERE must come before WHEN/IF
  if (hasWhere && hasWhen && whereIdx > whenIdx) {
    return false;
  }
  if (hasWhere && hasIf && whereIdx > ifIdx) {
    return false;
  }

  // WHEN/IF must come before THE
  if (hasWhen && whenIdx > theIdx) {
    return false;
  }
  if (hasIf && ifIdx > theIdx) {
    return false;
  }

  // THE must come before SHALL
  if (theIdx > shallIdx) {
    return false;
  }

  return true;
}
