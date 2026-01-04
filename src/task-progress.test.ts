/**
 * Tests for task progress calculation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import fc from "fast-check";
import { calculateTaskProgress } from "./task-progress";
import { writeState, createInitialState } from "./state-manager";
import { TaskStatus } from "./types";

describe("Task Progress Calculation", () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a tasks.md file with specified tasks
   */
  function createTasksFile(
    featureName: string,
    tasks: Array<{
      id: string;
      description: string;
      optional: boolean;
      checkbox: " " | "x" | "-";
    }>
  ): void {
    // Use the same path construction as getSpecDirectoryPath
    const kebabName = featureName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const specDir = path.join(testDir, ".kiro", "specs", kebabName);
    fs.mkdirSync(specDir, { recursive: true });

    const tasksPath = path.join(specDir, "tasks.md");
    const lines = ["# Implementation Plan", ""];

    for (const task of tasks) {
      const optionalMarker = task.optional ? "*" : "";
      lines.push(
        `- [${task.checkbox}]${optionalMarker} ${task.id}. ${task.description}`
      );
    }

    fs.writeFileSync(tasksPath, lines.join("\n"), "utf-8");
  }

  describe("Unit Tests", () => {
    it("should return zero progress for non-existent tasks file", () => {
      const progress = calculateTaskProgress("nonexistent", testDir);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.inProgress).toBe(0);
      expect(progress.optional).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it("should calculate progress for all completed tasks", () => {
      createTasksFile("test-feature", [
        { id: "1", description: "Task 1", optional: false, checkbox: "x" },
        { id: "2", description: "Task 2", optional: false, checkbox: "x" },
        { id: "3", description: "Task 3", optional: false, checkbox: "x" },
      ]);

      const progress = calculateTaskProgress("test-feature", testDir);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(3);
      expect(progress.percentage).toBe(100);
    });

    it("should exclude optional tasks from percentage calculation", () => {
      createTasksFile("test-feature", [
        { id: "1", description: "Task 1", optional: false, checkbox: "x" },
        { id: "2", description: "Task 2", optional: false, checkbox: " " },
        { id: "3", description: "Task 3", optional: true, checkbox: " " },
        { id: "4", description: "Task 4", optional: true, checkbox: "x" },
      ]);

      const progress = calculateTaskProgress("test-feature", testDir);

      expect(progress.total).toBe(2); // Only non-optional tasks
      expect(progress.completed).toBe(1); // Only completed non-optional
      expect(progress.optional).toBe(2); // Count of optional tasks
      expect(progress.percentage).toBe(50); // 1/2 = 50%
    });

    it("should count in-progress tasks", () => {
      createTasksFile("test-feature", [
        { id: "1", description: "Task 1", optional: false, checkbox: "x" },
        { id: "2", description: "Task 2", optional: false, checkbox: "-" },
        { id: "3", description: "Task 3", optional: false, checkbox: " " },
      ]);

      const progress = calculateTaskProgress("test-feature", testDir);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.percentage).toBe(33); // 1/3 ≈ 33%
    });

    it("should handle subtasks with decimal IDs", () => {
      createTasksFile("test-feature", [
        { id: "1", description: "Task 1", optional: false, checkbox: "x" },
        {
          id: "1.1",
          description: "Subtask 1.1",
          optional: false,
          checkbox: "x",
        },
        {
          id: "1.2",
          description: "Subtask 1.2",
          optional: false,
          checkbox: " ",
        },
        { id: "2", description: "Task 2", optional: false, checkbox: " " },
      ]);

      const progress = calculateTaskProgress("test-feature", testDir);

      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.percentage).toBe(50);
    });
  });

  describe("Property Tests", () => {
    // **Feature: copilot-spec-extension, Property 20: Task completion percentage calculation**
    it("Property 20: Task completion percentage calculation", () => {
      fc.assert(
        fc.property(
          // Generate random task lists
          fc.array(
            fc.record({
              id: fc.oneof(
                fc.nat({ max: 20 }).map((n) => String(n + 1)),
                fc
                  .tuple(fc.nat({ max: 20 }), fc.nat({ max: 10 }))
                  .map(([a, b]) => `${a + 1}.${b + 1}`)
              ),
              description: fc
                .string({ minLength: 1, maxLength: 50 })
                .filter((s) => s.trim().length > 0),
              optional: fc.boolean(),
              checkbox: fc.constantFrom(" ", "x", "-") as fc.Arbitrary<
                " " | "x" | "-"
              >,
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (tasks) => {
            // Create unique task IDs
            const uniqueTasks = Array.from(
              new Map(tasks.map((t) => [t.id, t])).values()
            );

            const featureName = `test-${Date.now()}-${Math.random()}`;
            createTasksFile(featureName, uniqueTasks);

            const progress = calculateTaskProgress(featureName, testDir);

            // Calculate expected values
            const requiredTasks = uniqueTasks.filter((t) => !t.optional);
            const completedRequired = requiredTasks.filter(
              (t) => t.checkbox === "x"
            ).length;
            const expectedTotal = requiredTasks.length;
            const expectedPercentage =
              expectedTotal > 0
                ? Math.round((completedRequired / expectedTotal) * 100)
                : 0;

            // Verify the property: percentage = (completed / total) * 100
            expect(progress.total).toBe(expectedTotal);
            expect(progress.completed).toBe(completedRequired);
            expect(progress.percentage).toBe(expectedPercentage);

            // Additional invariants
            expect(progress.percentage).toBeGreaterThanOrEqual(0);
            expect(progress.percentage).toBeLessThanOrEqual(100);
            expect(progress.completed).toBeLessThanOrEqual(progress.total);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
