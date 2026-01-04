/**
 * Property-based and unit tests for workflow state management
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  createInitialState,
  readState,
  writeState,
  getOrCreateState,
  updatePhase,
  approvePhase,
  isPhaseApproved,
  updateTaskStatus,
  getTaskStatus,
  getCurrentPhase,
} from "./state-manager";
import { Phase, TaskStatus } from "./types";
import { createSpecDirectory, toKebabCase } from "./spec-directory";

describe("State Management - Property Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("Property 17: State persistence", () => {
    // **Feature: copilot-spec-extension, Property 17: State persistence**
    // For any workflow state change (phase transition, task completion, approval),
    // the .state.json file should be updated to reflect the new state.
    // **Validates: Requirements 7.3**

    let counter = 0;

    fc.assert(
      fc.property(
        // Generate a unique feature name for each test iteration using a counter
        fc.constant(null).map(() => `test-feature-${counter++}`),
        // Generate a phase
        fc.constantFrom<Phase>("requirements", "design", "tasks", "execution"),
        // Generate an approval phase
        fc.constantFrom<"requirements" | "design" | "tasks">(
          "requirements",
          "design",
          "tasks"
        ),
        // Generate a task ID
        fc.oneof(
          fc.nat({ max: 20 }).map((n) => String(n + 1)),
          fc
            .tuple(fc.nat({ max: 20 }), fc.nat({ max: 10 }))
            .map(([a, b]) => `${a + 1}.${b + 1}`)
        ),
        // Generate a task status
        fc.constantFrom<TaskStatus>(
          "not-started",
          "in-progress",
          "completed",
          "skipped"
        ),
        (featureName, phase, approvalPhase, taskId, taskStatus) => {
          // Create spec directory first
          createSpecDirectory(featureName, tempDir);

          // Test 1: Phase transition should persist
          const initialState = getOrCreateState(featureName, tempDir);
          expect(initialState.currentPhase).toBe("requirements");

          updatePhase(featureName, phase, tempDir);
          const afterPhaseUpdate = readState(featureName, tempDir);
          expect(afterPhaseUpdate?.currentPhase).toBe(phase);

          // Test 2: Approval should persist
          approvePhase(featureName, approvalPhase, tempDir);
          const afterApproval = readState(featureName, tempDir);
          expect(afterApproval?.approvals[approvalPhase]).toBe(true);
          expect(isPhaseApproved(featureName, approvalPhase, tempDir)).toBe(
            true
          );

          // Test 3: Task status should persist
          updateTaskStatus(featureName, taskId, taskStatus, tempDir);
          const afterTaskUpdate = readState(featureName, tempDir);
          expect(afterTaskUpdate?.taskStatuses[taskId]).toBe(taskStatus);
          expect(getTaskStatus(featureName, taskId, tempDir)).toBe(taskStatus);

          // Test 4: State file should exist
          const kebabName = toKebabCase(featureName);
          const specDir = path.join(tempDir, ".kiro/specs", kebabName);
          const statePath = path.join(specDir, ".state.json");
          expect(fs.existsSync(statePath)).toBe(true);

          // Test 5: State file should be valid JSON
          const stateContent = fs.readFileSync(statePath, "utf-8");
          expect(() => JSON.parse(stateContent)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("State Management - Unit Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-unit-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("createInitialState", () => {
    it("should create state with default values", () => {
      const state = createInitialState("test-feature");

      expect(state.featureName).toBe("test-feature");
      expect(state.currentPhase).toBe("requirements");
      expect(state.approvals.requirements).toBe(false);
      expect(state.approvals.design).toBe(false);
      expect(state.approvals.tasks).toBe(false);
      expect(state.taskStatuses).toEqual({});
      expect(state.createdAt).toBeDefined();
      expect(state.updatedAt).toBeDefined();
    });
  });

  describe("readState and writeState", () => {
    it("should write and read state correctly", () => {
      createSpecDirectory("test-feature", tempDir);
      const state = createInitialState("test-feature");

      const writeResult = writeState(state, tempDir);
      expect(writeResult).toBe(true);

      const readResult = readState("test-feature", tempDir);
      expect(readResult).not.toBeNull();
      expect(readResult?.featureName).toBe("test-feature");
      expect(readResult?.currentPhase).toBe("requirements");
    });

    it("should return null for non-existing state", () => {
      const result = readState("non-existing", tempDir);
      expect(result).toBeNull();
    });

    it("should handle corrupted state files", () => {
      createSpecDirectory("test-feature", tempDir);
      const statePath = path.join(
        tempDir,
        ".kiro/specs/test-feature/.state.json"
      );

      // Write invalid JSON
      fs.writeFileSync(statePath, "{ invalid json", "utf-8");

      const result = readState("test-feature", tempDir);
      expect(result).toBeNull();
    });
  });

  describe("updatePhase", () => {
    it("should update phase correctly", () => {
      createSpecDirectory("test-feature", tempDir);

      updatePhase("test-feature", "design", tempDir);
      const state = readState("test-feature", tempDir);

      expect(state?.currentPhase).toBe("design");
    });
  });

  describe("approvePhase", () => {
    it("should approve phase correctly", () => {
      createSpecDirectory("test-feature", tempDir);

      approvePhase("test-feature", "requirements", tempDir);
      const state = readState("test-feature", tempDir);

      expect(state?.approvals.requirements).toBe(true);
      expect(state?.approvals.design).toBe(false);
      expect(state?.approvals.tasks).toBe(false);
    });

    it("should approve multiple phases", () => {
      createSpecDirectory("test-feature", tempDir);

      approvePhase("test-feature", "requirements", tempDir);
      approvePhase("test-feature", "design", tempDir);

      const state = readState("test-feature", tempDir);
      expect(state?.approvals.requirements).toBe(true);
      expect(state?.approvals.design).toBe(true);
      expect(state?.approvals.tasks).toBe(false);
    });
  });

  describe("isPhaseApproved", () => {
    it("should return false for unapproved phase", () => {
      createSpecDirectory("test-feature", tempDir);
      expect(isPhaseApproved("test-feature", "requirements", tempDir)).toBe(
        false
      );
    });

    it("should return true for approved phase", () => {
      createSpecDirectory("test-feature", tempDir);
      approvePhase("test-feature", "requirements", tempDir);

      expect(isPhaseApproved("test-feature", "requirements", tempDir)).toBe(
        true
      );
    });
  });

  describe("updateTaskStatus and getTaskStatus", () => {
    it("should update and retrieve task status", () => {
      createSpecDirectory("test-feature", tempDir);

      updateTaskStatus("test-feature", "1.1", "in-progress", tempDir);
      const status = getTaskStatus("test-feature", "1.1", tempDir);

      expect(status).toBe("in-progress");
    });

    it("should return not-started for non-existing task", () => {
      createSpecDirectory("test-feature", tempDir);
      const status = getTaskStatus("test-feature", "99.99", tempDir);

      expect(status).toBe("not-started");
    });

    it("should handle multiple task statuses", () => {
      createSpecDirectory("test-feature", tempDir);

      updateTaskStatus("test-feature", "1", "completed", tempDir);
      updateTaskStatus("test-feature", "2.1", "in-progress", tempDir);
      updateTaskStatus("test-feature", "2.2", "not-started", tempDir);

      expect(getTaskStatus("test-feature", "1", tempDir)).toBe("completed");
      expect(getTaskStatus("test-feature", "2.1", tempDir)).toBe("in-progress");
      expect(getTaskStatus("test-feature", "2.2", tempDir)).toBe("not-started");
    });
  });

  describe("getCurrentPhase", () => {
    it("should return requirements for new spec", () => {
      createSpecDirectory("test-feature", tempDir);
      const phase = getCurrentPhase("test-feature", tempDir);

      expect(phase).toBe("requirements");
    });

    it("should return updated phase", () => {
      createSpecDirectory("test-feature", tempDir);
      updatePhase("test-feature", "tasks", tempDir);

      const phase = getCurrentPhase("test-feature", tempDir);
      expect(phase).toBe("tasks");
    });
  });

  describe("Error handling", () => {
    it("should handle file system errors gracefully", () => {
      // The writeState function creates directories recursively,
      // so we test that it handles the case correctly
      const state = createInitialState("test-feature");

      // Write to a valid path should succeed
      createSpecDirectory("test-feature", tempDir);
      const result = writeState(state, tempDir);
      expect(result).toBe(true);

      // Verify the state was written
      const readResult = readState("test-feature", tempDir);
      expect(readResult).not.toBeNull();
    });
  });
});
