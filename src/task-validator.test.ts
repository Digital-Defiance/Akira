/**
 * Tests for Task Validator
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseSuccessCriteria,
  checkFilesExist,
  extractTaskContent,
  validateTaskCompletion,
} from "./task-validator";
import { ParsedTask } from "./autonomous-executor";

describe("Task Validator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-validator-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("parseSuccessCriteria", () => {
    it("should parse build command criteria", () => {
      const taskContent = "Initialize repository";
      const lines = [
        "- [ ] 1.1 Initialize repository module and TS project",
        "  - Create package.json, tsconfig.json",
        "  - Success criteria: repo builds (`npm run build`) and lint passes.",
      ];

      const criteria = parseSuccessCriteria(taskContent, lines);

      // The inline parser splits "builds and lint passes" into 2 criteria
      expect(criteria).toHaveLength(2);
      expect(criteria[0].type).toBe("command-runs");
      expect(criteria[0].validation).toBe("npm run build");
      expect(criteria[1].type).toBe("lint-passes");
    });

    it("should parse file existence criteria", () => {
      const taskContent = "Initialize repository";
      const lines = [
        "- [ ] 1.1 Initialize repository module and TS project",
        "  - Files: src/, src/index.ts, src/types.ts",
        "  - Success criteria: files exist",
      ];

      const criteria = parseSuccessCriteria(taskContent, lines);

      expect(criteria.some((c) => c.type === "file-exists")).toBe(true);
    });

    it("should parse lint criteria", () => {
      const taskContent = "Setup linting";
      const lines = [
        "- [ ] 1.1 Setup linting",
        "  - Success criteria: lint passes",
      ];

      const criteria = parseSuccessCriteria(taskContent, lines);

      expect(criteria).toHaveLength(1);
      expect(criteria[0].type).toBe("lint-passes");
      expect(criteria[0].validation).toBe("npm run lint");
    });

    it("should handle multiple criteria", () => {
      const taskContent = "Complete setup";
      const lines = [
        "- [ ] 1.1 Complete setup",
        "  - Success criteria:",
        "  - repo builds (`npm run build`)",
        "  - lint passes",
        "  - Files: package.json, tsconfig.json exist",
      ];

      const criteria = parseSuccessCriteria(taskContent, lines);

      expect(criteria.length).toBeGreaterThan(0);
    });
  });

  describe("checkFilesExist", () => {
    it("should detect existing files", () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      const result = checkFilesExist(["test.txt"], tempDir);

      expect(result.exists).toBe(true);
      expect(result.found).toContain("test.txt");
      expect(result.missing).toHaveLength(0);
    });

    it("should detect missing files", () => {
      const result = checkFilesExist(["nonexistent.txt"], tempDir);

      expect(result.exists).toBe(false);
      expect(result.found).toHaveLength(0);
      expect(result.missing).toContain("nonexistent.txt");
    });

    it("should handle mix of existing and missing files", () => {
      const testFile = path.join(tempDir, "exists.txt");
      fs.writeFileSync(testFile, "content");

      const result = checkFilesExist(["exists.txt", "missing.txt"], tempDir);

      expect(result.exists).toBe(false);
      expect(result.found).toContain("exists.txt");
      expect(result.missing).toContain("missing.txt");
    });
  });

  describe("extractTaskContent", () => {
    it("should extract task line and sub-bullets", () => {
      const tasksFile = path.join(tempDir, "tasks.md");
      const content = `# Tasks

- [ ] 1.1 Initialize repository module
  - Create package.json, tsconfig.json
  - Files: src/, src/index.ts
  - Success criteria: repo builds

- [ ] 1.2 Next task
`;
      fs.writeFileSync(tasksFile, content);

      const result = extractTaskContent("1.1", tasksFile);

      expect(result.taskLine).toContain("1.1 Initialize repository");
      expect(result.subLines.length).toBeGreaterThan(0);
      expect(result.subLines.some((l) => l.includes("package.json"))).toBe(
        true
      );
    });

    it("should stop at next task", () => {
      const tasksFile = path.join(tempDir, "tasks.md");
      const content = `# Tasks

- [ ] 1.1 First task
  - Sub-bullet 1
  - Sub-bullet 2
- [ ] 1.2 Second task
  - Should not be included
`;
      fs.writeFileSync(tasksFile, content);

      const result = extractTaskContent("1.1", tasksFile);

      expect(result.subLines.some((l) => l.includes("Sub-bullet 1"))).toBe(
        true
      );
      expect(
        result.subLines.some((l) => l.includes("Should not be included"))
      ).toBe(false);
    });
  });

  describe("validateTaskCompletion", () => {
    it("should detect task is complete when files exist", async () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
      fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{}");

      const tasksFile = path.join(tempDir, "tasks.md");
      const content = `# Tasks

- [ ] 1.1 Initialize repository
  - Files: package.json, tsconfig.json
  - Success criteria: files exist
`;
      fs.writeFileSync(tasksFile, content);

      const task: ParsedTask = {
        id: "1.1",
        description: "Initialize repository",
        optional: false,
        status: "not-started",
        level: 0,
        line: 2,
      };

      const result = await validateTaskCompletion(task, tempDir, tasksFile);

      expect(result.alreadyComplete).toBe(true);
      expect(result.detectedConditions.length).toBeGreaterThan(0);
      expect(result.missingConditions).toHaveLength(0);
    });

    it("should detect task is incomplete when files missing", async () => {
      const tasksFile = path.join(tempDir, "tasks.md");
      const content = `# Tasks

- [ ] 1.1 Initialize repository
  - Create package.json, tsconfig.json
  - Success criteria: package.json and tsconfig.json files exist
`;
      fs.writeFileSync(tasksFile, content);

      const task: ParsedTask = {
        id: "1.1",
        description: "Initialize repository",
        optional: false,
        status: "not-started",
        level: 0,
        line: 2,
      };

      const result = await validateTaskCompletion(task, tempDir, tasksFile);

      expect(result.alreadyComplete).toBe(false);
      expect(result.missingConditions.length).toBeGreaterThan(0);
    });

    it("should return false when no success criteria defined", async () => {
      const tasksFile = path.join(tempDir, "tasks.md");
      const content = `# Tasks

- [ ] 1.1 Do something
  - Some description
`;
      fs.writeFileSync(tasksFile, content);

      const task: ParsedTask = {
        id: "1.1",
        description: "Do something",
        optional: false,
        status: "not-started",
        level: 0,
        line: 2,
      };

      const result = await validateTaskCompletion(task, tempDir, tasksFile);

      expect(result.alreadyComplete).toBe(false);
      expect(result.reason).toContain("No success criteria");
    });
  });
});
