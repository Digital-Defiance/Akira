import { describe, it, expect } from "vitest";
import fc from "fast-check";

describe("Property-Based Testing Setup", () => {
  it("should verify fast-check is working", () => {
    // Simple property: reversing a string twice gives the original string
    fc.assert(
      fc.property(fc.string(), (str) => {
        const reversed = str.split("").reverse().join("");
        const doubleReversed = reversed.split("").reverse().join("");
        expect(doubleReversed).toBe(str);
      }),
      { numRuns: 100 }
    );
  });

  it("should verify fast-check can find counterexamples", () => {
    // This property is intentionally false to verify fast-check works
    // We expect this to NOT throw because we're testing the setup
    const result = fc.check(
      fc.property(fc.integer(), (n) => {
        return n >= 0; // This will fail for negative numbers
      }),
      { numRuns: 100 }
    );

    // Verify fast-check found a counterexample
    expect(result.failed).toBe(true);
    expect(result.counterexample).toBeDefined();
  });
});
