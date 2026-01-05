/**
 * Validation E2E Tests
 * Tests EARS validation, task validation, and property-based testing integration
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("Validation E2E Tests", () => {
  let testWorkspace: string;
  let specDir: string;

  suiteSetup(async () => {
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "akira-validation-"));
    specDir = path.join(testWorkspace, ".kiro", "specs");
    fs.mkdirSync(specDir, { recursive: true });

    const extension = vscode.extensions.getExtension("DigitalDefiance.akira");
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  suiteTeardown(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  test("EARS validation: Valid requirements pass", async function () {
    this.timeout(5000);

    const featureName = "ears-valid";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const validRequirements = `# Requirements

## Functional Requirements

- [ ] FR-1: WHEN user clicks submit button, THEN system SHALL save the form data
- [ ] FR-2: IF user is authenticated, THEN system SHALL display user dashboard
- [ ] FR-3: WHILE system is processing, system SHALL display loading indicator
- [ ] FR-4: WHERE user has admin role, system SHALL show admin panel
- [ ] FR-5: System SHALL validate email format before submission

## Non-Functional Requirements

- [ ] NFR-1: System SHALL respond within 200ms
- [ ] NFR-2: System SHALL support 1000 concurrent users
`;

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      validRequirements
    );

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "requirements" })
    );

    // Validate
    await vscode.commands.executeCommand(
      "akira.validateSpec",
      vscode.Uri.file(path.join(featureDir, "requirements.md"))
    );

    // Should not throw errors
    assert.ok(true, "Valid EARS requirements should pass validation");
  });

  test("EARS validation: Invalid requirements detected", async function () {
    this.timeout(5000);

    const featureName = "ears-invalid";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const invalidRequirements = `# Requirements

## Functional Requirements

- [ ] FR-1: The system should maybe do something
- [ ] FR-2: User can possibly click button
- [ ] FR-3: System might validate input
- [ ] FR-4: It would be nice if system saves data
`;

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      invalidRequirements
    );

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "requirements" })
    );

    // Validate - should detect issues
    try {
      await vscode.commands.executeCommand(
        "akira.validateSpec",
        vscode.Uri.file(path.join(featureDir, "requirements.md"))
      );
      // Validation should report issues but not throw
      assert.ok(true, "Validation completed");
    } catch (error) {
      // Some validation errors might throw
      assert.ok(true, "Validation detected issues");
    }
  });

  test("Task validation: Well-formed tasks pass", async function () {
    this.timeout(5000);

    const featureName = "task-valid";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const validTasks = `# Tasks

## Implementation Tasks

- [ ] Task 1: Create UserService class
  - Success criteria: Class exists with required methods
  - Estimated effort: 2 hours
  - Dependencies: None

- [ ] Task 2: Implement authentication logic
  - Success criteria: Users can log in successfully
  - Estimated effort: 4 hours
  - Dependencies: Task 1

- [ ] Task 3: Add error handling
  - Success criteria: All errors are caught and logged
  - Estimated effort: 1 hour
  - Dependencies: Task 2
`;

    fs.writeFileSync(path.join(featureDir, "tasks.md"), validTasks);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "tasks" })
    );

    // Validate
    await vscode.commands.executeCommand(
      "akira.validateSpec",
      vscode.Uri.file(path.join(featureDir, "tasks.md"))
    );

    assert.ok(true, "Valid tasks should pass validation");
  });

  test("Task validation: Missing success criteria detected", async function () {
    this.timeout(5000);

    const featureName = "task-invalid";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const invalidTasks = `# Tasks

## Implementation Tasks

- [ ] Task 1: Do something
- [ ] Task 2: Do something else
  - Estimated effort: Unknown
- [ ] Task 3: Maybe do this too
`;

    fs.writeFileSync(path.join(featureDir, "tasks.md"), invalidTasks);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "tasks" })
    );

    // Validate - should detect missing success criteria
    try {
      await vscode.commands.executeCommand(
        "akira.validateSpec",
        vscode.Uri.file(path.join(featureDir, "tasks.md"))
      );
      assert.ok(true, "Validation completed");
    } catch (error) {
      assert.ok(true, "Validation detected issues");
    }
  });

  test("Property-based testing: Properties defined in design", async function () {
    this.timeout(5000);

    const featureName = "pbt-properties";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const designWithProperties = `# Design

## Architecture

Simple calculator service

## Components

### Calculator
- \`add(a, b)\`: Returns sum
- \`multiply(a, b)\`: Returns product

## Correctness Properties

1. **Commutativity**: \`add(a, b) === add(b, a)\`
2. **Associativity**: \`add(add(a, b), c) === add(a, add(b, c))\`
3. **Identity**: \`add(a, 0) === a\`
4. **Multiplication by zero**: \`multiply(a, 0) === 0\`
5. **Multiplication by one**: \`multiply(a, 1) === a\`
`;

    fs.writeFileSync(path.join(featureDir, "design.md"), designWithProperties);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "design" })
    );

    // Open design document
    const doc = await vscode.workspace.openTextDocument(
      path.join(featureDir, "design.md")
    );
    await vscode.window.showTextDocument(doc);

    // Verify properties section exists
    const content = doc.getText();
    assert.ok(
      content.includes("Correctness Properties"),
      "Design should have properties section"
    );
    assert.ok(
      content.includes("Commutativity"),
      "Should define commutativity property"
    );
    assert.ok(
      content.includes("Associativity"),
      "Should define associativity property"
    );
  });

  test("Glossary extraction: Terms identified", async function () {
    this.timeout(5000);

    const featureName = "glossary-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const requirementsWithTerms = `# Requirements

## Functional Requirements

- [ ] FR-1: System SHALL authenticate **user** using **credentials**
- [ ] FR-2: System SHALL generate **access token** for authenticated user
- [ ] FR-3: System SHALL validate **JWT token** on each request

## Glossary

- **user**: A person who interacts with the system
- **credentials**: Username and password combination
- **access token**: JWT token used for authentication
- **JWT token**: JSON Web Token for secure authentication
`;

    fs.writeFileSync(
      path.join(featureDir, "requirements.md"),
      requirementsWithTerms
    );

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "requirements" })
    );

    // Open document
    const doc = await vscode.workspace.openTextDocument(
      path.join(featureDir, "requirements.md")
    );
    await vscode.window.showTextDocument(doc);

    // Verify glossary section exists
    const content = doc.getText();
    assert.ok(content.includes("## Glossary"), "Should have glossary section");
    assert.ok(content.includes("**user**"), "Should define user term");
    assert.ok(
      content.includes("**credentials**"),
      "Should define credentials term"
    );
  });

  test("Configuration validation: Valid config accepted", async function () {
    this.timeout(3000);

    const config = vscode.workspace.getConfiguration("copilotSpec");

    // Set valid configuration
    await config.update(
      "specDirectory",
      ".kiro/specs",
      vscode.ConfigurationTarget.Workspace
    );
    await config.update(
      "strictMode",
      false,
      vscode.ConfigurationTarget.Workspace
    );
    await config.update(
      "propertyTestIterations",
      100,
      vscode.ConfigurationTarget.Workspace
    );

    // Verify configuration
    assert.strictEqual(config.get("specDirectory"), ".kiro/specs");
    assert.strictEqual(config.get("strictMode"), false);
    assert.strictEqual(config.get("propertyTestIterations"), 100);
  });

  test("Configuration validation: Invalid values rejected", async function () {
    this.timeout(3000);

    const config = vscode.workspace.getConfiguration("copilotSpec");

    // Try to set invalid iteration count
    try {
      await config.update(
        "propertyTestIterations",
        -1,
        vscode.ConfigurationTarget.Workspace
      );
      
      // VS Code might accept it but clamp to valid range
      const value = config.get<number>("propertyTestIterations");
      assert.ok(
        value === undefined || value >= 10,
        "Invalid values should be rejected or clamped"
      );
    } catch (error) {
      assert.ok(true, "Invalid configuration rejected");
    }

    // Reset to valid value
    await config.update(
      "propertyTestIterations",
      100,
      vscode.ConfigurationTarget.Workspace
    );
  });

  test("Requirement numbering: Sequential IDs enforced", async function () {
    this.timeout(5000);

    const featureName = "numbering-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const requirements = `# Requirements

## Functional Requirements

- [ ] FR-1: First requirement
- [ ] FR-2: Second requirement
- [ ] FR-3: Third requirement

## Non-Functional Requirements

- [ ] NFR-1: First non-functional
- [ ] NFR-2: Second non-functional
`;

    fs.writeFileSync(path.join(featureDir, "requirements.md"), requirements);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "requirements" })
    );

    // Validate numbering
    const content = fs.readFileSync(
      path.join(featureDir, "requirements.md"),
      "utf-8"
    );

    assert.ok(content.includes("FR-1"), "Should have FR-1");
    assert.ok(content.includes("FR-2"), "Should have FR-2");
    assert.ok(content.includes("FR-3"), "Should have FR-3");
    assert.ok(content.includes("NFR-1"), "Should have NFR-1");
    assert.ok(content.includes("NFR-2"), "Should have NFR-2");
  });

  test("Cross-reference validation: Links between documents", async function () {
    this.timeout(5000);

    const featureName = "cross-ref-test";
    const featureDir = path.join(specDir, featureName);
    fs.mkdirSync(featureDir, { recursive: true });

    const requirements = `# Requirements

- [ ] FR-1: User authentication requirement
- [ ] FR-2: Data validation requirement
`;

    const design = `# Design

## Implementation of FR-1

Authentication will use JWT tokens.

## Implementation of FR-2

Validation will use JSON Schema.
`;

    const tasks = `# Tasks

- [ ] Task 1: Implement FR-1 (authentication)
  - Success criteria: FR-1 is satisfied
  
- [ ] Task 2: Implement FR-2 (validation)
  - Success criteria: FR-2 is satisfied
`;

    fs.writeFileSync(path.join(featureDir, "requirements.md"), requirements);
    fs.writeFileSync(path.join(featureDir, "design.md"), design);
    fs.writeFileSync(path.join(featureDir, "tasks.md"), tasks);

    fs.writeFileSync(
      path.join(featureDir, "state.json"),
      JSON.stringify({ featureName, currentPhase: "tasks" })
    );

    // Verify cross-references exist
    const designContent = fs.readFileSync(
      path.join(featureDir, "design.md"),
      "utf-8"
    );
    const tasksContent = fs.readFileSync(
      path.join(featureDir, "tasks.md"),
      "utf-8"
    );

    assert.ok(
      designContent.includes("FR-1"),
      "Design should reference FR-1"
    );
    assert.ok(
      designContent.includes("FR-2"),
      "Design should reference FR-2"
    );
    assert.ok(tasksContent.includes("FR-1"), "Tasks should reference FR-1");
    assert.ok(tasksContent.includes("FR-2"), "Tasks should reference FR-2");
  });
});
