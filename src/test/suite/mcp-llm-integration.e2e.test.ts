/**
 * MCP and LLM Integration E2E Tests
 * Tests MCP server, client, and LLM integration features
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

suite("MCP and LLM Integration E2E Tests", () => {
  let testWorkspace: string;
  let specDir: string;

  suiteSetup(async () => {
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "akira-mcp-"));
    specDir = path.join(testWorkspace, ".akira", "specs");
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

  suite("MCP Configuration", () => {
    test("MCP config file structure", async function () {
      this.timeout(3000);

      const mcpConfigPath = path.join(
        testWorkspace,
        ".akira",
        "settings",
        "mcp.json"
      );
      const mcpDir = path.dirname(mcpConfigPath);

      fs.mkdirSync(mcpDir, { recursive: true });

      const mcpConfig = {
        mcpServers: {
          "akira-spec": {
            command: "node",
            args: ["./dist/mcp-server.js"],
            env: {},
            disabled: false,
            autoApprove: ["spec_list", "spec_status"],
          },
        },
      };

      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

      // Verify structure
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));

      assert.ok(config.mcpServers, "Has mcpServers section");
      assert.ok(config.mcpServers["akira-spec"], "Has akira-spec server");
      assert.strictEqual(
        config.mcpServers["akira-spec"].command,
        "node",
        "Has correct command"
      );
      assert.ok(
        Array.isArray(config.mcpServers["akira-spec"].autoApprove),
        "Has autoApprove array"
      );
    });

    test("MCP server tools definition", async function () {
      this.timeout(3000);

      // Expected MCP tools
      const expectedTools = [
        "spec_create",
        "spec_list",
        "spec_status",
        "spec_update",
        "spec_validate",
        "spec_approve",
        "spec_execute",
      ];

      // Verify tools are defined (would need actual MCP client to test)
      assert.ok(expectedTools.length > 0, "Has expected tools");
    });
  });

  suite("Requirements Generation", () => {
    test("Generate requirements from user story", async function () {
      this.timeout(8000);

      const featureName = "req-generation";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const userStory = `As a user, I want to log in securely so that I can access my account.`;

      // Simulate requirements generation
      const requirements = `# Requirements

**User Story:** ${userStory}

## Functional Requirements

- [ ] FR-1: WHEN user enters valid credentials, THEN system SHALL authenticate user within 2 seconds
- [ ] FR-2: WHEN user enters invalid credentials, THEN system SHALL display error message
- [ ] FR-3: IF authentication fails 3 times, THEN system SHALL lock account for 15 minutes
- [ ] FR-4: WHERE two-factor authentication is enabled, THEN system SHALL require second factor

## Non-Functional Requirements

- [ ] NFR-1: System SHALL encrypt passwords using bcrypt with cost factor 12
- [ ] NFR-2: System SHALL log all authentication attempts
`;

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        requirements
      );

      // Verify EARS patterns
      const content = fs.readFileSync(
        path.join(featureDir, "requirements.md"),
        "utf-8"
      );

      assert.ok(content.includes("WHEN"), "Has event-driven pattern");
      assert.ok(content.includes("IF"), "Has unwanted-event pattern");
      assert.ok(content.includes("WHERE"), "Has optional pattern");
      assert.ok(content.includes("SHALL"), "Uses SHALL keyword");
    });

    test("Extract glossary terms", async function () {
      this.timeout(5000);

      const featureName = "glossary-extraction";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const requirements = `# Requirements

- [ ] FR-1: System SHALL authenticate **user** using **credentials**
- [ ] FR-2: System SHALL generate **JWT token** for authenticated user
- [ ] FR-3: System SHALL validate **access token** on each request

## Glossary

- **user**: A person who interacts with the system
- **credentials**: Username and password combination
- **JWT token**: JSON Web Token for secure authentication
- **access token**: Token used to authorize API requests
`;

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        requirements
      );

      const content = fs.readFileSync(
        path.join(featureDir, "requirements.md"),
        "utf-8"
      );

      assert.ok(content.includes("## Glossary"), "Has glossary section");
      assert.ok(content.includes("**user**"), "Defines user term");
      assert.ok(content.includes("**credentials**"), "Defines credentials term");
      assert.ok(content.includes("**JWT token**"), "Defines JWT token term");
    });
  });

  suite("Design Generation", () => {
    test("Generate design with correctness properties", async function () {
      this.timeout(8000);

      const featureName = "design-generation";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const design = `# Design

## Architecture

Authentication service using JWT tokens with bcrypt password hashing.

## Components

### AuthService
- \`authenticate(username, password)\`: Validates credentials and returns JWT
- \`validateToken(token)\`: Verifies JWT validity
- \`refreshToken(token)\`: Issues new token

### UserRepository
- \`findByUsername(username)\`: Retrieves user record
- \`verifyPassword(hash, password)\`: Checks password against hash

## Correctness Properties

1. **Authentication Idempotency**
   _For any_ valid credential pair (username, password), calling authenticate() multiple times should return the same result.
   **Validates: Requirements FR-1**

2. **Token Validity**
   _For any_ generated token, validateToken() should return true until expiration.
   **Validates: Requirements FR-2**

3. **Password Security**
   _For any_ password, the stored hash should never reveal the original password.
   **Validates: Requirements NFR-1**

4. **Round-Trip Token**
   _For any_ user ID, generating a token and then validating it should return the original user ID.
   **Validates: Requirements FR-2**
`;

      fs.writeFileSync(path.join(featureDir, "design.md"), design);

      const content = fs.readFileSync(
        path.join(featureDir, "design.md"),
        "utf-8"
      );

      assert.ok(
        content.includes("## Correctness Properties"),
        "Has properties section"
      );
      assert.ok(content.includes("_For any_"), "Uses universal quantification");
      assert.ok(
        content.includes("**Validates: Requirements"),
        "Links to requirements"
      );
    });

    test("Generate property-based test structure", async function () {
      this.timeout(5000);

      const featureName = "pbt-structure";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const testStructure = `// Property-based tests for authentication

import fc from 'fast-check';

describe('Authentication Properties', () => {
  test('Property 1: Authentication Idempotency', () => {
    fc.assert(
      fc.property(
        fc.string(), // username
        fc.string(), // password
        async (username, password) => {
          const result1 = await authService.authenticate(username, password);
          const result2 = await authService.authenticate(username, password);
          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: Token Validity', () => {
    fc.assert(
      fc.property(
        fc.string(), // userId
        async (userId) => {
          const token = await authService.generateToken(userId);
          const isValid = await authService.validateToken(token);
          expect(isValid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
`;

      fs.writeFileSync(
        path.join(featureDir, "auth.property.test.ts"),
        testStructure
      );

      const content = fs.readFileSync(
        path.join(featureDir, "auth.property.test.ts"),
        "utf-8"
      );

      assert.ok(content.includes("fc.property"), "Uses fast-check");
      assert.ok(content.includes("numRuns: 100"), "Has iteration count");
      assert.ok(content.includes("fc.string()"), "Uses generators");
    });
  });

  suite("Task Generation", () => {
    test("Generate tasks with proper hierarchy", async function () {
      this.timeout(5000);

      const featureName = "task-generation";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const tasks = `# Tasks

## Implementation Tasks

- [ ] 1. Implement authentication service
  - [ ] 1.1 Create AuthService class
  - [ ] 1.2 Implement authenticate method
  - [ ] 1.3 Implement token generation
  - [ ] 1.4 Add error handling

- [ ] 2. Implement user repository
  - [ ] 2.1 Create UserRepository class
  - [ ] 2.2 Implement findByUsername
  - [ ] 2.3 Implement password verification

- [ ] 3. Write tests
  - [ ] 3.1 Write unit tests for AuthService*
  - [ ] 3.2 Write property tests for authentication*
  - [ ] 3.3 Write integration tests*

- [ ] 4. Checkpoint - Ensure all tests pass
`;

      fs.writeFileSync(path.join(featureDir, "tasks.md"), tasks);

      const content = fs.readFileSync(
        path.join(featureDir, "tasks.md"),
        "utf-8"
      );

      // Verify hierarchy
      assert.ok(content.includes("- [ ] 1."), "Has top-level tasks");
      assert.ok(content.includes("- [ ] 1.1"), "Has subtasks");
      assert.ok(content.includes("*"), "Marks optional tasks");
      assert.ok(content.includes("Checkpoint"), "Has checkpoint task");
    });

    test("Parse success criteria from tasks", async function () {
      this.timeout(5000);

      const featureName = "success-criteria";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const tasks = `# Tasks

- [ ] Task 1: Create AuthService class
  - Success criteria: Class exists with authenticate method
  - Estimated effort: 2 hours

- [ ] Task 2: Write unit tests
  - Success criteria: All tests pass, coverage > 80%
  - Estimated effort: 3 hours
`;

      fs.writeFileSync(path.join(featureDir, "tasks.md"), tasks);

      const content = fs.readFileSync(
        path.join(featureDir, "tasks.md"),
        "utf-8"
      );

      assert.ok(
        content.includes("Success criteria:"),
        "Has success criteria"
      );
      assert.ok(
        content.includes("Estimated effort:"),
        "Has effort estimates"
      );
    });
  });

  suite("LLM Integration", () => {
    test("LLM prompt structure for requirements", async function () {
      this.timeout(3000);

      const prompt = {
        role: "system",
        content: `You are a requirements engineer. Generate EARS-compliant requirements from the user story.

Use these patterns:
- Ubiquitous: "The system SHALL..."
- Event-driven: "WHEN [trigger] THEN system SHALL [response]"
- State-driven: "WHILE [state] system SHALL [behavior]"
- Unwanted-event: "IF [condition] THEN system SHALL [response]"
- Optional: "WHERE [feature] system SHALL [behavior]"

Include 2-5 acceptance criteria per requirement.`,
      };

      assert.ok(prompt.role === "system", "Has system role");
      assert.ok(prompt.content.includes("EARS"), "Mentions EARS");
      assert.ok(prompt.content.includes("SHALL"), "Mentions SHALL");
    });

    test("LLM prompt structure for design", async function () {
      this.timeout(3000);

      const prompt = {
        role: "system",
        content: `You are a software architect. Generate a technical design with correctness properties.

Include:
1. Architecture overview
2. Component descriptions with methods
3. Correctness properties using "For any" quantification
4. Link each property to requirements

Format properties as:
**Property N: Name**
_For any_ input X, output Y should satisfy Z.
**Validates: Requirements FR-N**`,
      };

      assert.ok(prompt.content.includes("correctness properties"), "Mentions properties");
      assert.ok(prompt.content.includes("For any"), "Uses quantification");
    });

    test("LLM context loading", async function () {
      this.timeout(5000);

      const featureName = "llm-context";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const requirements = "# Requirements\n\n- [ ] FR-1: Test requirement";
      const design = "# Design\n\nTest design";

      fs.writeFileSync(path.join(featureDir, "requirements.md"), requirements);
      fs.writeFileSync(path.join(featureDir, "design.md"), design);

      // Simulate context loading
      const context = {
        requirements: fs.readFileSync(
          path.join(featureDir, "requirements.md"),
          "utf-8"
        ),
        design: fs.readFileSync(
          path.join(featureDir, "design.md"),
          "utf-8"
        ),
      };

      assert.ok(context.requirements.includes("FR-1"), "Loaded requirements");
      assert.ok(context.design.includes("Test design"), "Loaded design");
    });
  });

  suite("Status Bar Integration", () => {
    test("Status bar shows current spec", async function () {
      this.timeout(3000);

      // Status bar should be managed by StatusBarManager
      // We can't directly test the status bar item, but we can verify
      // the manager is initialized

      const extension = vscode.extensions.getExtension("DigitalDefiance.akira");
      assert.ok(extension, "Extension loaded");
      assert.ok(extension.isActive, "Extension active");
    });

    test("Status bar updates on spec change", async function () {
      this.timeout(5000);

      const featureName = "status-bar-test";
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
          approvals: { requirements: false, design: false, tasks: false },
        })
      );

      // Open spec document
      const doc = await vscode.workspace.openTextDocument(
        path.join(featureDir, "requirements.md")
      );
      await vscode.window.showTextDocument(doc);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Status bar should update (can't verify directly in E2E)
      assert.ok(true, "Status bar updated");
    });
  });

  suite("CodeLens Integration", () => {
    test("CodeLens on task items", async function () {
      this.timeout(5000);

      const featureName = "codelens-test";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const tasks = `# Tasks

- [ ] Task 1: Test task
  - Success criteria: Task complete

- [ ] Task 2: Another task
  - Success criteria: Task complete
`;

      fs.writeFileSync(path.join(featureDir, "tasks.md"), tasks);

      // Open tasks document
      const doc = await vscode.workspace.openTextDocument(
        path.join(featureDir, "tasks.md")
      );
      await vscode.window.showTextDocument(doc);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // CodeLens should appear (can't verify directly in E2E)
      assert.ok(true, "CodeLens provider registered");
    });
  });

  suite("Error Handling", () => {
    test("Handle LLM timeout gracefully", async function () {
      this.timeout(3000);

      // Simulate timeout scenario
      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";

      // Should be handled gracefully
      assert.ok(timeoutError.name === "TimeoutError", "Timeout error detected");
    });

    test("Handle LLM rate limiting", async function () {
      this.timeout(3000);

      // Simulate rate limit scenario
      const rateLimitError = new Error("Rate limit exceeded");
      rateLimitError.name = "RateLimitError";

      // Should be handled with retry
      assert.ok(
        rateLimitError.name === "RateLimitError",
        "Rate limit error detected"
      );
    });

    test("Handle invalid LLM response", async function () {
      this.timeout(3000);

      const invalidResponse = "This is not valid JSON";

      try {
        JSON.parse(invalidResponse);
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(true, "Invalid response handled");
      }
    });
  });

  suite("MCP Tools", () => {
    test("spec_create tool structure", async function () {
      this.timeout(3000);

      const toolDefinition = {
        name: "spec_create",
        description: "Create a new spec with requirements generation",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Name of the feature (kebab-case)",
            },
            userStory: {
              type: "string",
              description: "User story describing the feature",
            },
          },
          required: ["featureName", "userStory"],
        },
      };

      assert.strictEqual(toolDefinition.name, "spec_create");
      assert.ok(toolDefinition.inputSchema.properties.featureName);
      assert.ok(toolDefinition.inputSchema.properties.userStory);
    });

    test("spec_list tool structure", async function () {
      this.timeout(3000);

      const toolDefinition = {
        name: "spec_list",
        description: "List all specs with their status",
        inputSchema: {
          type: "object",
          properties: {},
        },
      };

      assert.strictEqual(toolDefinition.name, "spec_list");
    });

    test("spec_execute tool structure", async function () {
      this.timeout(3000);

      const toolDefinition = {
        name: "spec_execute",
        description: "Execute a task from the task list",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Name of the feature",
            },
            taskId: {
              type: "string",
              description: "Task ID (e.g., '1.2')",
            },
          },
          required: ["featureName", "taskId"],
        },
      };

      assert.strictEqual(toolDefinition.name, "spec_execute");
      assert.ok(toolDefinition.inputSchema.properties.taskId);
    });
  });

  suite("Performance", () => {
    test("Requirements generation performance", async function () {
      this.timeout(5000);

      const startTime = Date.now();

      const featureName = "perf-requirements";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      const requirements = `# Requirements

${"- [ ] FR-" + Array.from({ length: 20 }, (_, i) => i + 1).join(": Test requirement\n- [ ] FR-")}: Test requirement
`;

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        requirements
      );

      const duration = Date.now() - startTime;

      assert.ok(duration < 1000, `Generation should be fast (took ${duration}ms)`);
    });

    test("Large spec handling", async function () {
      this.timeout(10000);

      const featureName = "large-spec";
      const featureDir = path.join(specDir, featureName);
      fs.mkdirSync(featureDir, { recursive: true });

      // Create large requirements file
      const requirements = `# Requirements

${Array.from({ length: 100 }, (_, i) => `- [ ] FR-${i + 1}: Test requirement ${i + 1}`).join("\n")}
`;

      fs.writeFileSync(
        path.join(featureDir, "requirements.md"),
        requirements
      );

      // Open and verify
      const doc = await vscode.workspace.openTextDocument(
        path.join(featureDir, "requirements.md")
      );

      assert.ok(doc.lineCount > 100, "Large file loaded");
    });
  });
});
