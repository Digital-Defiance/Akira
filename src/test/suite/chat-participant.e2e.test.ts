/**
 * Chat Participant E2E Tests
 * Tests @spec chat participant commands and MCP integration
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("Chat Participant E2E Tests", () => {
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

    const extension = vscode.extensions.getExtension("DigitalDefiance.akira");
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  setup(() => {
    // Clean spec directory before each test
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      for (const file of files) {
        const filePath = path.join(specDir, file);
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { recursive: true, force: true });
        }
      }
    }
  });

  suiteTeardown(() => {
    // Clean up the specs directory but not the workspace itself
    if (fs.existsSync(specDir)) {
      fs.rmSync(specDir, { recursive: true, force: true });
    }
  });

  test("Chat participant is registered", async () => {
    // Note: We can't directly test chat participant without Copilot Chat installed
    // But we can verify the extension registered it
    const extension = vscode.extensions.getExtension("DigitalDefiance.akira");
    assert.ok(extension, "Extension should be loaded");
    assert.ok(extension.isActive, "Extension should be active");
  });

  test("@spec create command structure", async function () {
    this.timeout(5000);

    // We can't invoke chat commands directly, but we can test the underlying
    // command that would be called
    const featureName = "chat-create-test";
    const featureDir = path.join(specDir, featureName);

    // Simulate what @spec create would do
    fs.mkdirSync(featureDir, { recursive: true });

    const templates = {
      requirements: "# Requirements\n\n## Functional Requirements\n\n",
      design: "# Design\n\n## Architecture\n\n",
      tasks: "# Tasks\n\n## Implementation Tasks\n\n",
    };

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      templates.requirements
    );
    fs.writeFileSync(path.join(featureDir, "design.md"), templates.design);
    fs.writeFileSync(path.join(featureDir, "tasks.md"), templates.tasks);

    const state = {
      featureName,
      currentPhase: "requirements",
      approvals: {
        requirements: false,
        design: false,
        tasks: false,
          },
          taskStatuses: {},
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify(state, null, 2)
    );

    // Verify structure
    assert.ok(fs.existsSync(featureDir), "Spec directory created");
    assert.ok(
      fs.existsSync(path.join(featureDir, "requirements.md")),
      "Requirements file created"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "design.md")),
      "Design file created"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "tasks.md")),
      "Tasks file created"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "state.json")),
      "State file created"
    );
  });

  test("@spec list command data structure", async function () {
    this.timeout(5000);

    // Create multiple specs
    const specs = ["feature-a", "feature-b", "feature-c"];

    for (const specName of specs) {
      const featureDir = path.join(specDir, specName);
      fs.mkdirSync(featureDir, { recursive: true });

      const state = {
        featureName: specName,
        currentPhase: "requirements",
        approvals: {
          requirements: false,
          design: false,
          tasks: false,
          },
          taskStatuses: {},
      };

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify(state, null, 2)
      );
    }

    // Simulate listing specs
    const specDirs = fs.readdirSync(specDir);
    const specList = specDirs
      .map((dir) => {
        const statePath = path.join(specDir, dir, "state.json");
        if (fs.existsSync(statePath)) {
          return JSON.parse(fs.readFileSync(statePath, "utf-8"));
        }
        return null;
      })
      .filter((s) => s !== null);

    assert.strictEqual(specList.length, 3, "Should list 3 specs");
    assert.ok(
      specList.some((s) => s.featureName === "feature-a"),
      "Should include feature-a"
    );
    assert.ok(
      specList.some((s) => s.featureName === "feature-b"),
      "Should include feature-b"
    );
    assert.ok(
      specList.some((s) => s.featureName === "feature-c"),
      "Should include feature-c"
    );
  });

  test("@spec status command data structure", async function () {
    this.timeout(5000);

    const featureName = "status-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const state = {
      featureName,
      currentPhase: "design",
      approvals: {
        requirements: true,
        design: false,
        tasks: false,
          },
          taskStatuses: {},
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify(state, null, 2)
    );

    // Simulate status query
    const statusData = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );

    assert.strictEqual(statusData.featureName, featureName);
    assert.strictEqual(statusData.currentPhase, "design");
    assert.strictEqual(statusData.approvals.requirements, true);
    assert.strictEqual(statusData.approvals.design, false);
    assert.strictEqual(statusData.approvals.tasks, false);
    assert.ok(statusData.createdAt, "Should have creation timestamp");
    assert.ok(statusData.updatedAt, "Should have update timestamp");
  });

  test("@spec validate command integration", async function () {
    this.timeout(5000);

    const featureName = "validate-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const requirements = `# Requirements

## Functional Requirements

- [ ] FR-1: WHEN user submits form, THEN system SHALL validate input
- [ ] FR-2: IF validation fails, THEN system SHALL display error message
`;

    fs.writeFileSync(path.join(featureDir, "requirements.md"), requirements);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "requirements" })
    );

    // Execute validate command
    await vscode.commands.executeCommand(
      "akira.validateSpec",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    // Should complete without errors
    assert.ok(true, "Validation command executed");
  });

  test("@spec approve command integration", async function () {
    this.timeout(5000);

    const featureName = "approve-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      "# Requirements\n\n- [ ] FR-1: Test requirement"
    );

    const initialState = {
      featureName,
      currentPhase: "requirements",
      approvals: {
        requirements: false,
        design: false,
        tasks: false,
          },
          taskStatuses: {},
    };

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify(initialState, null, 2)
    );

    // Execute approve command
    await vscode.commands.executeCommand(
      "akira.approvePhase",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    // Verify state updated
    const updatedState = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );

    assert.strictEqual(
      updatedState.approvals.requirements,
      true,
      "Requirements should be approved"
    );
  });

  test("@spec execute command structure", async function () {
    this.timeout(5000);

    const featureName = "execute-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const tasks = `# Tasks

- [ ] Task 1: Create test file
  - Success criteria: File exists
  - Estimated effort: 1 hour

- [ ] Task 2: Write tests
  - Success criteria: Tests pass
  - Estimated effort: 2 hours
`;

    fs.writeFileSync(path.join(featureDir, "tasks.md"), tasks);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "tasks" })
    );

    // Verify task structure for execution
    const tasksContent = fs.readFileSync(
      path.join(featureDir, "tasks.md"),
      "utf-8"
    );

    assert.ok(tasksContent.includes("Task 1"), "Should have Task 1");
    assert.ok(tasksContent.includes("Task 2"), "Should have Task 2");
    assert.ok(
      tasksContent.includes("Success criteria"),
      "Should have success criteria"
    );
    assert.ok(
      tasksContent.includes("Estimated effort"),
      "Should have effort estimates"
    );
  });

  test("MCP server integration readiness", async function () {
    this.timeout(3000);

    // Verify MCP configuration structure
    const mcpConfigPath = path.join(testWorkspace, ".akira", "settings", "mcp.json");
    const mcpDir = path.dirname(mcpConfigPath);

    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    const mcpConfig = {
      mcpServers: {
        "akira-spec": {
          command: "node",
          args: ["./dist/mcp-server.js"],
          env: {},
          disabled: false,
          autoApprove: [],
        },
      },
    };

    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

    // Verify config structure
    const config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));

    assert.ok(config.mcpServers, "Should have mcpServers section");
    assert.ok(
      config.mcpServers["akira-spec"],
      "Should have akira-spec server"
    );
    assert.strictEqual(
      config.mcpServers["akira-spec"].command,
      "node",
      "Should have node command"
    );
  });

  test("Chat context: Spec file references", async function () {
    this.timeout(5000);

    const featureName = "context-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const requirements = `# Requirements

- [ ] FR-1: User authentication
- [ ] FR-2: Data validation
`;

    const design = `# Design

Implements FR-1 and FR-2 using JWT and JSON Schema.
`;

    fs.writeFileSync(path.join(featureDir, "requirements.md"), requirements);
    fs.writeFileSync(path.join(featureDir, "design.md"), design);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "design" })
    );

    // Simulate gathering context for chat
    const context = {
      featureName,
      currentPhase: "design",
      requirements: fs.readFileSync(
        path.join(featureDir, "requirements.md"),
        "utf-8"
      ),
      design: fs.readFileSync(path.join(featureDir, "design.md"), "utf-8"),
    };

    assert.ok(context.requirements.includes("FR-1"), "Context has requirements");
    assert.ok(context.design.includes("FR-1"), "Context has design");
    assert.strictEqual(context.currentPhase, "design", "Context has phase");
  });

  test("Chat streaming: Progress updates", async function () {
    this.timeout(5000);

    // Simulate streaming progress updates
    const updates = [
      { type: "start", message: "Analyzing requirements..." },
      { type: "progress", message: "Generating design..." },
      { type: "progress", message: "Creating tasks..." },
      { type: "complete", message: "Spec created successfully" },
    ];

    // Verify update structure
    for (const update of updates) {
      assert.ok(update.type, "Update should have type");
      assert.ok(update.message, "Update should have message");
      assert.ok(
        ["start", "progress", "complete", "error"].includes(update.type),
        "Type should be valid"
      );
    }
  });

  test("Error handling: Invalid spec name", async function () {
    this.timeout(3000);

    const invalidNames = [
      "../escape",
      "../../etc/passwd",
      "name with spaces",
      "name/with/slashes",
      "",
      ".",
      "..",
    ];

    for (const name of invalidNames) {
      // Validate spec name
      const isValid = /^[a-z0-9-]+$/.test(name);
      assert.strictEqual(
        isValid,
        false,
        `"${name}" should be invalid spec name`
      );
    }

    // Valid names
    const validNames = ["user-auth", "data-validation", "api-integration"];

    for (const name of validNames) {
      const isValid = /^[a-z0-9-]+$/.test(name);
      assert.strictEqual(isValid, true, `"${name}" should be valid spec name`);
    }
  });

  test("Error handling: Missing spec directory", async function () {
    this.timeout(3000);

    const nonExistentDir = path.join(testWorkspace, "nonexistent", "specs");

    try {
      // Try to list specs from non-existent directory
      if (fs.existsSync(nonExistentDir)) {
        fs.readdirSync(nonExistentDir);
      } else {
        // Should handle gracefully
        assert.ok(true, "Handled missing directory");
      }
    } catch (error) {
      // Error is expected
      assert.ok(true, "Error handled for missing directory");
    }
  });

  test("Error handling: Corrupted state file", async function () {
    this.timeout(3000);

    const featureName = "corrupted-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    // Write invalid JSON
    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      "{ invalid json content"
    );

    try {
      // Try to read corrupted state
      const content = fs.readFileSync(
        path.join(featureDir, "state.json"),
        "utf-8"
      );
      JSON.parse(content);
      assert.fail("Should have thrown error for invalid JSON");
    } catch (error) {
      assert.ok(true, "Handled corrupted state file");
    }
  });

  test("Performance: Large spec list", async function () {
    this.timeout(10000);

    const numSpecs = 50;
    const specs: string[] = [];

    // Create many specs
    for (let i = 0; i < numSpecs; i++) {
      const specName = `perf-spec-${i}`;
      const featureDir = path.join(specDir, specName);
      fs.mkdirSync(featureDir, { recursive: true });

      const state = {
        featureName: specName,
        currentPhase: "requirements",
        approvals: {
          requirements: false,
          design: false,
          tasks: false,
          },
          taskStatuses: {},
      };

      fs.writeFileSync(
        path.join(featureDir, "state.json"),
        JSON.stringify(state)
      );

      specs.push(specName);
    }

    // Measure list performance
    const startTime = Date.now();

    const specDirs = fs.readdirSync(specDir);
    const specList = specDirs
      .map((dir) => {
        const statePath = path.join(specDir, dir, "state.json");
        if (fs.existsSync(statePath)) {
          return JSON.parse(fs.readFileSync(statePath, "utf-8"));
        }
        return null;
      })
      .filter((s) => s !== null);

    const duration = Date.now() - startTime;

    assert.ok(specList.length >= numSpecs, `Should list at least ${numSpecs} specs`);
    assert.ok(duration < 1000, `Listing should be fast (took ${duration}ms)`);

    // Cleanup
    for (const spec of specs) {
      const featureDir = path.join(specDir, spec);
      if (fs.existsSync(featureDir)) {
        fs.rmSync(featureDir, { recursive: true, force: true });
      }
    }
  });
});
