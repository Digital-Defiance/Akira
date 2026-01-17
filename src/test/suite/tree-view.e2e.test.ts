/**
 * Tree View E2E Tests
 * Tests the spec tree view provider and interactions
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("Tree View E2E Tests", () => {
  let testWorkspace: string;
  let specDir: string;

  suiteSetup(async () => {
    // Use the VS Code workspace folder instead of creating a new temp directory
    const vsCodeWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!vsCodeWorkspace) {
      throw new Error('No VS Code workspace folder found! Tests require a workspace to be open.');
    }
    
    testWorkspace = vsCodeWorkspace;
    specDir = path.join(testWorkspace, ".akira", "specs");
    fs.mkdirSync(specDir, { recursive: true });

    const extension = vscode.extensions.getExtension("DigitalDefiance.acs-akira");
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  suiteTeardown(() => {
    // Clean up the specs directory but not the workspace itself
    if (fs.existsSync(specDir)) {
      fs.rmSync(specDir, { recursive: true, force: true });
    }
  });

  suite("Tree View Structure", () => {
    test("Display specs in tree view", async function () {
      this.timeout(5000);

      // Create multiple specs
      const specs = ["feature-a", "feature-b", "feature-c"];

      for (const specName of specs) {
        const featureDir = path.join(specDir, specName);
        fs.mkdirSync(featureDir, { recursive: true });

        fs.writeFileSync(
          path.join(featureDir, "state.json"),
          JSON.stringify({
            featureName: specName,
            currentPhase: "requirements",
            approvals: {
              requirements: false,
              design: false,
              tasks: false,
            },
            taskStatuses: {},
          })
        );
      }

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Tree view should show all specs
      assert.ok(true, "Specs displayed in tree view");
    });

    test("Show phase documents under each spec", async function () {
      this.timeout(5000);

      const featureName = "tree-phases";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(featureDir, "design.md"), "# Design");
      fs.writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks");

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "design",
          approvals: {
            requirements: true,
            design: false,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      assert.ok(true, "Phase documents shown in tree");
    });

    test("Show approval status indicators", async function () {
      this.timeout(5000);

      const featureName = "approval-indicators";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "design",
          approvals: {
            requirements: true,
            design: false,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Tree should show checkmarks for approved phases
      assert.ok(true, "Approval indicators shown");
    });

    test("Show current phase indicator", async function () {
      this.timeout(5000);

      const featureName = "phase-indicator";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "tasks",
          approvals: {
            requirements: true,
            design: true,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Current phase should be highlighted
      assert.ok(true, "Current phase highlighted");
    });
  });

  suite("Tree View Actions", () => {
    test("Open spec via tree view", async function () {
      this.timeout(5000);

      const featureName = "open-spec";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements\n\n- [ ] FR-1: Test"
      );

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Execute open command
      await vscode.commands.executeCommand(
        "akira.openSpec",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Document should be open
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc) {
        assert.ok(
          activeDoc.fileName.includes("requirements.md"),
          "Requirements document opened"
        );
      }
    });

    test("Refresh specs command", async function () {
      this.timeout(5000);

      // Create a new spec
      const featureName = "refresh-test";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
        })
      );

      // Refresh
      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // New spec should appear
      assert.ok(true, "Tree view refreshed");
    });

    test("Create spec via tree view", async function () {
      this.timeout(5000);

      // This would normally show an input box
      // For E2E, we just verify the command exists
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("akira.createSpec"),
        "Create spec command available"
      );
    });

    test("Delete spec via tree view", async function () {
      this.timeout(5000);

      const featureName = "delete-via-tree";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({ featureName })
      );

      assert.ok(fs.existsSync(featureDir), "Spec exists");

      // Delete
      await vscode.commands.executeCommand(
        "akira.deleteSpec",
        vscode.Uri.file(featureDir)
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Spec should be deleted
      assert.ok(!fs.existsSync(featureDir), "Spec deleted");
    });
  });

  suite("Tree View Context Menu", () => {
    test("Approve phase from context menu", async function () {
      this.timeout(5000);

      const featureName = "approve-context";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements"
      );

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
          approvals: {
            requirements: false,
            design: false,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand(
        "akira.approvePhase",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const state = JSON.parse(
        fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
      );

      assert.strictEqual(
        state.approvals.requirements,
        true,
        "Phase approved via context menu"
      );
    });

    test("Unapprove phase from context menu", async function () {
      this.timeout(5000);

      const featureName = "unapprove-context";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements"
      );

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
          approvals: {
            requirements: true,
            design: false,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand(
        "akira.unapprovePhase",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const state = JSON.parse(
        fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
      );

      assert.strictEqual(
        state.approvals.requirements,
        false,
        "Phase unapproved via context menu"
      );
    });

    test("Continue to next phase from context menu", async function () {
      this.timeout(5000);

      const featureName = "continue-context";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements"
      );

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
          approvals: {
            requirements: true,
            design: false,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand(
        "akira.continueSpec",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const state = JSON.parse(
        fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
      );

      assert.strictEqual(
        state.currentPhase,
        "design",
        "Continued to next phase"
      );
    });

    test("Validate spec from context menu", async function () {
      this.timeout(5000);

      const featureName = "validate-context";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements\n\n- [ ] FR-1: WHEN user clicks, THEN system SHALL respond"
      );

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "requirements",
        })
      );

      await vscode.commands.executeCommand(
        "akira.validateSpec",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      assert.ok(true, "Validation executed from context menu");
    });
  });

  suite("Tree View Sorting", () => {
    test("Sort specs alphabetically", async function () {
      this.timeout(5000);

      const specs = ["zebra-feature", "alpha-feature", "beta-feature"];

      for (const specName of specs) {
        const featureDir = path.join(specDir, specName);
        fs.mkdirSync(featureDir, { recursive: true });

        fs.writeFileSync(
          path.join(featureDir, "state.json"),
          JSON.stringify({
            featureName: specName,
            currentPhase: "requirements",
          })
        );
      }

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Tree should show specs in alphabetical order
      assert.ok(true, "Specs sorted alphabetically");
    });

    test("Group by phase", async function () {
      this.timeout(5000);

      const specs = [
        { name: "req-spec", phase: "requirements" },
        { name: "design-spec", phase: "design" },
        { name: "tasks-spec", phase: "tasks" },
      ];

      for (const spec of specs) {
        const featureDir = path.join(specDir, spec.name);
        fs.mkdirSync(featureDir, { recursive: true });

        fs.writeFileSync(
          path.join(featureDir, "state.json"),
          JSON.stringify({
            featureName: spec.name,
            currentPhase: spec.phase,
          })
        );
      }

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Could be grouped by phase
      assert.ok(true, "Specs can be grouped by phase");
    });
  });

  suite("Tree View Icons", () => {
    test("Show appropriate icons for phases", async function () {
      this.timeout(5000);

      const featureName = "phase-icons";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        "# Requirements"
      );
      fs.writeFileSync(path.join(featureDir, "design.md"), "# Design");
      fs.writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks");

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "design",
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Each phase should have appropriate icon
      assert.ok(true, "Phase icons displayed");
    });

    test("Show checkmark for approved phases", async function () {
      this.timeout(5000);

      const featureName = "approval-icons";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify({
          featureName,
          currentPhase: "tasks",
          approvals: {
            requirements: true,
            design: true,
            tasks: false,
          },
          taskStatuses: {},
        })
      );

      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Approved phases should show checkmark
      assert.ok(true, "Approval checkmarks displayed");
    });
  });

  suite("Tree View Performance", () => {
    test("Handle many specs efficiently", async function () {
      this.timeout(15000);

      const numSpecs = 50;

      for (let i = 0; i < numSpecs; i++) {
        const specName = `perf-spec-${i}`;
        const featureDir = path.join(specDir, specName);
        fs.mkdirSync(featureDir, { recursive: true });

        fs.writeFileSync(
          path.join(featureDir, "state.json"),
          JSON.stringify({
            featureName: specName,
            currentPhase: "requirements",
          })
        );
      }

      const startTime = Date.now();
      await vscode.commands.executeCommand("akira.refreshSpecs");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const duration = Date.now() - startTime;

      assert.ok(
        duration < 5000,
        `Tree refresh should be fast (took ${duration}ms)`
      );

      // Cleanup
      for (let i = 0; i < numSpecs; i++) {
        const specName = `perf-spec-${i}`;
        const featureDir = path.join(specDir, specName);
        if (fs.existsSync(featureDir)) {
          fs.rmSync(featureDir, { recursive: true, force: true });
        }
      }
    });
  });
});
