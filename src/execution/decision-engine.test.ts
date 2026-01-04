/**
 * Tests for Decision Engine
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DecisionEngine } from "./decision-engine";
import { TaskRecord, SuccessCriteria } from "./types";

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
});
