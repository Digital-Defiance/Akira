/**
 * Integration Tests for Complete Workflows
 * Tests the full spec-driven development workflow from requirements through task execution
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createSpecDirectory, listSpecs } from "./spec-directory";
import { RequirementsGenerator } from "./requirements-generator";
import { DesignGenerator } from "./design-generator";
import { TaskGenerator } from "./task-generator";
import {
  createInitialState,
  writeState,
  readState,
  approvePhase,
  updatePhase,
  getCurrentPhase,
  isPhaseApproved,
} from "./state-manager";

describe("Integration Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Complete Workflow: Requirements → Design → Tasks", () => {
    it("should complete full workflow from feature idea to task list", async () => {
      const featureName = "user-authentication";
      const featureIdea =
        "A system that allows users to log in securely with username and password";

      // Step 1: Create spec directory
      const createResult = createSpecDirectory(featureName, tempDir);
      expect(createResult.success).toBe(true);
      expect(createResult.directory).toBeDefined();

      // Verify directory was created with kebab-case name
      const kebabName = featureName; // Already in kebab-case
      const specDir = createResult.directory;
      expect(fs.existsSync(specDir)).toBe(true);
      expect(fs.existsSync(path.join(specDir, "requirements.md"))).toBe(true);

      // Step 2: Initialize state
      const state = createInitialState(featureName);
      expect(state.currentPhase).toBe("requirements");
      expect(state.approvals.requirements).toBe(false);
      writeState(state, tempDir);

      // Step 3: Generate requirements
      const reqGenerator = new RequirementsGenerator();
      const requirements = reqGenerator.generateRequirements(featureIdea);
      expect(requirements).toBeDefined();
      expect(requirements.introduction).toBeDefined();
      expect(requirements.glossary).toBeDefined();

      // Validate requirements
      const validation = reqGenerator.validateRequirements(requirements);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);

      // Write requirements to file
      const reqContent = reqGenerator.formatAsMarkdown(requirements);
      fs.writeFileSync(path.join(specDir, "requirements.md"), reqContent);

      // Step 4: Approve requirements phase and advance to design
      approvePhase(featureName, "requirements", tempDir);
      updatePhase(featureName, "design", tempDir);
      const stateAfterReqApproval = readState(featureName, tempDir);
      expect(stateAfterReqApproval?.approvals.requirements).toBe(true);
      expect(stateAfterReqApproval?.currentPhase).toBe("design");

      // Step 5: Generate design
      const designGenerator = new DesignGenerator();
      const design = designGenerator.generateDesign(requirements);
      expect(design).toBeDefined();
      expect(design.overview).toBeDefined();
      expect(design.architecture).toBeDefined();

      // Write design to file
      const designContent = designGenerator.formatAsMarkdown(design);
      fs.writeFileSync(path.join(specDir, "design.md"), designContent);

      // Step 6: Approve design phase and advance to tasks
      approvePhase(featureName, "design", tempDir);
      updatePhase(featureName, "tasks", tempDir);
      const stateAfterDesignApproval = readState(featureName, tempDir);
      expect(stateAfterDesignApproval?.approvals.design).toBe(true);
      expect(stateAfterDesignApproval?.currentPhase).toBe("tasks");

      // Step 7: Generate tasks
      const taskGenerator = new TaskGenerator();
      const tasks = taskGenerator.generateTasks(design, requirements);
      expect(tasks).toBeDefined();
      expect(tasks.tasks).toBeDefined();

      // Verify task structure
      const allTasks = flattenTasks(tasks.tasks);
      for (const task of allTasks) {
        expect(task.id).toBeDefined();
        expect(task.description).toBeDefined();
        // Verify max 2-level hierarchy
        const levels = task.id.split(".").length;
        expect(levels).toBeLessThanOrEqual(2);
      }

      // Write tasks to file
      const tasksContent = taskGenerator.formatAsMarkdown(tasks);
      fs.writeFileSync(path.join(specDir, "tasks.md"), tasksContent);

      // Step 8: Approve tasks phase and advance to execution
      approvePhase(featureName, "tasks", tempDir);
      updatePhase(featureName, "execution", tempDir);
      const finalState = readState(featureName, tempDir);
      expect(finalState?.approvals.tasks).toBe(true);
      expect(finalState?.currentPhase).toBe("execution");

      // Verify all files exist
      expect(fs.existsSync(path.join(specDir, "requirements.md"))).toBe(true);
      expect(fs.existsSync(path.join(specDir, "design.md"))).toBe(true);
      expect(fs.existsSync(path.join(specDir, "tasks.md"))).toBe(true);
      expect(fs.existsSync(path.join(specDir, "state.json"))).toBe(true);
    });

    it("should enforce workflow phase order", () => {
      const featureName = "test-feature";

      // Create spec and initialize state
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Verify initial phase
      expect(getCurrentPhase(featureName, tempDir)).toBe("requirements");
      expect(isPhaseApproved(featureName, "requirements", tempDir)).toBe(false);

      // Cannot skip to design without approving requirements
      expect(isPhaseApproved(featureName, "design", tempDir)).toBe(false);
      expect(isPhaseApproved(featureName, "tasks", tempDir)).toBe(false);

      // Approve requirements and advance
      approvePhase(featureName, "requirements", tempDir);
      updatePhase(featureName, "design", tempDir);
      expect(getCurrentPhase(featureName, tempDir)).toBe("design");
      expect(isPhaseApproved(featureName, "requirements", tempDir)).toBe(true);

      // Approve design and advance
      approvePhase(featureName, "design", tempDir);
      updatePhase(featureName, "tasks", tempDir);
      expect(getCurrentPhase(featureName, tempDir)).toBe("tasks");
      expect(isPhaseApproved(featureName, "design", tempDir)).toBe(true);

      // Approve tasks and advance
      approvePhase(featureName, "tasks", tempDir);
      updatePhase(featureName, "execution", tempDir);
      expect(getCurrentPhase(featureName, tempDir)).toBe("execution");
      expect(isPhaseApproved(featureName, "tasks", tempDir)).toBe(true);
    });
  });

  describe("Task Execution Flow", () => {
    it("should track task completion through execution", () => {
      const featureName = "task-execution-test";

      // Create spec and set up for execution phase
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      state.currentPhase = "execution";
      state.approvals.requirements = true;
      state.approvals.design = true;
      state.approvals.tasks = true;

      // Add some tasks to state
      state.taskStatuses = {
        "1": "not-started",
        "1.1": "not-started",
        "1.2": "not-started",
        "2": "not-started",
      };

      writeState(state, tempDir);

      // Simulate task execution
      const updatedState = readState(featureName, tempDir);
      updatedState.taskStatuses["1.1"] = "completed";
      writeState(updatedState, tempDir);

      // Verify task status update
      const stateAfterUpdate = readState(featureName, tempDir);
      expect(stateAfterUpdate.taskStatuses["1.1"]).toBe("completed");
      expect(stateAfterUpdate.taskStatuses["1.2"]).toBe("not-started");

      // Complete all subtasks
      updatedState.taskStatuses["1.2"] = "completed";
      writeState(updatedState, tempDir);

      // Now parent task can be completed
      updatedState.taskStatuses["1"] = "completed";
      writeState(updatedState, tempDir);

      const finalState = readState(featureName, tempDir);
      expect(finalState.taskStatuses["1"]).toBe("completed");
      expect(finalState.taskStatuses["1.1"]).toBe("completed");
      expect(finalState.taskStatuses["1.2"]).toBe("completed");
    });

    it("should handle optional task skipping", () => {
      const featureName = "optional-task-test";

      // Create spec
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      state.currentPhase = "execution";

      // Add tasks including optional ones
      state.taskStatuses = {
        "1": "not-started",
        "1.1": "not-started",
        "1.2*": "not-started", // Optional task
        "2": "not-started",
      };

      writeState(state, tempDir);

      // Complete non-optional tasks
      const updatedState = readState(featureName, tempDir);
      updatedState.taskStatuses["1.1"] = "completed";
      updatedState.taskStatuses["1.2*"] = "skipped"; // Skip optional
      updatedState.taskStatuses["1"] = "completed";
      writeState(updatedState, tempDir);

      const finalState = readState(featureName, tempDir);
      expect(finalState.taskStatuses["1"]).toBe("completed");
      expect(finalState.taskStatuses["1.1"]).toBe("completed");
      expect(finalState.taskStatuses["1.2*"]).toBe("skipped");
    });
  });

  describe("Multi-Spec Management", () => {
    it("should manage multiple specs independently", () => {
      const features = ["feature-a", "feature-b", "feature-c"];

      // Create multiple specs
      for (const feature of features) {
        const result = createSpecDirectory(feature, tempDir);
        expect(result.success).toBe(true);

        const state = createInitialState(feature);
        writeState(state, tempDir);
      }

      // List all specs
      const specs = listSpecs(tempDir);
      expect(specs.length).toBe(3);

      // Verify each spec is independent
      for (const feature of features) {
        const phase = getCurrentPhase(feature, tempDir);
        expect(phase).toBe("requirements");
      }

      // Advance one spec
      approvePhase("feature-a", "requirements", tempDir);
      updatePhase("feature-a", "design", tempDir);
      expect(getCurrentPhase("feature-a", tempDir)).toBe("design");
      expect(getCurrentPhase("feature-b", tempDir)).toBe("requirements");
      expect(getCurrentPhase("feature-c", tempDir)).toBe("requirements");

      // Advance another spec
      approvePhase("feature-b", "requirements", tempDir);
      updatePhase("feature-b", "design", tempDir);
      approvePhase("feature-b", "design", tempDir);
      updatePhase("feature-b", "tasks", tempDir);
      expect(getCurrentPhase("feature-a", tempDir)).toBe("design");
      expect(getCurrentPhase("feature-b", tempDir)).toBe("tasks");
      expect(getCurrentPhase("feature-c", tempDir)).toBe("requirements");
    });
  });

  describe("Error Recovery", () => {
    it("should handle missing state file gracefully", () => {
      const featureName = "missing-state-test";

      // Create spec directory but don't create state
      createSpecDirectory(featureName, tempDir);

      // Reading state should return null for missing state
      const state = readState(featureName, tempDir);
      expect(state).toBeNull();

      // getCurrentPhase should return default when state is missing
      expect(getCurrentPhase(featureName, tempDir)).toBe("requirements");
    });

    it("should handle corrupted state file", () => {
      const featureName = "corrupted-state-test";

      // Create spec
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Write corrupted state
      const stateFile = path.join(result.directory, "state.json");
      fs.writeFileSync(stateFile, "{ invalid json }");

      // Reading should return null for corrupted state
      const state = readState(featureName, tempDir);
      expect(state).toBeNull();

      // getCurrentPhase should return default when state is corrupted
      expect(getCurrentPhase(featureName, tempDir)).toBe("requirements");
    });
  });
});

// Helper function to flatten task hierarchy
function flattenTasks(tasks: any[]): any[] {
  const flattened: any[] = [];
  for (const task of tasks) {
    flattened.push(task);
    if (task.subtasks && task.subtasks.length > 0) {
      flattened.push(...flattenTasks(task.subtasks));
    }
  }
  return flattened;
}

// Helper functions to format documents
function formatRequirementsDocument(requirements: any): string {
  let content = "# Requirements Document\n\n";
  content += "## Introduction\n\n";
  content += requirements.introduction + "\n\n";
  content += "## Glossary\n\n";
  for (const entry of requirements.glossary) {
    content += `- **${entry.term}**: ${entry.definition}\n`;
  }
  content += "\n## Requirements\n\n";
  for (const req of requirements.requirements) {
    content += `### Requirement ${req.id}\n\n`;
    content += `**User Story:** ${req.userStory.story}\n\n`;
    content += "#### Acceptance Criteria\n\n";
    for (const criterion of req.acceptanceCriteria) {
      content += `${criterion.id}. ${criterion.text}\n`;
    }
    content += "\n";
  }
  return content;
}

function formatDesignDocument(design: any): string {
  let content = "# Design Document\n\n";
  content += "## Overview\n\n";
  content += design.overview + "\n\n";
  content += "## Architecture\n\n";
  content += design.architecture + "\n\n";
  content += "## Components and Interfaces\n\n";
  for (const component of design.components) {
    content += `### ${component.name}\n\n`;
    content += component.description + "\n\n";
  }
  content += "## Data Models\n\n";
  for (const model of design.dataModels) {
    content += `### ${model.name}\n\n`;
    content += model.description + "\n\n";
  }
  content += "## Correctness Properties\n\n";
  for (const prop of design.correctnessProperties) {
    content += `**${prop.id}**: ${prop.description}\n`;
    content += `**Validates: Requirements ${prop.validatesRequirements.join(
      ", "
    )}**\n\n`;
  }
  content += "## Error Handling\n\n";
  content += design.errorHandling + "\n\n";
  content += "## Testing Strategy\n\n";
  content += design.testingStrategy.description + "\n\n";
  return content;
}

function formatTasksDocument(tasks: any): string {
  let content = "# Implementation Plan\n\n";
  for (const task of tasks.tasks) {
    const indent = task.id.includes(".") ? "  " : "";
    const optional = task.optional ? "*" : "";
    content += `${indent}- [ ]${optional} ${task.id}. ${task.description}\n`;
    if (task.requirementRefs && task.requirementRefs.length > 0) {
      content += `${indent}  - _Requirements: ${task.requirementRefs.join(
        ", "
      )}_\n`;
    }
    if (task.propertyRef) {
      content += `${indent}  - ${task.propertyRef}\n`;
    }
  }
  return content;
}
