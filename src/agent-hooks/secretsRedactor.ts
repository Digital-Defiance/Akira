/**
 * Secrets Redactor
 * Redacts sensitive information from logs and prompts
 * 
 * Requirements:
 * - REQ-4.2: Redact configured secret patterns with "[REDACTED]"
 * - Validate regex patterns at config load time
 */

/**
 * Redact sensitive information from text using regex patterns
 * @param text Text to redact
 * @param patterns Array of regex patterns to match secrets
 * @returns Redacted text with matches replaced by [REDACTED]
 */
export function redact(text: string, patterns: RegExp[]): string {
  if (!text || patterns.length === 0) {
    return text;
  }

  let redacted = text;

  for (const pattern of patterns) {
    try {
      // Create a new regex with global flag to ensure all matches are replaced
      const globalPattern = pattern.global 
        ? pattern 
        : new RegExp(pattern.source, pattern.flags + "g");
      redacted = redacted.replace(globalPattern, "[REDACTED]");
    } catch (error) {
      // Invalid regex - skip this pattern (should not happen if validated at load)
      console.error(`Invalid regex pattern during redaction: ${pattern}`, error);
    }
  }

  return redacted;
}

/**
 * Validate regex patterns at load time
 * Returns valid RegExp objects and any validation errors
 * @param patterns Array of regex pattern strings
 * @returns Object with valid RegExp array and errors array
 */
export function validatePatterns(
  patterns: string[]
): { valid: RegExp[]; errors: string[] } {
  const valid: RegExp[] = [];
  const errors: string[] = [];

  for (const pattern of patterns) {
    try {
      // Test that the pattern compiles
      const regex = new RegExp(pattern, "g");
      
      // Test that it doesn't match everything (common mistake)
      if (pattern === ".*" || pattern === ".+" || pattern === "") {
        errors.push(`Pattern "${pattern}" is too broad and would redact everything`);
        continue;
      }
      
      valid.push(regex);
    } catch (error) {
      errors.push(
        `Invalid regex pattern "${pattern}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { valid, errors };
}

/**
 * Create a redactor function with pre-compiled patterns
 * More efficient for repeated redaction with same patterns
 */
export function createRedactor(patternStrings: string[]): {
  redact: (text: string) => string;
  patterns: RegExp[];
  errors: string[];
} {
  const { valid, errors } = validatePatterns(patternStrings);
  
  return {
    redact: (text: string) => redact(text, valid),
    patterns: valid,
    errors,
  };
}

/**
 * Default secret patterns for common sensitive data
 */
export const DEFAULT_SECRET_PATTERNS = [
  // API keys and tokens
  /\b[A-Za-z0-9_-]{32,}\b/g,
  // AWS keys
  /AKIA[0-9A-Z]{16}/g,
  // GitHub tokens
  /ghp_[A-Za-z0-9]{36}/g,
  // Generic tokens
  /\b(token|key|secret|password|passwd|pwd)[\s:=]+[^\s]+/gi,
  // Email addresses (optional - might be too aggressive)
  // /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
];
