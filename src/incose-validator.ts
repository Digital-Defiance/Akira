/**
 * INCOSE Semantic Quality Rules Validator
 * Validates requirements against INCOSE quality standards
 */

export interface INCOSEViolation {
  rule: string;
  message: string;
  suggestion: string;
}

export interface INCOSEValidationResult {
  isValid: boolean;
  violations: INCOSEViolation[];
}

/**
 * Validates a requirement against all INCOSE quality rules
 */
export function validateINCOSE(requirement: string): INCOSEValidationResult {
  const violations: INCOSEViolation[] = [];

  violations.push(...checkActiveVoice(requirement));
  violations.push(...checkVagueTerms(requirement));
  violations.push(...checkEscapeClauses(requirement));
  violations.push(...checkNegativeStatements(requirement));
  violations.push(...checkPronouns(requirement));
  violations.push(...checkAbsolutes(requirement));

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Check for active voice (who does what)
 */
function checkActiveVoice(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];

  // Check if requirement has a clear subject (THE <system>)
  if (!/THE\s+\S+/i.test(requirement)) {
    violations.push({
      rule: "Active Voice",
      message:
        "Requirement should specify who (which system) performs the action",
      suggestion: 'Use "THE <system> SHALL" to clearly identify the actor',
    });
  }

  return violations;
}

/**
 * Check for vague terms
 */
function checkVagueTerms(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];
  const vagueTerms = [
    "quickly",
    "slowly",
    "fast",
    "adequate",
    "sufficient",
    "appropriate",
    "reasonable",
    "efficient",
    "effective",
    "user-friendly",
    "easy",
    "simple",
    "robust",
    "flexible",
    "scalable",
    "maintainable",
    "as much as possible",
    "as appropriate",
    "timely",
    "properly",
    "correctly",
  ];

  const lower = requirement.toLowerCase();
  for (const term of vagueTerms) {
    if (lower.includes(term)) {
      violations.push({
        rule: "No Vague Terms",
        message: `Vague term "${term}" found`,
        suggestion: `Replace "${term}" with specific, measurable criteria (e.g., "within 2 seconds", "with 95% accuracy")`,
      });
    }
  }

  return violations;
}

/**
 * Check for escape clauses
 */
function checkEscapeClauses(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];
  const escapeClauses = [
    "where possible",
    "if possible",
    "as far as possible",
    "to the extent possible",
    "if feasible",
    "where feasible",
    "if practical",
    "where practical",
    "as much as practical",
    "if applicable",
    "where applicable",
  ];

  const lower = requirement.toLowerCase();
  for (const clause of escapeClauses) {
    if (lower.includes(clause)) {
      violations.push({
        rule: "No Escape Clauses",
        message: `Escape clause "${clause}" found`,
        suggestion: `Remove "${clause}" and make the requirement definitive, or use WHERE clause for optional features`,
      });
    }
  }

  return violations;
}

/**
 * Check for negative statements
 */
function checkNegativeStatements(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];

  // Check for SHALL NOT, MUST NOT, etc.
  if (/SHALL\s+NOT|MUST\s+NOT|WILL\s+NOT/i.test(requirement)) {
    violations.push({
      rule: "No Negative Statements",
      message: "Requirement uses negative statement (SHALL NOT)",
      suggestion:
        "Rephrase in positive terms stating what the system SHALL do instead",
    });
  }

  return violations;
}

/**
 * Check for pronouns
 */
function checkPronouns(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];
  const pronouns = [
    "it",
    "they",
    "them",
    "their",
    "its",
    "this",
    "that",
    "these",
    "those",
  ];

  // Split into words and check
  const words = requirement.toLowerCase().split(/\s+/);
  for (const pronoun of pronouns) {
    if (words.includes(pronoun)) {
      violations.push({
        rule: "No Pronouns",
        message: `Pronoun "${pronoun}" found`,
        suggestion: `Replace "${pronoun}" with the specific system or component name`,
      });
    }
  }

  return violations;
}

/**
 * Check for absolutes
 */
function checkAbsolutes(requirement: string): INCOSEViolation[] {
  const violations: INCOSEViolation[] = [];
  const absolutes = [
    "never",
    "always",
    "all",
    "every",
    "none",
    "100%",
    "zero",
    "perfect",
    "completely",
    "totally",
    "absolutely",
  ];

  const lower = requirement.toLowerCase();
  const words = lower.split(/\s+/);

  for (const absolute of absolutes) {
    if (words.includes(absolute) || lower.includes(absolute)) {
      violations.push({
        rule: "No Absolutes",
        message: `Absolute term "${absolute}" found`,
        suggestion: `Replace "${absolute}" with realistic, measurable criteria (e.g., "99.9% of the time", "within specified tolerances")`,
      });
    }
  }

  return violations;
}
