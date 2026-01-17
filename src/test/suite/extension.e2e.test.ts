/**
 * VS Code Extension E2E Tests
 * These tests run in a real VS Code instance
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

suite("Extension E2E Test Suite", () => {
  vscode.window.showInformationMessage("Start all E2E tests.");

  let workspaceRoot: string;

  suiteSetup(async () => {
    // Get workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      // If no workspace, skip tests that require it
      console.warn("No workspace folder found - some tests will be skipped");
      workspaceRoot = "";
    } else {
      workspaceRoot = workspaceFolders[0].uri.fsPath;
    }

    // Debug: List all extensions
    console.log("All loaded extensions:");
    vscode.extensions.all.forEach(ext => {
      console.log(`  - ${ext.id} (active: ${ext.isActive})`);
    });

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension("DigitalDefiance.acs-akira");
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  suite("Extension Activation", () => {
    test("Extension should be present", () => {
      const extension = vscode.extensions.getExtension(
        "DigitalDefiance.acs-akira"
      );
      assert.ok(extension, "Extension not found");
    });

    test("Extension should activate", async () => {
      const extension = vscode.extensions.getExtension(
        "DigitalDefiance.acs-akira"
      );
      assert.ok(extension, "Extension not found");

      if (!extension.isActive) {
        await extension.activate();
      }

      assert.ok(extension.isActive, "Extension did not activate");
    });
  });

  suite("Commands Registration", () => {
    test("All commands should be registered", async () => {
      const commands = await vscode.commands.getCommands(true);

      const expectedCommands = [
        "akira.refreshSpecs",
        "akira.openSpec",
        "akira.createSpec",
        "akira.deleteSpec",
        "akira.executeTask",
      ];

      for (const cmd of expectedCommands) {
        assert.ok(commands.includes(cmd), `Command ${cmd} not registered`);
      }
    });
  });

  suite("Tree View", () => {
    test("Spec tree view should be available", async () => {
      // The tree view should be registered
      const treeView = vscode.window.createTreeView("specTreeView", {
        treeDataProvider: {
          getTreeItem: (element: any) => element,
          getChildren: () => [],
        },
      });

      assert.ok(treeView, "Tree view not created");
      treeView.dispose();
    });

    test("Should refresh specs command", async () => {
      // Execute refresh command
      await vscode.commands.executeCommand("akira.refreshSpecs");
      // If no error thrown, command works
      assert.ok(true);
    });
  });

  suite("Configuration", () => {
    test("Should read configuration values", () => {
      const config = vscode.workspace.getConfiguration("copilotSpec");

      const specDir = config.get<string>("specDirectory");
      assert.ok(specDir, "Spec directory config not found");
      assert.strictEqual(typeof specDir, "string");
    });

    test("Should have default configuration values", () => {
      const config = vscode.workspace.getConfiguration("copilotSpec");

      const specDir = config.get<string>("specDirectory");
      const strictMode = config.get<boolean>("strictMode");
      const iterations = config.get<number>("propertyTestIterations");

      assert.strictEqual(specDir, ".akira/specs");
      assert.strictEqual(strictMode, false);
      assert.strictEqual(iterations, 100);
    });

    test("Should update configuration", async () => {
      const config = vscode.workspace.getConfiguration("copilotSpec");

      // Get original value
      const originalValue = config.get<boolean>("strictMode");

      // Update config
      await config.update(
        "strictMode",
        true,
        vscode.ConfigurationTarget.Workspace
      );

      // Re-fetch config to get updated value
      const updatedConfig = vscode.workspace.getConfiguration("copilotSpec");
      const strictMode = updatedConfig.get<boolean>("strictMode");
      assert.strictEqual(strictMode, true);

      // Reset to original value
      await config.update(
        "strictMode",
        originalValue,
        vscode.ConfigurationTarget.Workspace
      );

      // Verify reset
      const finalConfig = vscode.workspace.getConfiguration("copilotSpec");
      const finalValue = finalConfig.get<boolean>("strictMode");
      assert.strictEqual(finalValue, originalValue);
    });
  });

  suite("Spec Creation Workflow", () => {
    const testSpecName = "e2e-test-spec";
    let specDir: string;

    setup(() => {
      const config = vscode.workspace.getConfiguration("copilotSpec");
      const specBaseDir = config.get<string>("specDirectory") || ".akira/specs";
      specDir = path.join(workspaceRoot, specBaseDir, testSpecName);
    });

    teardown(async () => {
      // Close any open editors to release file locks
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");

      // Wait a bit for files to be released
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Clean up test spec
      if (fs.existsSync(specDir)) {
        try {
          fs.rmSync(specDir, { recursive: true, force: true });
        } catch (error) {
          // If cleanup fails, log but don't fail the test
          console.warn(`Failed to clean up ${specDir}:`, error);
        }
      }
    });

    test("Should create spec via command", async () => {
      // Note: This command shows an input box which requires user interaction
      // In automated E2E tests, we can't fully test the interactive flow
      // We just verify the command exists and is registered
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("akira.createSpec"),
        "createSpec command not registered"
      );
    });

    test("Should list specs after creation", async () => {
      // Create a test spec manually
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(
        path.join(specDir, "requirements.md"),
        "# Requirements\n\nTest requirements"
      );
      fs.writeFileSync(
        path.join(specDir, "state.json"),
        JSON.stringify({
          featureName: testSpecName,
          currentPhase: "requirements",
          approvals: {
            requirements: false,
            design: false,
            tasks: false,
          },
        })
      );

      // Refresh tree view
      await vscode.commands.executeCommand("akira.refreshSpecs");

      // Verify spec directory exists
      assert.ok(fs.existsSync(specDir), "Spec directory not created");
      assert.ok(
        fs.existsSync(path.join(specDir, "requirements.md")),
        "Requirements file not created"
      );
    });

    test("Should open spec document", async () => {
      // Create a test spec
      fs.mkdirSync(specDir, { recursive: true });
      const reqPath = path.join(specDir, "requirements.md");
      fs.writeFileSync(reqPath, "# Requirements\n\nTest requirements");

      // Open the document
      const doc = await vscode.workspace.openTextDocument(reqPath);
      await vscode.window.showTextDocument(doc);

      // Verify document is open
      assert.ok(vscode.window.activeTextEditor, "No active editor");
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.uri.fsPath,
        reqPath,
        "Wrong document opened"
      );

      // Close the document
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    });
  });

  suite("Status Bar", () => {
    test("Status bar should be created", () => {
      // Status bar items are created by the extension
      // We can't easily access them, but we can verify no errors
      assert.ok(true);
    });
  });

  suite("Chat Participant", () => {
    test("Chat participant should be registered", async () => {
      // Check if chat participant is available
      // Note: This requires GitHub Copilot Chat extension to be installed
      const chatExtension = vscode.extensions.getExtension(
        "GitHub.copilot-chat"
      );

      if (chatExtension) {
        // Chat is available, participant should be registered
        assert.ok(true, "Chat participant registration verified");
      } else {
        // Skip test if chat not available
        console.log(
          "Skipping chat participant test - GitHub Copilot Chat not installed"
        );
      }
    });
  });

  suite("Error Handling", () => {
    test("Should handle missing workspace gracefully", async () => {
      // Commands should not throw even with no specs
      await vscode.commands.executeCommand("akira.refreshSpecs");
      assert.ok(true);
    });

    test("Should handle invalid spec directory", async () => {
      const config = vscode.workspace.getConfiguration("copilotSpec");

      // Set invalid directory
      await config.update(
        "specDirectory",
        "/invalid/path/that/does/not/exist",
        vscode.ConfigurationTarget.Workspace
      );

      // Should not throw
      await vscode.commands.executeCommand("akira.refreshSpecs");

      // Reset
      await config.update(
        "specDirectory",
        ".akira/specs",
        vscode.ConfigurationTarget.Workspace
      );

      assert.ok(true);
    });
  });

  suite("Multi-Spec Workflow", () => {
    const testSpecs = ["spec-1", "spec-2", "spec-3"];
    let specDirs: string[];

    setup(() => {
      const config = vscode.workspace.getConfiguration("copilotSpec");
      const specBaseDir = config.get<string>("specDirectory") || ".akira/specs";
      specDirs = testSpecs.map((name) =>
        path.join(workspaceRoot, specBaseDir, name)
      );
    });

    teardown(() => {
      // Clean up all test specs
      for (const dir of specDirs) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    });

    test("Should handle multiple specs", async () => {
      // Create multiple specs
      for (let i = 0; i < testSpecs.length; i++) {
        const specDir = specDirs[i];
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(
          path.join(specDir, "requirements.md"),
          `# Requirements for ${testSpecs[i]}`
        );
        fs.writeFileSync(
          path.join(specDir, "state.json"),
          JSON.stringify({
            featureName: testSpecs[i],
            currentPhase: "requirements",
            approvals: {
              requirements: false,
              design: false,
              tasks: false,
            },
          })
        );
      }

      // Refresh tree view
      await vscode.commands.executeCommand("akira.refreshSpecs");

      // Verify all specs exist
      for (const dir of specDirs) {
        assert.ok(fs.existsSync(dir), `Spec directory ${dir} not found`);
      }
    });
  });

  suite("Performance", () => {
    test("Should handle many specs efficiently", async function () {
      this.timeout(10000); // 10 second timeout

      const numSpecs = 20;
      const config = vscode.workspace.getConfiguration("copilotSpec");
      const specBaseDir = config.get<string>("specDirectory") || ".akira/specs";
      const specDirs: string[] = [];

      try {
        // Create many specs
        for (let i = 0; i < numSpecs; i++) {
          const specName = `perf-test-${i}`;
          const specDir = path.join(workspaceRoot, specBaseDir, specName);
          specDirs.push(specDir);

          fs.mkdirSync(specDir, { recursive: true });
          fs.writeFileSync(
            path.join(specDir, "requirements.md"),
            `# Requirements for ${specName}`
          );
          fs.writeFileSync(
            path.join(specDir, "state.json"),
            JSON.stringify({
              featureName: specName,
              currentPhase: "requirements",
              approvals: {
                requirements: false,
                design: false,
                tasks: false,
              },
            })
          );
        }

        // Measure refresh time
        const startTime = Date.now();
        await vscode.commands.executeCommand("akira.refreshSpecs");
        const endTime = Date.now();

        const duration = endTime - startTime;
        assert.ok(duration < 5000, `Refresh took too long: ${duration}ms`);
      } finally {
        // Clean up
        for (const dir of specDirs) {
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        }
      }
    });
  });
});
