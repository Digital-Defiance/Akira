/**
 * Spec Workflow E2E Tests
 * Tests the complete spec lifecycle from creation through execution
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("Spec Workflow E2E Tests", () => {
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

  test("Complete workflow: Create -> Requirements -> Design -> Tasks -> Execute", async function () {
    this.timeout(15000);

    const featureName = "user-authentication";
    const featureDir = path.join(specDir, featureName);

    // 1. Create spec structure
    fs.mkdirSync(featureDir, { recursive: true });

    // 2. Create requirements
    const requirementsContent = `# Requirements

## Functional Requirements

- [ ] FR-1: WHEN user enters valid credentials, THEN system SHALL authenticate user
- [ ] FR-2: WHEN user enters invalid credentials, THEN system SHALL reject authentication
- [ ] FR-3: IF user is authenticated, THEN system SHALL provide access token

## Non-Functional Requirements

- [ ] NFR-1: System SHALL respond to authentication requests within 500ms
- [ ] NFR-2: System SHALL encrypt passwords using bcrypt
`;

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      requirementsContent
    );

    // 3. Create design
    const designContent = `# Design

## Architecture

- Authentication service with JWT tokens
- Password hashing with bcrypt
- Token expiration after 24 hours

## Components

### AuthService
- \`authenticate(username, password)\`: Validates credentials
- \`generateToken(userId)\`: Creates JWT token
- \`validateToken(token)\`: Verifies token validity

### UserRepository
- \`findByUsername(username)\`: Retrieves user
- \`verifyPassword(hash, password)\`: Checks password

## Correctness Properties

1. **Authentication Idempotency**: Authenticating with same credentials multiple times produces same result
2. **Token Validity**: Generated tokens are always valid until expiration
3. **Password Security**: Passwords are never stored in plain text
`;

    fs.writeFileSync(path.join(featureDir, "design.md"), designContent);

    // 4. Create tasks
    const tasksContent = `# Tasks

## Implementation Tasks

- [ ] Task 1: Create AuthService class
  - Success criteria: Class exists with authenticate method
  - Estimated effort: 2 hours

- [ ] Task 2: Implement password hashing
  - Success criteria: Passwords are hashed with bcrypt
  - Estimated effort: 1 hour

- [ ] Task 3: Implement JWT token generation
  - Success criteria: Tokens are generated and validated
  - Estimated effort: 2 hours

- [ ] Task 4: Add authentication endpoint
  - Success criteria: POST /auth/login returns token
  - Estimated effort: 1 hour

- [ ] Task 5: Write unit tests
  - Success criteria: All tests pass, >80% coverage
  - Estimated effort: 3 hours
`;

    fs.writeFileSync(path.join(featureDir, "tasks.md"), tasksContent);

    // 5. Create state file
    const stateContent = {
      featureName,
      currentPhase: "requirements",
      approvals: {
        requirements: false,
        design: false,
        tasks: false,
      },
      taskStatuses: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify(stateContent, null, 2)
    );

    // 6. Verify spec was created
    assert.ok(fs.existsSync(featureDir), "Feature directory should exist");
    assert.ok(
      fs.existsSync(path.join(featureDir, "requirements.md")),
      "Requirements file should exist"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "design.md")),
      "Design file should exist"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "tasks.md")),
      "Tasks file should exist"
    );
    assert.ok(
      fs.existsSync(path.join(featureDir, "state.json")),
      "State file should exist"
    );

    // 7. Refresh tree view
    await vscode.commands.executeCommand("akira.refreshSpecs");

    // 8. Approve requirements phase
    await vscode.commands.executeCommand(
      "akira.approvePhase",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    // 9. Verify state was updated
    const updatedState = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(
      updatedState.approvals.requirements,
      true,
      "Requirements should be approved"
    );
  });

  test("Phase transitions: Requirements -> Design -> Tasks", async function () {
    this.timeout(10000);

    const featureName = "phase-transitions";
    const featureDir = path.join(specDir, featureName);

    fs.mkdirSync(featureDir, { recursive: true });

    // Create minimal files
    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      "# Requirements\n\n- [ ] REQ-1: Test requirement"
    );
    fs.writeFileSync(
      path.join(featureDir, "design.md"),
      "# Design\n\nTest design"
    );
    fs.writeFileSync(
      path.join(featureDir, "tasks.md"),
      "# Tasks\n\n- [ ] Task 1: Test task"
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

    // Approve requirements
    await vscode.commands.executeCommand(
      "akira.approvePhase",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    let state = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(state.approvals.requirements, true);

    // Continue to design
    await vscode.commands.executeCommand(
      "akira.continueSpec",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    state = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(state.currentPhase, "design");

    // Approve design
    await vscode.commands.executeCommand(
      "akira.approvePhase",
      vscode.Uri.file(path.join(featureDir, "design.md"))
    );

    state = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(state.approvals.design, true);

    // Continue to tasks
    await vscode.commands.executeCommand(
      "akira.continueSpec",
      vscode.Uri.file(path.join(featureDir, "design.md"))
    );

    state = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(state.currentPhase, "tasks");
  });

  test("Unapprove phase and modify", async function () {
    this.timeout(8000);

    const featureName = "unapprove-test";
    const featureDir = path.join(specDir, featureName);

    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      "# Requirements\n\n- [ ] REQ-1: Original requirement"
    );

    const initialState = {
      featureName,
      currentPhase: "requirements",
      approvals: {
        requirements: true,
        design: false,
        tasks: false,
          },
          taskStatuses: {},
    };

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify(initialState, null, 2)
    );

    // Unapprove
    await vscode.commands.executeCommand(
      "akira.unapprovePhase",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    const state = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(
      state.approvals.requirements,
      false,
      "Requirements should be unapproved"
    );

    // Modify requirements
    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      "# Requirements\n\n- [ ] REQ-1: Modified requirement\n- [ ] REQ-2: New requirement"
    );

    // Re-approve
    await vscode.commands.executeCommand(
      "akira.approvePhase",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    const updatedState = JSON.parse(
      fs.readFileSync(path.join(featureDir, "state.json"), "utf-8")
    );
    assert.strictEqual(updatedState.approvals.requirements, true);
  });

  test("Delete spec removes all files", async function () {
    this.timeout(5000);

    const featureName = "delete-test";
    const featureDir = path.join(specDir, featureName);

    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(path.join(featureDir, "requirements.md"), "# Test");
    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName })
    );

    assert.ok(fs.existsSync(featureDir), "Spec directory should exist");

    // Delete spec
    await vscode.commands.executeCommand(
      "akira.deleteSpec",
      vscode.Uri.file(featureDir)
    );

    // Wait for deletion
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(
      !fs.existsSync(featureDir),
      "Spec directory should be deleted"
    );
  });
});
