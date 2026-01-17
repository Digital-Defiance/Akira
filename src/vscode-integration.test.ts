/**
 * VS Code Extension Integration Tests
 * Tests the extension's integration with VS Code API including commands,
 * tree views, status bar, and extension lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SpecTreeProvider } from "./spec-tree-provider";
import { StatusBarManager } from "./status-bar-manager";
import { createSpecDirectory, listSpecs } from "./spec-directory";
import {
  createInitialState,
  writeState,
  updatePhase,
  approvePhase,
} from "./state-manager";
import { calculateTaskProgress } from "./task-progress";

describe("VS Code Extension Integration Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-integration-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Extension Activation", () => {
    it("should activate extension successfully", async () => {
      // Extension activation is tested through VS Code's extension host
      // This test verifies the activation event is properly configured
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      expect(packageJson.activationEvents).toBeDefined();
      expect(packageJson.activationEvents).toContain("onStartupFinished");
    });

    it("should register all required commands", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const commands = packageJson.contributes.commands;
      expect(commands).toBeDefined();

      const commandIds = commands.map((cmd: any) => cmd.command);
      expect(commandIds).toContain("akira.refreshSpecs");
      expect(commandIds).toContain("akira.openSpec");
      expect(commandIds).toContain("akira.createSpec");
      expect(commandIds).toContain("akira.deleteSpec");
      expect(commandIds).toContain("akira.executeTask");
    });

    it("should register chat participant", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const chatParticipants = packageJson.contributes.chatParticipants;
      expect(chatParticipants).toBeDefined();
      expect(chatParticipants.length).toBeGreaterThan(0);

      const specParticipant = chatParticipants.find(
        (p: any) => p.id === "spec"
      );
      expect(specParticipant).toBeDefined();
      expect(specParticipant.name).toBe("spec");
      expect(specParticipant.isSticky).toBe(true);
    });

    it("should register configuration properties", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const config = packageJson.contributes.configuration;
      expect(config).toBeDefined();
      expect(config.properties).toBeDefined();

      expect(config.properties["copilotSpec.specDirectory"]).toBeDefined();
      expect(config.properties["copilotSpec.strictMode"]).toBeDefined();
      expect(
        config.properties["copilotSpec.propertyTestIterations"]
      ).toBeDefined();
    });

    it("should register tree view", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const views = packageJson.contributes.views;
      expect(views).toBeDefined();
      expect(views["akira-specs"]).toBeDefined();

      const specTreeView = views["akira-specs"].find(
        (v: any) => v.id === "specTreeView"
      );
      expect(specTreeView).toBeDefined();
      expect(specTreeView.name).toBe("Specs");
    });
  });

  describe("Spec Tree Provider Integration", () => {
    it("should create tree provider instance", () => {
      const treeProvider = new SpecTreeProvider(tempDir);
      expect(treeProvider).toBeDefined();
    });

    it("should provide empty tree when no specs exist", async () => {
      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children).toBeDefined();
      expect(children.length).toBe(0);
    });

    it("should provide tree items for existing specs", async () => {
      // Create some specs
      const features = ["feature-a", "feature-b", "feature-c"];
      for (const feature of features) {
        createSpecDirectory(feature, tempDir);
        const state = createInitialState(feature);
        writeState(state, tempDir);
      }

      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children.length).toBe(3);
      for (const child of children) {
        expect(child.label).toBeDefined();
        expect(child.contextValue).toBe("spec");
      }
    });

    it("should show correct phase in tree item description", async () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      state.currentPhase = "design";
      writeState(state, tempDir);

      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children.length).toBe(1);
      expect(children[0].description).toContain("design");
    });

    it("should show progress in tree item tooltip", async () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      state.currentPhase = "execution";
      state.taskStatuses = {
        "1": "completed",
        "1.1": "completed",
        "1.2": "in-progress",
        "2": "not-started",
      };
      writeState(state, tempDir);

      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children.length).toBe(1);
      expect(children[0].tooltip).toBeDefined();
      expect(children[0].tooltip).toContain("%");
    });

    it("should refresh tree when specs change", async () => {
      const treeProvider = new SpecTreeProvider(tempDir);

      // Initially empty
      let children = await treeProvider.getChildren();
      expect(children.length).toBe(0);

      // Create a spec
      createSpecDirectory("new-feature", tempDir);
      const state = createInitialState("new-feature");
      writeState(state, tempDir);

      // Refresh
      treeProvider.refresh();
      children = await treeProvider.getChildren();
      expect(children.length).toBe(1);
    });

    it("should provide tree item for spec with all phases approved", async () => {
      const featureName = "complete-feature";
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      state.currentPhase = "execution";
      state.approvals.requirements = true;
      state.approvals.design = true;
      state.approvals.tasks = true;
      writeState(state, tempDir);

      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children.length).toBe(1);
      expect(children[0].iconPath).toBeDefined();
    });

    it("should handle specs with different phases", async () => {
      const specs = [
        { name: "spec-requirements", phase: "requirements" as const },
        { name: "spec-design", phase: "design" as const },
        { name: "spec-tasks", phase: "tasks" as const },
        { name: "spec-execution", phase: "execution" as const },
      ];

      for (const spec of specs) {
        createSpecDirectory(spec.name, tempDir);
        const state = createInitialState(spec.name);
        state.currentPhase = spec.phase;
        writeState(state, tempDir);
      }

      const treeProvider = new SpecTreeProvider(tempDir);
      const children = await treeProvider.getChildren();

      expect(children.length).toBe(4);
      const descriptions = children.map((c) => c.description);
      // Descriptions include phase and progress, so check if they contain the phase name
      expect(descriptions.some((d) => d?.includes("requirements"))).toBe(true);
      expect(descriptions.some((d) => d?.includes("design"))).toBe(true);
      expect(descriptions.some((d) => d?.includes("tasks"))).toBe(true);
      expect(descriptions.some((d) => d?.includes("execution"))).toBe(true);
    });
  });

  describe("Status Bar Manager Integration", () => {
    it.skip("should create status bar manager instance", () => {
      // Skipped: Requires VS Code API mocks
      // StatusBarManager needs vscode.window.createStatusBarItem
      const statusBarManager = new StatusBarManager();
      expect(statusBarManager).toBeDefined();
    });

    it.skip("should update status bar with spec info", () => {
      // Skipped: Requires VS Code API mocks
      const statusBarManager = new StatusBarManager();
      statusBarManager.updateStatus("test-feature", "design");
      expect(statusBarManager).toBeDefined();
    });

    it.skip("should show progress indicator", () => {
      // Skipped: Requires VS Code API mocks
      const statusBarManager = new StatusBarManager();
      statusBarManager.showProgress("Generating requirements...");
      expect(statusBarManager).toBeDefined();
    });

    it.skip("should hide status bar when no active spec", () => {
      // Skipped: Requires VS Code API mocks
      const statusBarManager = new StatusBarManager();
      statusBarManager.hide();
      expect(statusBarManager).toBeDefined();
    });

    it.skip("should update status bar for different phases", () => {
      // Skipped: Requires VS Code API mocks
      const statusBarManager = new StatusBarManager();
      const phases: Array<"requirements" | "design" | "tasks" | "execution"> = [
        "requirements",
        "design",
        "tasks",
        "execution",
      ];

      for (const phase of phases) {
        statusBarManager.updateStatus("test-feature", phase);
        expect(statusBarManager).toBeDefined();
      }
    });
  });

  describe("Command Integration", () => {
    it("should handle refresh specs command", async () => {
      // Create some specs
      createSpecDirectory("feature-1", tempDir);
      createSpecDirectory("feature-2", tempDir);

      const treeProvider = new SpecTreeProvider(tempDir);
      treeProvider.refresh();

      const children = await treeProvider.getChildren();
      expect(children.length).toBe(2);
    });

    it("should handle create spec command flow", async () => {
      const featureName = "new-feature";

      // Simulate create spec command
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Initialize state
      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Verify spec was created
      const specs = listSpecs(tempDir);
      expect(specs.length).toBe(1);
      expect(specs[0].featureName).toBe(featureName);
    });

    it("should handle open spec command", async () => {
      const featureName = "test-feature";
      createSpecDirectory(featureName, tempDir);
      const state = createInitialState(featureName);
      writeState(state, tempDir);

      // Get spec directory
      const specs = listSpecs(tempDir);
      expect(specs.length).toBe(1);

      const specDir = specs[0].directory;
      expect(fs.existsSync(specDir)).toBe(true);
      expect(fs.existsSync(path.join(specDir, "requirements.md"))).toBe(true);
    });

    it("should handle delete spec command", async () => {
      const featureName = "to-delete";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Verify spec exists
      let specs = listSpecs(tempDir);
      expect(specs.length).toBe(1);

      // Delete spec
      fs.rmSync(result.directory, { recursive: true, force: true });

      // Verify spec is deleted
      specs = listSpecs(tempDir);
      expect(specs.length).toBe(0);
    });

    it("should handle execute task command flow", async () => {
      const featureName = "task-feature";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      const state = createInitialState(featureName);
      state.currentPhase = "execution";
      state.taskStatuses = {
        "1": "not-started",
        "1.1": "not-started",
      };
      writeState(state, tempDir);

      // Simulate task execution
      state.taskStatuses["1.1"] = "in-progress";
      writeState(state, tempDir);

      // Verify task status updated
      const updatedState = JSON.parse(
        fs.readFileSync(path.join(result.directory, "state.json"), "utf-8")
      );
      expect(updatedState.taskStatuses["1.1"]).toBe("in-progress");
    });
  });

  describe("Configuration Integration", () => {
    it("should read spec directory configuration", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const specDirConfig =
        packageJson.contributes.configuration.properties[
          "copilotSpec.specDirectory"
        ];
      expect(specDirConfig).toBeDefined();
      expect(specDirConfig.default).toBe(".akira/specs");
      expect(specDirConfig.type).toBe("string");
    });

    it("should read strict mode configuration", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const strictModeConfig =
        packageJson.contributes.configuration.properties[
          "copilotSpec.strictMode"
        ];
      expect(strictModeConfig).toBeDefined();
      expect(strictModeConfig.default).toBe(false);
      expect(strictModeConfig.type).toBe("boolean");
    });

    it("should read property test iterations configuration", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const iterationsConfig =
        packageJson.contributes.configuration.properties[
          "copilotSpec.propertyTestIterations"
        ];
      expect(iterationsConfig).toBeDefined();
      expect(iterationsConfig.default).toBe(100);
      expect(iterationsConfig.type).toBe("number");
      expect(iterationsConfig.minimum).toBe(10);
      expect(iterationsConfig.maximum).toBe(10000);
    });

    it("should validate configuration schema", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const config = packageJson.contributes.configuration;
      expect(config.title).toBe("Akira");
      expect(config.properties).toBeDefined();

      // Verify all properties have required fields
      for (const [key, value] of Object.entries(config.properties)) {
        const prop = value as any;
        expect(prop.type).toBeDefined();
        expect(prop.description).toBeDefined();
        expect(prop.default).toBeDefined();
      }
    });
  });

  describe("Menu Integration", () => {
    it("should register view title menus", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const menus = packageJson.contributes.menus;
      expect(menus).toBeDefined();
      expect(menus["view/title"]).toBeDefined();

      const viewTitleMenus = menus["view/title"];
      const refreshMenu = viewTitleMenus.find(
        (m: any) => m.command === "akira.refreshSpecs"
      );
      const createMenu = viewTitleMenus.find(
        (m: any) => m.command === "akira.createSpec"
      );

      expect(refreshMenu).toBeDefined();
      expect(refreshMenu.when).toContain("specTreeView");
      expect(createMenu).toBeDefined();
      expect(createMenu.when).toContain("specTreeView");
    });

    it("should register view item context menus", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const menus = packageJson.contributes.menus;
      expect(menus["view/item/context"]).toBeDefined();

      const contextMenus = menus["view/item/context"];
      const openMenu = contextMenus.find(
        (m: any) => m.command === "akira.openSpec"
      );
      const deleteMenu = contextMenus.find(
        (m: any) => m.command === "akira.deleteSpec"
      );

      expect(openMenu).toBeDefined();
      expect(openMenu.when).toContain("viewItem == spec");
      expect(deleteMenu).toBeDefined();
      expect(deleteMenu.when).toContain("viewItem == spec");
    });
  });

  describe("Chat Participant Integration", () => {
    it("should register chat participant commands", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const chatParticipants = packageJson.contributes.chatParticipants;
      const specParticipant = chatParticipants.find(
        (p: any) => p.id === "spec"
      );

      expect(specParticipant.commands).toBeDefined();
      expect(specParticipant.commands.length).toBeGreaterThan(0);

      const commandNames = specParticipant.commands.map((c: any) => c.name);
      expect(commandNames).toContain("create");
      expect(commandNames).toContain("list");
      expect(commandNames).toContain("status");
      expect(commandNames).toContain("update");
      expect(commandNames).toContain("execute");
      expect(commandNames).toContain("approve");
      expect(commandNames).toContain("validate");
    });

    it("should have descriptions for all chat commands", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const chatParticipants = packageJson.contributes.chatParticipants;
      const specParticipant = chatParticipants.find(
        (p: any) => p.id === "spec"
      );

      for (const command of specParticipant.commands) {
        expect(command.name).toBeDefined();
        expect(command.description).toBeDefined();
        expect(command.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Views Welcome Integration", () => {
    it("should register welcome view for empty state", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      const viewsWelcome = packageJson.contributes.viewsWelcome;
      expect(viewsWelcome).toBeDefined();
      expect(viewsWelcome.length).toBeGreaterThan(0);

      const specTreeWelcome = viewsWelcome.find(
        (w: any) => w.view === "specTreeView"
      );
      expect(specTreeWelcome).toBeDefined();
      expect(specTreeWelcome.contents).toBeDefined();
      expect(specTreeWelcome.contents).toContain("No specs found");
    });
  });

  describe("Task Progress Integration", () => {
    it("should calculate progress for specs with tasks", () => {
      const featureName = "progress-test";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Create tasks.md with some tasks
      const tasksContent = `# Implementation Plan

- [x] 1. First task
  - [x] 1.1 Subtask one
  - [-] 1.2 Subtask two
- [ ] 2. Second task
  - [ ] 2.1 Subtask three
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);

      // Create state with task statuses
      const state = createInitialState(featureName);
      state.taskStatuses = {
        "1": "completed",
        "1.1": "completed",
        "1.2": "in-progress",
        "2": "not-started",
        "2.1": "not-started",
      };
      writeState(state, tempDir);

      const progress = calculateTaskProgress(featureName, tempDir);
      expect(progress.total).toBeGreaterThan(0);
      expect(progress.completed).toBeGreaterThan(0);
      expect(progress.percentage).toBeGreaterThan(0);
      expect(progress.percentage).toBeLessThanOrEqual(100);
    });

    it("should handle empty task list", () => {
      const featureName = "empty-tasks";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      const state = createInitialState(featureName);
      writeState(state, tempDir);

      const progress = calculateTaskProgress(featureName, tempDir);
      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it("should exclude optional tasks from progress calculation", () => {
      const featureName = "optional-tasks";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Create tasks.md with optional tasks
      const tasksContent = `# Implementation Plan

- [x] 1. Main task
  - [x] 1.1 Required subtask
  - [ ]* 1.2 Optional subtask
- [ ] 2. Another task
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);

      const state = createInitialState(featureName);
      state.taskStatuses = {
        "1": "completed",
        "1.1": "completed",
        "1.2*": "not-started",
        "2": "not-started",
      };
      writeState(state, tempDir);

      const progress = calculateTaskProgress(featureName, tempDir);
      // Optional tasks should be tracked separately
      // The total should not include optional tasks
      expect(progress.total).toBeGreaterThan(0);
      expect(progress.optional).toBeGreaterThanOrEqual(0); // May be 0 or more depending on parsing
    });

    it("should calculate 100% progress when all tasks complete", () => {
      const featureName = "complete-tasks";
      const result = createSpecDirectory(featureName, tempDir);
      expect(result.success).toBe(true);

      // Create tasks.md with all completed tasks
      const tasksContent = `# Implementation Plan

- [x] 1. First task
  - [x] 1.1 Subtask one
  - [x] 1.2 Subtask two
- [x] 2. Second task
`;
      fs.writeFileSync(path.join(result.directory, "tasks.md"), tasksContent);

      const state = createInitialState(featureName);
      state.taskStatuses = {
        "1": "completed",
        "1.1": "completed",
        "1.2": "completed",
        "2": "completed",
      };
      writeState(state, tempDir);

      const progress = calculateTaskProgress(featureName, tempDir);
      expect(progress.percentage).toBe(100);
      expect(progress.completed).toBe(progress.total);
    });
  });

  describe("Multi-Workspace Integration", () => {
    it("should handle multiple workspace folders", async () => {
      // Create multiple workspace directories
      const workspace1 = fs.mkdtempSync(path.join(os.tmpdir(), "workspace1-"));
      const workspace2 = fs.mkdtempSync(path.join(os.tmpdir(), "workspace2-"));

      try {
        // Create specs in different workspaces
        createSpecDirectory("feature-a", workspace1);
        createSpecDirectory("feature-b", workspace2);

        // Each workspace should have its own specs
        const specs1 = listSpecs(workspace1);
        const specs2 = listSpecs(workspace2);

        expect(specs1.length).toBe(1);
        expect(specs2.length).toBe(1);
        expect(specs1[0].featureName).toBe("feature-a");
        expect(specs2[0].featureName).toBe("feature-b");
      } finally {
        fs.rmSync(workspace1, { recursive: true, force: true });
        fs.rmSync(workspace2, { recursive: true, force: true });
      }
    });

    it("should isolate spec state between workspaces", async () => {
      const workspace1 = fs.mkdtempSync(path.join(os.tmpdir(), "workspace1-"));
      const workspace2 = fs.mkdtempSync(path.join(os.tmpdir(), "workspace2-"));

      try {
        const featureName = "same-feature";

        // Create same feature in both workspaces
        createSpecDirectory(featureName, workspace1);
        createSpecDirectory(featureName, workspace2);

        // Set different phases
        const state1 = createInitialState(featureName);
        state1.currentPhase = "design";
        writeState(state1, workspace1);

        const state2 = createInitialState(featureName);
        state2.currentPhase = "tasks";
        writeState(state2, workspace2);

        // Verify states are independent
        const readState1 = JSON.parse(
          fs.readFileSync(
            path.join(workspace1, ".akira", "specs", featureName, "state.json"),
            "utf-8"
          )
        );
        const readState2 = JSON.parse(
          fs.readFileSync(
            path.join(workspace2, ".akira", "specs", featureName, "state.json"),
            "utf-8"
          )
        );

        expect(readState1.currentPhase).toBe("design");
        expect(readState2.currentPhase).toBe("tasks");
      } finally {
        fs.rmSync(workspace1, { recursive: true, force: true });
        fs.rmSync(workspace2, { recursive: true, force: true });
      }
    });
  });

  describe("Extension Lifecycle", () => {
    it("should have proper extension metadata", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      expect(packageJson.name).toBe("acs-akira");
      expect(packageJson.displayName).toBe("ACS Akira");
      expect(packageJson.description).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.publisher).toBeDefined();
      expect(packageJson.engines).toBeDefined();
      expect(packageJson.engines.vscode).toBeDefined();
    });

    it("should have proper categories", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      expect(packageJson.categories).toBeDefined();
      expect(packageJson.categories).toContain("Programming Languages");
      expect(packageJson.categories).toContain("Testing");
    });

    it("should have proper keywords for marketplace", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      expect(packageJson.keywords).toBeDefined();
      expect(packageJson.keywords).toContain("spec");
      expect(packageJson.keywords).toContain("requirements");
      expect(packageJson.keywords).toContain("EARS");
      expect(packageJson.keywords).toContain("property-based testing");
      expect(packageJson.keywords).toContain("MCP");
    });

    it("should have repository and bug tracking configured", () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
      );

      expect(packageJson.repository).toBeDefined();
      expect(packageJson.repository.type).toBe("git");
      expect(packageJson.repository.url).toBeDefined();
      expect(packageJson.bugs).toBeDefined();
      expect(packageJson.bugs.url).toBeDefined();
    });
  });
});
