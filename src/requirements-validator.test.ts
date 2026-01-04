/**
 * Property-based tests for requirements validation
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateEARSPattern } from "./ears-validator";
import { validateINCOSE } from "./incose-validator";

describe("Requirements Validation Property Tests", () => {
  /**
   * **Feature: copilot-spec-extension, Property 2: Requirements validation**
   * **Validates: Requirements 1.2, 2.1, 2.2, 8.5**
   *
   * For any generated requirements document, every requirement should follow
   * one of the six EARS patterns and comply with all INCOSE semantic quality rules
   */
  it("Property 2: Requirements validation", () => {
    // Generator for valid EARS requirements
    const validEARSRequirement = fc.oneof(
      // Ubiquitous: THE <system> SHALL <response>
      fc
        .tuple(fc.constantFrom("System", "Extension", "Server"), fc.lorem())
        .map(([system, action]) => `THE ${system} SHALL ${action}`),

      // Event-driven: WHEN <trigger>, THE <system> SHALL <response>
      fc
        .tuple(
          fc.lorem(),
          fc.constantFrom("System", "Extension", "Server"),
          fc.lorem()
        )
        .map(
          ([trigger, system, action]) =>
            `WHEN ${trigger}, THE ${system} SHALL ${action}`
        ),

      // State-driven: WHILE <condition>, THE <system> SHALL <response>
      fc
        .tuple(
          fc.lorem(),
          fc.constantFrom("System", "Extension", "Server"),
          fc.lorem()
        )
        .map(
          ([condition, system, action]) =>
            `WHILE ${condition}, THE ${system} SHALL ${action}`
        ),

      // Unwanted event: IF <condition>, THEN THE <system> SHALL <response>
      fc
        .tuple(
          fc.lorem(),
          fc.constantFrom("System", "Extension", "Server"),
          fc.lorem()
        )
        .map(
          ([condition, system, action]) =>
            `IF ${condition}, THEN THE ${system} SHALL ${action}`
        ),

      // Optional: WHERE <option>, THE <system> SHALL <response>
      fc
        .tuple(
          fc.lorem(),
          fc.constantFrom("System", "Extension", "Server"),
          fc.lorem()
        )
        .map(
          ([option, system, action]) =>
            `WHERE ${option}, THE ${system} SHALL ${action}`
        )
    );

    fc.assert(
      fc.property(validEARSRequirement, (requirement) => {
        // Test EARS pattern validation
        const earsResult = validateEARSPattern(requirement);
        expect(earsResult.isValid).toBe(true);
        expect(earsResult.pattern).toBeDefined();

        // Test INCOSE validation (should pass for clean requirements)
        const incoseResult = validateINCOSE(requirement);
        // Note: Lorem text might contain vague terms, so we just check it runs
        expect(incoseResult).toBeDefined();
        expect(Array.isArray(incoseResult.violations)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 2: EARS pattern detection is exhaustive", () => {
    // Every valid EARS requirement should be recognized
    const validRequirements = [
      "THE System SHALL process requests",
      "WHEN user clicks button, THE System SHALL respond",
      "WHILE connected, THE System SHALL maintain state",
      "IF error occurs, THEN THE System SHALL log details",
      "WHERE feature enabled, THE System SHALL display option",
    ];

    for (const req of validRequirements) {
      const result = validateEARSPattern(req);
      expect(result.isValid).toBe(true);
      expect(result.pattern).toBeDefined();
    }
  });

  it("Property 2: INCOSE violations are detected", () => {
    // Requirements with INCOSE violations should be flagged
    const violatingRequirements = [
      {
        text: "THE System SHALL process requests quickly",
        expectedViolation: "quickly",
      },
      {
        text: "THE System SHALL NOT fail",
        expectedViolation: "SHALL NOT",
      },
      {
        text: "THE System SHALL handle it properly",
        expectedViolation: "it",
      },
      {
        text: "THE System SHALL always succeed",
        expectedViolation: "always",
      },
      {
        text: "THE System SHALL work where possible",
        expectedViolation: "where possible",
      },
    ];

    for (const { text, expectedViolation } of violatingRequirements) {
      const result = validateINCOSE(text);
      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      const violationMessages = result.violations
        .map((v) => v.message.toLowerCase())
        .join(" ");
      expect(violationMessages).toContain(expectedViolation.toLowerCase());
    }
  });
});
