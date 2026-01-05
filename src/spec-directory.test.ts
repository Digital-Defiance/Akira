/**
 * Property-based and unit tests for spec directory management
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  createSpecDirectory,
  specExists,
  listSpecs,
  toKebabCase,
  getSpecDirectoryPath,
} from "./spec-directory";

describe("Spec Directory Management - Property Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Property 1: Spec directory creation", () => {
    // **Feature: copilot-spec-extension, Property 1: Spec directory creation**
    // For any spec creation command with a feature name, executing the command
    // should result in a directory at `.akira/specs/{kebab-case-name}` containing
    // a `requirements.md` file.
    // **Validates: Requirements 1.1, 1.3, 1.5**

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
          // Filter to ensure the string produces a valid kebab-case name
          const trimmed = s.trim();
          if (trimmed.length === 0) return false;
          const kebab = toKebabCase(s);
          return kebab.length > 0;
        }),
        (featureName) => {
          const result = createSpecDirectory(featureName, tempDir);

          // Should succeed
          expect(result.success).toBe(true);

          // Directory should exist at expected path
          const kebabName = toKebabCase(featureName);
          const expectedPath = path.join(tempDir, ".akira/specs", kebabName);
          expect(fs.existsSync(expectedPath)).toBe(true);

          // requirements.md should exist
          const requirementsPath = path.join(expectedPath, "requirements.md");
          expect(fs.existsSync(requirementsPath)).toBe(true);

          // Verify it's a file, not a directory
          expect(fs.statSync(requirementsPath).isFile()).toBe(true);

          // Clean up for next iteration
          fs.rmSync(expectedPath, { recursive: true, force: true });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Spec Directory Management - Unit Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-unit-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("toKebabCase", () => {
    it("should convert simple strings to kebab-case", () => {
      expect(toKebabCase("User Authentication")).toBe("user-authentication");
      expect(toKebabCase("API Gateway")).toBe("api-gateway");
    });

    it("should handle special characters", () => {
      expect(toKebabCase("User@Auth#Feature")).toBe("user-auth-feature");
      expect(toKebabCase("Feature (v2)")).toBe("feature-v2");
    });

    it("should handle multiple spaces and dashes", () => {
      expect(toKebabCase("  Multiple   Spaces  ")).toBe("multiple-spaces");
      expect(toKebabCase("already-kebab-case")).toBe("already-kebab-case");
    });

    it("should handle empty and whitespace strings", () => {
      expect(toKebabCase("")).toBe("");
      expect(toKebabCase("   ")).toBe("");
      expect(toKebabCase("---")).toBe("");
    });
  });

  describe("createSpecDirectory", () => {
    it("should create directory with requirements.md", () => {
      const result = createSpecDirectory("test-feature", tempDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(result.directory)).toBe(true);
      expect(
        fs.existsSync(path.join(result.directory, "requirements.md"))
      ).toBe(true);
    });

    it("should fail if directory already exists", () => {
      createSpecDirectory("test-feature", tempDir);
      const result = createSpecDirectory("test-feature", tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("should handle various feature names", () => {
      const names = [
        "Simple Feature",
        "Feature-With-Dashes",
        "Feature_With_Underscores",
        "Feature123",
      ];

      for (const name of names) {
        const result = createSpecDirectory(name, tempDir);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("specExists", () => {
    it("should return true for existing specs", () => {
      createSpecDirectory("existing-spec", tempDir);
      expect(specExists("existing-spec", tempDir)).toBe(true);
    });

    it("should return false for non-existing specs", () => {
      expect(specExists("non-existing-spec", tempDir)).toBe(false);
    });
  });

  describe("listSpecs", () => {
    it("should return empty array when no specs exist", () => {
      const specs = listSpecs(tempDir);
      expect(specs).toEqual([]);
    });

    it("should list all specs in directory", () => {
      createSpecDirectory("spec-one", tempDir);
      createSpecDirectory("spec-two", tempDir);
      createSpecDirectory("spec-three", tempDir);

      const specs = listSpecs(tempDir);
      expect(specs.length).toBe(3);

      const featureNames = specs.map((s) => s.featureName);
      expect(featureNames).toContain("spec-one");
      expect(featureNames).toContain("spec-two");
      expect(featureNames).toContain("spec-three");
    });

    it("should correctly identify which files exist", () => {
      createSpecDirectory("test-spec", tempDir);
      const specDir = path.join(tempDir, ".akira/specs/test-spec");

      // Create design.md
      fs.writeFileSync(path.join(specDir, "design.md"), "# Design");

      const specs = listSpecs(tempDir);
      expect(specs.length).toBe(1);
      expect(specs[0].hasRequirements).toBe(true);
      expect(specs[0].hasDesign).toBe(true);
      expect(specs[0].hasTasks).toBe(false);
      expect(specs[0].hasState).toBe(false);
    });
  });
});
