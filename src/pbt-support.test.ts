/**
 * Property-based and unit tests for PBT support
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  generatePropertyTestTag,
  extractPropertyNumber,
  parsePropertyTestTag,
  validatePropertyTestTag,
  createPropertyTestFailure,
  extractFailingExample,
  recordPropertyTestFailure,
  getPropertyTestFailure,
  clearPropertyTestFailure,
  markRequirementsValidated,
  isRequirementValidated,
  getRequirementValidation,
  getValidatedRequirements,
  clearRequirementValidation,
} from "./pbt-support";
import { createSpecDirectory } from "./spec-directory";

describe("PBT Support - Property Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbt-support-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Property 29: Property test tagging", () => {
    // **Feature: copilot-spec-extension, Property 29: Property test tagging**
    // For any feature name, property number, and property text,
    // the generated tag should be parseable and contain the correct information

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter(
            (s) =>
              s.trim().length > 0 &&
              !s.includes(",") &&
              !s.includes("*") &&
              !/[^\w\s-]/.test(s)
          ),
        fc.integer({ min: 1, max: 100 }),
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter(
            (s) =>
              s.trim().length > 0 &&
              !s.includes("**") &&
              !s.includes("*") &&
              !/[^\w\s-.,;:()']/.test(s)
          ),
        (featureName, propertyNumber, propertyText) => {
          // Generate the tag
          const tag = generatePropertyTestTag(
            featureName,
            propertyNumber,
            propertyText
          );

          // The tag should be valid
          expect(validatePropertyTestTag(tag)).toBe(true);

          // Parse the tag
          const parsed = parsePropertyTestTag(tag);
          expect(parsed).not.toBeNull();

          // The parsed information should match the input
          expect(parsed!.featureName).toBe(featureName.trim());
          expect(parsed!.propertyNumber).toBe(propertyNumber);
          expect(parsed!.propertyText).toBe(propertyText.trim());

          // The tag should follow the correct format
          expect(tag).toContain(`Feature: ${featureName}`);
          expect(tag).toContain(`Property ${propertyNumber}`);
          expect(tag).toContain(propertyText);
          expect(tag).toMatch(/^\/\/\s*\*\*Feature:.*\*\*$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 30: Failure example capture", () => {
    // **Feature: copilot-spec-extension, Property 30: Failure example capture**
    // For any property-based test that fails, the system should capture
    // the failing example provided by the PBT library

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^\d+\.\d+$/.test(s)),
        fc.integer({ min: 1, max: 100 }),
        fc.string({ minLength: 5, maxLength: 500 }),
        (taskId, propertyNumber, errorMessage) => {
          // Create a failure object
          const failure = createPropertyTestFailure(
            taskId,
            propertyNumber,
            errorMessage
          );

          // The failure should have all required fields
          expect(failure.taskId).toBe(taskId);
          expect(failure.propertyNumber).toBe(propertyNumber);
          expect(failure.errorMessage).toBe(errorMessage);
          expect(failure.failingExample).toBeTruthy();
          expect(failure.timestamp).toBeTruthy();

          // The timestamp should be a valid ISO string
          expect(() => new Date(failure.timestamp)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 31: Requirements validation on test success", () => {
    // **Feature: copilot-spec-extension, Property 31: Requirements validation on test success**
    // For any correctness property where all associated property-based tests pass,
    // the corresponding requirements should be marked as validated

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.trim().length > 0 && /^[a-z0-9-]+$/.test(s)),
        fc.integer({ min: 1, max: 50 }),
        fc
          .array(
            fc
              .string({ minLength: 1, maxLength: 10 })
              .filter((s) => /^\d+\.\d+$/.test(s)),
            { minLength: 1, maxLength: 5 }
          )
          .map((arr) => Array.from(new Set(arr))), // Remove duplicates
        (featureName, propertyNumber, requirementIds) => {
          // Create a unique temp directory for this iteration
          const iterationTempDir = fs.mkdtempSync(
            path.join(tempDir, `iter-${Date.now()}-`)
          );

          try {
            // Create spec directory
            createSpecDirectory(featureName, iterationTempDir);

            // Mark requirements as validated
            const success = markRequirementsValidated(
              featureName,
              propertyNumber,
              requirementIds,
              iterationTempDir
            );

            expect(success).toBe(true);

            // All requirements should be marked as validated
            for (const reqId of requirementIds) {
              expect(
                isRequirementValidated(featureName, reqId, iterationTempDir)
              ).toBe(true);

              // Get validation details
              const validation = getRequirementValidation(
                featureName,
                reqId,
                iterationTempDir
              );
              expect(validation).not.toBeNull();
              expect(validation!.requirementId).toBe(reqId);
              expect(validation!.propertyNumber).toBe(propertyNumber);
              expect(validation!.validated).toBe(true);
              expect(validation!.timestamp).toBeTruthy();
            }

            // Get all validated requirements
            const validated = getValidatedRequirements(
              featureName,
              iterationTempDir
            );
            expect(validated.length).toBe(requirementIds.length);
            for (const reqId of requirementIds) {
              expect(validated).toContain(reqId);
            }
          } finally {
            // Clean up iteration temp directory
            if (fs.existsSync(iterationTempDir)) {
              fs.rmSync(iterationTempDir, { recursive: true, force: true });
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("PBT Support - Unit Tests", () => {
  describe("generatePropertyTestTag", () => {
    it("should generate correctly formatted tag", () => {
      const tag = generatePropertyTestTag(
        "copilot-spec-extension",
        29,
        "Property test tagging"
      );
      expect(tag).toBe(
        "// **Feature: copilot-spec-extension, Property 29: Property test tagging**"
      );
    });

    it("should handle feature names with hyphens", () => {
      const tag = generatePropertyTestTag(
        "my-feature-name",
        1,
        "Some property"
      );
      expect(tag).toContain("my-feature-name");
    });

    it("should handle multi-word property text", () => {
      const tag = generatePropertyTestTag(
        "feature",
        5,
        "This is a longer property description"
      );
      expect(tag).toContain("This is a longer property description");
    });
  });

  describe("extractPropertyNumber", () => {
    it("should extract property number from valid reference", () => {
      expect(extractPropertyNumber("Property 1")).toBe(1);
      expect(extractPropertyNumber("Property 29")).toBe(29);
      expect(extractPropertyNumber("Property 100")).toBe(100);
    });

    it("should return null for invalid references", () => {
      expect(extractPropertyNumber("Property")).toBeNull();
      expect(extractPropertyNumber("Prop 1")).toBeNull();
      expect(extractPropertyNumber("Property X")).toBeNull();
      expect(extractPropertyNumber("")).toBeNull();
    });
  });

  describe("parsePropertyTestTag", () => {
    it("should parse valid tag", () => {
      const tag =
        "// **Feature: copilot-spec-extension, Property 29: Property test tagging**";
      const parsed = parsePropertyTestTag(tag);

      expect(parsed).not.toBeNull();
      expect(parsed!.featureName).toBe("copilot-spec-extension");
      expect(parsed!.propertyNumber).toBe(29);
      expect(parsed!.propertyText).toBe("Property test tagging");
    });

    it("should handle tags with extra whitespace", () => {
      const tag = "//  **Feature:  my-feature ,  Property  5 :  Some text **";
      const parsed = parsePropertyTestTag(tag);

      expect(parsed).not.toBeNull();
      expect(parsed!.featureName).toBe("my-feature");
      expect(parsed!.propertyNumber).toBe(5);
      expect(parsed!.propertyText).toBe("Some text");
    });

    it("should return null for invalid tags", () => {
      expect(parsePropertyTestTag("// Not a valid tag")).toBeNull();
      expect(parsePropertyTestTag("// **Feature: test**")).toBeNull();
      expect(parsePropertyTestTag("// **Property 1: test**")).toBeNull();
      expect(parsePropertyTestTag("")).toBeNull();
    });
  });

  describe("validatePropertyTestTag", () => {
    it("should validate correct tags", () => {
      const tag =
        "// **Feature: copilot-spec-extension, Property 29: Property test tagging**";
      expect(validatePropertyTestTag(tag)).toBe(true);
    });

    it("should reject invalid tags", () => {
      expect(validatePropertyTestTag("// Not a valid tag")).toBe(false);
      expect(validatePropertyTestTag("")).toBe(false);
      expect(validatePropertyTestTag("// **Feature: test**")).toBe(false);
    });
  });

  describe("extractFailingExample", () => {
    it("should extract counterexample from fast-check error", () => {
      const errorMessage =
        'Property failed after 5 tests\nCounterexample: ["test", 123]\nShrunk 3 times';
      const example = extractFailingExample(errorMessage);
      expect(example).toBe('["test", 123]');
    });

    it("should extract object counterexample", () => {
      const errorMessage =
        'Property failed\nCounterexample: {foo: "bar", num: 42}';
      const example = extractFailingExample(errorMessage);
      expect(example).toBe('{foo: "bar", num: 42}');
    });

    it("should extract simple value counterexample", () => {
      const errorMessage = "Property failed\nCounterexample: 42";
      const example = extractFailingExample(errorMessage);
      expect(example).toBe("42");
    });

    it("should return null for messages without counterexample", () => {
      const errorMessage = "Some other error message";
      const example = extractFailingExample(errorMessage);
      expect(example).toBeNull();
    });
  });

  describe("createPropertyTestFailure", () => {
    it("should create failure object with all fields", () => {
      const failure = createPropertyTestFailure(
        "15.2",
        29,
        'Property failed\nCounterexample: ["test"]'
      );

      expect(failure.taskId).toBe("15.2");
      expect(failure.propertyNumber).toBe(29);
      expect(failure.failingExample).toBe('["test"]');
      expect(failure.errorMessage).toContain("Property failed");
      expect(failure.timestamp).toBeTruthy();
    });

    it("should handle error without counterexample", () => {
      const failure = createPropertyTestFailure(
        "15.2",
        29,
        "Some error message"
      );

      expect(failure.failingExample).toBe("Unknown");
    });
  });

  describe("recordPropertyTestFailure and getPropertyTestFailure", () => {
    let testTempDir: string;

    beforeEach(() => {
      testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbt-failure-test-"));
    });

    afterEach(() => {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    });

    it("should record and retrieve property test failure", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      const failure = createPropertyTestFailure(
        "15.2",
        29,
        'Property failed\nCounterexample: ["test", 123]'
      );

      const success = recordPropertyTestFailure(
        featureName,
        failure,
        testTempDir
      );
      expect(success).toBe(true);

      const retrieved = getPropertyTestFailure(
        featureName,
        "15.2",
        testTempDir
      );
      expect(retrieved).not.toBeNull();
      expect(retrieved!.taskId).toBe("15.2");
      expect(retrieved!.propertyNumber).toBe(29);
      expect(retrieved!.failingExample).toBe('["test", 123]');
    });

    it("should return null for non-existent failure", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      const retrieved = getPropertyTestFailure(
        featureName,
        "99.9",
        testTempDir
      );
      expect(retrieved).toBeNull();
    });

    it("should clear property test failure", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      const failure = createPropertyTestFailure(
        "15.2",
        29,
        'Property failed\nCounterexample: ["test"]'
      );

      recordPropertyTestFailure(featureName, failure, testTempDir);

      const success = clearPropertyTestFailure(
        featureName,
        "15.2",
        testTempDir
      );
      expect(success).toBe(true);

      const retrieved = getPropertyTestFailure(
        featureName,
        "15.2",
        testTempDir
      );
      expect(retrieved).toBeNull();
    });
  });

  describe("markRequirementsValidated and related functions", () => {
    let testTempDir: string;

    beforeEach(() => {
      testTempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "pbt-validation-test-")
      );
    });

    afterEach(() => {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    });

    it("should mark requirements as validated", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      const success = markRequirementsValidated(
        featureName,
        5,
        ["1.1", "1.2", "2.1"],
        testTempDir
      );

      expect(success).toBe(true);
      expect(isRequirementValidated(featureName, "1.1", testTempDir)).toBe(
        true
      );
      expect(isRequirementValidated(featureName, "1.2", testTempDir)).toBe(
        true
      );
      expect(isRequirementValidated(featureName, "2.1", testTempDir)).toBe(
        true
      );
      expect(isRequirementValidated(featureName, "3.1", testTempDir)).toBe(
        false
      );
    });

    it("should get requirement validation details", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      markRequirementsValidated(featureName, 10, ["1.1"], testTempDir);

      const validation = getRequirementValidation(
        featureName,
        "1.1",
        testTempDir
      );

      expect(validation).not.toBeNull();
      expect(validation!.requirementId).toBe("1.1");
      expect(validation!.propertyNumber).toBe(10);
      expect(validation!.validated).toBe(true);
      expect(validation!.timestamp).toBeTruthy();
    });

    it("should get all validated requirements", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      markRequirementsValidated(featureName, 5, ["1.1", "1.2"], testTempDir);
      markRequirementsValidated(featureName, 6, ["2.1"], testTempDir);

      const validated = getValidatedRequirements(featureName, testTempDir);

      expect(validated).toHaveLength(3);
      expect(validated).toContain("1.1");
      expect(validated).toContain("1.2");
      expect(validated).toContain("2.1");
    });

    it("should clear requirement validation", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      markRequirementsValidated(featureName, 5, ["1.1"], testTempDir);

      expect(isRequirementValidated(featureName, "1.1", testTempDir)).toBe(
        true
      );

      const success = clearRequirementValidation(
        featureName,
        "1.1",
        testTempDir
      );
      expect(success).toBe(true);

      expect(isRequirementValidated(featureName, "1.1", testTempDir)).toBe(
        false
      );
    });

    it("should return empty array for spec with no validated requirements", () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, testTempDir);

      const validated = getValidatedRequirements(featureName, testTempDir);
      expect(validated).toHaveLength(0);
    });
  });
});
