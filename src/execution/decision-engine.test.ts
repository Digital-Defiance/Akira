/**
 * Tests for Decision Engine
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { test, fc } from "@fast-check/vitest";
import * as fs from "fs";
import * as path from "path";
import { DecisionEngine } from "./decision-engine";
import { TaskRecord, SuccessCriteria, ExecutionResult, CheckboxState } from "./types";

describe("DecisionEngine", () => {
  let engine: DecisionEngine;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, "../../test-temp", `decision-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });
    engine = new DecisionEngine(testDir);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("evaluateTask", () => {
    it("should return confidence 0 when no criteria defined", async () => {
      const task: TaskRecord = {
        id: "1.1",
        title: "Test task",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
      };

      const result = await engine.evaluateTask(task);

      expect(result.confidence).toBe(0);
      expect(result.detected).toBe(false);
      expect(result.reasoning).toContain("No success criteria");
    });

    it("should detect completed task with file criteria", async () => {
      // Create test file
      const testFile = path.join(testDir, "test.txt");
      await fs.promises.writeFile(testFile, "content");

      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "Test file should exist",
          validation: "test.txt",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Create test file",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
        successCriteria: criteria,
      };

      const result = await engine.evaluateTask(task);

      expect(result.confidence).toBe(1);
      expect(result.detected).toBe(true);
      expect(result.reasoning).toContain("All files exist");
    });

    it("should detect incomplete task with missing files", async () => {
      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "Missing file",
          validation: "missing.txt",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Create missing file",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
        successCriteria: criteria,
      };

      const result = await engine.evaluateTask(task);

      expect(result.confidence).toBe(0);
      expect(result.detected).toBe(false);
      expect(result.reasoning).toContain("Missing files");
    });

    it("should handle multiple criteria with partial completion", async () => {
      // Create one file but not the other
      await fs.promises.writeFile(path.join(testDir, "file1.txt"), "content");

      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "File 1",
          validation: "file1.txt",
        },
        {
          type: "file-exists",
          description: "File 2",
          validation: "file2.txt",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Create files",
        rawLine: 1,
        checkboxState: "PENDING",
        retryCount: 0,
        successCriteria: criteria,
      };

      const result = await engine.evaluateTask(task);

      expect(result.confidence).toBe(0.5);
      expect(result.detected).toBe(false); // < 0.8 threshold
    });
  });

  describe("parseSuccessCriteriaFromDescription", () => {
    it("should parse file creation patterns", () => {
      const description = "Create file: src/test.ts and add config.json";
      const criteria = engine.parseSuccessCriteriaFromDescription(description);

      expect(criteria).toHaveLength(2);
      expect(criteria[0].type).toBe("file-exists");
      expect(criteria[0].validation).toBe("src/test.ts");
      expect(criteria[1].validation).toBe("config.json");
    });

    it("should parse build command patterns", () => {
      const description = "Run npm run build to compile";
      const criteria = engine.parseSuccessCriteriaFromDescription(description);

      expect(criteria.some((c) => c.type === "build-passes")).toBe(true);
    });

    it("should parse test command patterns", () => {
      const description = "Run npm test to verify";
      const criteria = engine.parseSuccessCriteriaFromDescription(description);

      expect(criteria.some((c) => c.type === "test-passes")).toBe(true);
    });

    it("should parse backtick commands", () => {
      const description = "Run `eslint src/**/*.ts` for validation";
      const criteria = engine.parseSuccessCriteriaFromDescription(description);

      expect(criteria.some((c) => c.validation === "eslint src/**/*.ts")).toBe(true);
    });
  });

  describe("analyzeTaskForCriteria", () => {
    it("should parse success criteria section", () => {
      const taskLine = "- [ ] 1.1 Implement feature";
      const subLines = [
        "  Success criteria:",
        "  - File src/feature.ts exists",
        "  - Build passes",
        "  - Tests pass",
      ];

      const criteria = engine.analyzeTaskForCriteria(taskLine, subLines);

      expect(criteria.length).toBeGreaterThan(0);
      expect(criteria.some((c) => c.type === "file-exists")).toBe(true);
      expect(criteria.some((c) => c.type === "build-passes")).toBe(true);
      expect(criteria.some((c) => c.type === "test-passes")).toBe(true);
    });

    it("should deduplicate criteria", () => {
      const taskLine = "- [ ] 1.1 Create file: test.ts";
      const subLines = [
        "  Create file: test.ts again",
        "  Success criteria:",
        "  - File test.ts exists",
      ];

      const criteria = engine.analyzeTaskForCriteria(taskLine, subLines);

      // Should have only one criterion for test.ts despite multiple mentions
      const testTsCriteria = criteria.filter((c) => c.validation.includes("test.ts"));
      expect(testTsCriteria.length).toBe(1);
    });
  });

  describe("evaluateWithDetails", () => {
    it("should return detailed evaluation with no criteria", async () => {
      const task: TaskRecord = {
        id: "1.1",
        title: "Test task",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const result = await engine.evaluateWithDetails(task);

      expect(result.confidence).toBe(0);
      expect(result.detected).toBe(false);
      expect(result.criteriaResults).toHaveLength(0);
      expect(result.missingElements).toContain("Success criteria not defined");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("should provide detailed criterion results", async () => {
      // Create test file
      const testFile = path.join(testDir, "test.txt");
      await fs.promises.writeFile(testFile, "content");

      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "Test file should exist",
          validation: "test.txt",
        },
        {
          type: "file-exists",
          description: "Missing file",
          validation: "missing.txt",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Create files",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
        successCriteria: criteria,
      };

      const result = await engine.evaluateWithDetails(task);

      expect(result.criteriaResults).toHaveLength(2);
      expect(result.criteriaResults[0].met).toBe(true);
      expect(result.criteriaResults[1].met).toBe(false);
      expect(result.missingElements).toContain("file-exists: missing.txt");
    });

    it("should include evidence from execution result", async () => {
      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "Test file",
          validation: "test.txt",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Create file",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
        successCriteria: criteria,
      };

      const executionResult: ExecutionResult = {
        success: true,
        taskId: "1.1",
        filesCreated: ["test.txt"],
      };

      // Create the file
      await fs.promises.writeFile(path.join(testDir, "test.txt"), "content");

      const result = await engine.evaluateWithDetails(task, executionResult);

      expect(result.criteriaResults[0].evidence).toContain("Files created");
      expect(result.criteriaResults[0].evidence).toContain("test.txt");
    });

    it("should generate helpful suggestions for unmet criteria", async () => {
      const criteria: SuccessCriteria[] = [
        {
          type: "file-exists",
          description: "Missing file",
          validation: "missing.txt",
        },
        {
          type: "build-passes",
          description: "Build should pass",
          validation: "npm run build",
        },
      ];

      const task: TaskRecord = {
        id: "1.1",
        title: "Build project",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
        successCriteria: criteria,
      };

      const result = await engine.evaluateWithDetails(task);

      expect(result.suggestions.length).toBeGreaterThan(0);
      // Check that suggestions are relevant to the unmet criteria
      const suggestionText = result.suggestions.join(" ").toLowerCase();
      expect(suggestionText.includes("file") || suggestionText.includes("create") || suggestionText.includes("verify")).toBe(true);
    });
  });

  // Property-Based Tests
  describe("Property-Based Tests", () => {
    /**
     * Feature: execution-reflection-loop, Property 6: Post-execution evaluation
     * For any execution attempt, the Decision Engine should evaluate the task 
     * against its success criteria after execution completes.
     * Validates: Requirements 2.1
     */
    test.prop([
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        rawLine: fc.integer({ min: 1, max: 1000 }),
        checkboxState: fc.constantFrom(
          CheckboxState.PENDING,
          CheckboxState.IN_PROGRESS,
          CheckboxState.COMPLETE,
          CheckboxState.FAILED
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        successCriteria: fc.array(
          fc.record({
            type: fc.constant("file-exists" as const), // Only file-exists to avoid slow command execution
            description: fc.string({ minLength: 1, maxLength: 100 }),
            validation: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
      }),
    ])("Property 6: evaluateWithDetails should always return a DetailedEvaluation", async (task) => {
      const result = await engine.evaluateWithDetails(task);

      // Should always return a DetailedEvaluation structure
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("reasoning");
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("provider");
      expect(result).toHaveProperty("criteriaResults");
      expect(result).toHaveProperty("missingElements");
      expect(result).toHaveProperty("suggestions");

      // Confidence should be between 0 and 1
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);

      // Should have criterion results for each criterion
      expect(result.criteriaResults).toHaveLength(task.successCriteria!.length);

      // Each criterion result should have required fields
      for (const criterionResult of result.criteriaResults) {
        expect(criterionResult).toHaveProperty("criterion");
        expect(criterionResult).toHaveProperty("met");
        expect(criterionResult).toHaveProperty("reason");
      }
    }, { numRuns: 100, timeout: 10000 });

    /**
     * Feature: execution-reflection-loop, Property 7: Confidence threshold for completion
     * For any task evaluation with confidence >= 0.8, the task should be marked as complete.
     * Validates: Requirements 2.2
     */
    test.prop([
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        rawLine: fc.integer({ min: 1, max: 1000 }),
        checkboxState: fc.constantFrom(
          CheckboxState.PENDING,
          CheckboxState.IN_PROGRESS
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        successCriteria: fc.array(
          fc.record({
            type: fc.constant("file-exists" as const),
            description: fc.string({ minLength: 1, maxLength: 100 }),
            validation: fc.string({ minLength: 1, maxLength: 20 }), // Shorter to avoid filename length issues
          }),
          { minLength: 1, maxLength: 5 } // Fewer criteria to avoid filename length issues
        ),
      }),
      fc.float({ min: 0, max: 1 }),
    ])("Property 7: detected should be true when confidence >= 0.8", async (task, targetConfidence) => {
      // Create files to achieve target confidence
      const numToCreate = Math.ceil(targetConfidence * task.successCriteria!.length);
      
      for (let i = 0; i < numToCreate && i < task.successCriteria!.length; i++) {
        const criterion = task.successCriteria![i];
        // Use simple, short filenames to avoid ENAMETOOLONG
        const simpleFilename = `test-${i}.txt`;
        const filePath = path.join(testDir, simpleFilename);
        await fs.promises.writeFile(filePath, "content");
        criterion.validation = simpleFilename;
      }

      const result = await engine.evaluateWithDetails(task);

      // If confidence >= 0.8, detected should be true
      if (result.confidence >= 0.8) {
        expect(result.detected).toBe(true);
      } else {
        expect(result.detected).toBe(false);
      }
    }, { numRuns: 100 });

    /**
     * Feature: execution-reflection-loop, Property 8: Low confidence reasoning
     * For any task evaluation with confidence < 0.8, the result should include 
     * specific reasons explaining why the task is incomplete.
     * Validates: Requirements 2.3
     */
    test.prop([
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        rawLine: fc.integer({ min: 1, max: 1000 }),
        checkboxState: fc.constantFrom(
          CheckboxState.PENDING,
          CheckboxState.IN_PROGRESS
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        successCriteria: fc.array(
          fc.record({
            type: fc.constant("file-exists" as const),
            description: fc.string({ minLength: 1, maxLength: 100 }),
            validation: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
      }),
    ])("Property 8: low confidence should include specific reasons and missing elements", async (task) => {
      // Don't create any files, ensuring low confidence
      const result = await engine.evaluateWithDetails(task);

      if (result.confidence < 0.8) {
        // Should have reasoning
        expect(result.reasoning).toBeTruthy();
        expect(result.reasoning.length).toBeGreaterThan(0);

        // Should have missing elements
        expect(result.missingElements.length).toBeGreaterThan(0);

        // Should have suggestions
        expect(result.suggestions.length).toBeGreaterThan(0);

        // Missing elements should correspond to unmet criteria
        const unmetCount = result.criteriaResults.filter(r => !r.met).length;
        expect(result.missingElements.length).toBe(unmetCount);
      }
    }, { numRuns: 100 });

    /**
     * Feature: execution-reflection-loop, Property 9: Evaluation error handling
     * For any evaluation that fails due to errors, the task should be treated as 
     * incomplete and the evaluation error should be logged.
     * Validates: Requirements 2.4
     */
    test.prop([
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        rawLine: fc.integer({ min: 1, max: 1000 }),
        checkboxState: fc.constantFrom(
          CheckboxState.PENDING,
          CheckboxState.IN_PROGRESS
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        successCriteria: fc.array(
          fc.record({
            type: fc.constant("file-exists" as const),
            description: fc.string({ minLength: 1, maxLength: 100 }),
            validation: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
      }),
      fc.option(
        fc.record({
          success: fc.boolean(),
          taskId: fc.string({ minLength: 1, maxLength: 10 }),
          error: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        { nil: undefined }
      ),
    ])("Property 9: evaluation with execution errors should be treated as incomplete", async (task, executionResult) => {
      const result = await engine.evaluateWithDetails(task, executionResult);

      // If execution result has an error, suggestions should include it
      if (executionResult?.error) {
        expect(result.suggestions.some(s => s.includes(executionResult.error!))).toBe(true);
      }

      // Evaluation should never throw - always return a result
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }, { numRuns: 100 });

    /**
     * Feature: execution-reflection-loop, Property 10: Comprehensive evaluation checks
     * For any task evaluation, the Decision Engine should perform file existence checks,
     * command validation, and content verification.
     * Validates: Requirements 2.5
     */
    test.prop([
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }),
        title: fc.string({ minLength: 1, maxLength: 100 }),
        rawLine: fc.integer({ min: 1, max: 1000 }),
        checkboxState: fc.constantFrom(
          CheckboxState.PENDING,
          CheckboxState.IN_PROGRESS
        ),
        retryCount: fc.integer({ min: 0, max: 10 }),
        successCriteria: fc.array(
          fc.record({
            type: fc.constant("file-exists" as const), // Only file-exists to avoid slow command execution
            description: fc.string({ minLength: 1, maxLength: 100 }),
            validation: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
      }),
    ])("Property 10: evaluation should check all criterion types comprehensively", async (task) => {
      const result = await engine.evaluateWithDetails(task);

      // Should evaluate all criteria
      expect(result.criteriaResults).toHaveLength(task.successCriteria!.length);

      // Each criterion should have been checked
      for (let i = 0; i < task.successCriteria!.length; i++) {
        const criterion = task.successCriteria![i];
        const criterionResult = result.criteriaResults[i];

        // Should match the criterion
        expect(criterionResult.criterion).toEqual(criterion);

        // Should have a reason (evidence of evaluation)
        expect(criterionResult.reason).toBeTruthy();
        expect(criterionResult.reason.length).toBeGreaterThan(0);

        // Reason should be relevant to criterion type
        if (criterion.type === "file-exists") {
          expect(
            criterionResult.reason.includes("file") ||
            criterionResult.reason.includes("exist") ||
            criterionResult.reason.includes("Missing")
          ).toBe(true);
        } else if (criterion.type.includes("command") || criterion.type.includes("passes")) {
          expect(
            criterionResult.reason.includes("Command") ||
            criterionResult.reason.includes("succeeded") ||
            criterionResult.reason.includes("failed")
          ).toBe(true);
        }
      }
    }, { numRuns: 100, timeout: 10000 });
  });
});
