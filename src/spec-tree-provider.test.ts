/**
 * Tests for spec tree provider
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  SpecTreeProvider,
  SpecTreeItem,
  PhaseDocumentTreeItem,
} from "./spec-tree-provider";
import { writeState, createInitialState } from "./state-manager";
import { createSpecDirectory } from "./spec-directory";

describe("Spec Tree Provider", () => {
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

  describe("Tree View Data Generation", () => {
    it("should return empty array when no specs exist", async () => {
      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      expect(children).toEqual([]);
    });

    it("should return spec tree items for existing specs", async () => {
      // Create a spec
      createSpecDirectory("test-feature", testDir);

      // Create state
      const state = createInitialState("test-feature");
      state.currentPhase = "requirements";
      writeState(state, testDir);

      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(SpecTreeItem);
      expect((children[0] as SpecTreeItem).featureName).toBe("test-feature");
      expect((children[0] as SpecTreeItem).phase).toBe("requirements");
    });

    it("should return phase documents for a spec", async () => {
      // Create a spec
      createSpecDirectory("test-feature", testDir);

      const provider = new SpecTreeProvider(testDir);
      const specs = await provider.getChildren();
      const phaseDocuments = await provider.getChildren(
        specs[0] as SpecTreeItem
      );

      expect(phaseDocuments).toHaveLength(3);
      expect(phaseDocuments[0]).toBeInstanceOf(PhaseDocumentTreeItem);
      expect((phaseDocuments[0] as PhaseDocumentTreeItem).label).toBe(
        "Requirements"
      );
      expect((phaseDocuments[1] as PhaseDocumentTreeItem).label).toBe("Design");
      expect((phaseDocuments[2] as PhaseDocumentTreeItem).label).toBe("Tasks");
    });

    it("should show correct phase for spec", async () => {
      // Create a spec
      createSpecDirectory("test-feature", testDir);

      // Create state with design phase
      const state = createInitialState("test-feature");
      state.currentPhase = "design";
      writeState(state, testDir);

      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      expect((children[0] as SpecTreeItem).phase).toBe("design");
    });

    it("should show approved status when phase is approved", async () => {
      // Create a spec
      createSpecDirectory("test-feature", testDir);

      // Create state with approved requirements
      const state = createInitialState("test-feature");
      state.currentPhase = "requirements";
      state.approvals.requirements = true;
      writeState(state, testDir);

      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      expect((children[0] as SpecTreeItem).approved).toBe(true);
    });
  });

  describe("Progress Calculation", () => {
    it("should show zero progress when no tasks file exists", async () => {
      // Create a spec without tasks
      createSpecDirectory("test-feature", testDir);

      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      const progress = (children[0] as SpecTreeItem).progress;
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it("should calculate progress from tasks file", async () => {
      // Create a spec with tasks
      createSpecDirectory("test-feature", testDir);

      // Create tasks.md
      const specDir = path.join(testDir, ".kiro", "specs", "test-feature");
      const tasksPath = path.join(specDir, "tasks.md");
      const tasksContent = `# Implementation Plan

- [x] 1. Task 1
- [x] 2. Task 2
- [ ] 3. Task 3
`;
      fs.writeFileSync(tasksPath, tasksContent, "utf-8");

      const provider = new SpecTreeProvider(testDir);
      const children = await provider.getChildren();

      const progress = (children[0] as SpecTreeItem).progress;
      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(2);
      expect(progress.percentage).toBe(67); // 2/3 ≈ 67%
    });
  });

  describe("Refresh", () => {
    it("should fire change event when refresh is called", () => {
      const provider = new SpecTreeProvider(testDir);
      const listener = vi.fn();

      provider.onDidChangeTreeData(listener);
      provider.refresh();

      expect(listener).toHaveBeenCalled();
    });
  });
});
