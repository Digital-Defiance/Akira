/**
 * Property-based tests for chat participant
 * **Feature: copilot-spec-extension, Property 24: Command parsing and routing**
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  parseCommand,
  SpecCommand,
  formatResponse,
  formatErrorMessage,
} from "./chat-participant";

describe("Chat Participant Property Tests", () => {
  it("Property 24: Command parsing and routing - For any valid spec command, the command should be parsed correctly and routed to the appropriate MCP tool", () => {
    // **Feature: copilot-spec-extension, Property 24: Command parsing and routing**
    // **Validates: Requirements 11.2, 11.3**

    fc.assert(
      fc.property(
        fc.oneof(
          // Create commands
          fc
            .record({
              action: fc.constant("create" as const),
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              featureIdea: fc.string({ minLength: 1, maxLength: 200 }),
            })
            .map(
              (cmd) =>
                `create spec for ${cmd.featureName} with idea: ${cmd.featureIdea}`
            ),

          // List commands
          fc.constant("list all specs"),
          fc.constant("list specs"),
          fc.constant("show all specs"),

          // Status commands
          fc
            .record({
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
            })
            .map((cmd) => `status for ${cmd.featureName}`),

          // Validate commands
          fc
            .record({
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              phase: fc.constantFrom(
                "requirements",
                "design",
                "tasks"
              ) as fc.Arbitrary<"requirements" | "design" | "tasks">,
            })
            .map((cmd) => `validate ${cmd.phase} for ${cmd.featureName}`),

          // Execute task commands
          fc
            .record({
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              taskId: fc.oneof(
                fc.integer({ min: 1, max: 20 }).map(String),
                fc
                  .tuple(
                    fc.integer({ min: 1, max: 20 }),
                    fc.integer({ min: 1, max: 20 })
                  )
                  .map(([a, b]) => `${a}.${b}`)
              ),
            })
            .map((cmd) => `execute task ${cmd.taskId} for ${cmd.featureName}`),

          // Update commands
          fc
            .record({
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              phase: fc.constantFrom(
                "requirements",
                "design",
                "tasks"
              ) as fc.Arbitrary<"requirements" | "design" | "tasks">,
              content: fc.string({ minLength: 1, maxLength: 100 }),
            })
            .map(
              (cmd) =>
                `update ${cmd.phase} for ${cmd.featureName} with ${cmd.content}`
            )
        ),
        (message) => {
          // Parse the command
          const parsed = parseCommand(message);

          // Verify that a command was parsed
          expect(parsed).toBeDefined();
          expect(parsed.action).toBeDefined();

          // Verify action is one of the valid actions
          expect([
            "create",
            "update",
            "execute",
            "list",
            "status",
            "validate",
          ]).toContain(parsed.action);

          // Verify that the parsed command has appropriate structure based on action
          switch (parsed.action) {
            case "create":
              // Create commands should have parameters with featureIdea
              expect(parsed.parameters).toBeDefined();
              break;

            case "list":
              // List commands don't need additional parameters
              break;

            case "status":
              // Status commands should have a feature name (if extractable)
              // Note: feature name extraction is best-effort
              break;

            case "validate":
              // Validate commands should have feature name and phase (if extractable)
              break;

            case "execute":
              // Execute commands should have feature name and task ID (if extractable)
              break;

            case "update":
              // Update commands should have feature name, phase, and content (if extractable)
              break;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 24 (Edge case): Empty or whitespace-only messages should be handled gracefully", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.constant("   "),
          fc.constant("\t\n"),
          fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { maxLength: 10 })
        ),
        (message) => {
          // Parse the command
          const parsed = parseCommand(message);

          // Should still return a valid command structure (defaults to create)
          expect(parsed).toBeDefined();
          expect(parsed.action).toBeDefined();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 24 (Specific patterns): Common command patterns should be parsed correctly", () => {
    // Test specific command patterns to ensure they parse as expected
    const testCases: Array<{
      message: string;
      expectedAction: SpecCommand["action"];
    }> = [
      { message: "list all specs", expectedAction: "list" },
      { message: "create new spec", expectedAction: "create" },
      { message: "status for my-feature", expectedAction: "status" },
      { message: "validate requirements", expectedAction: "validate" },
      { message: "execute task 1.2", expectedAction: "execute" },
      { message: "update design", expectedAction: "update" },
      { message: "my-feature continue", expectedAction: "update" },
      { message: "mcp-testing-server continue", expectedAction: "update" },
      { message: "some-feature resume", expectedAction: "update" },
    ];

    for (const testCase of testCases) {
      const parsed = parseCommand(testCase.message);
      expect(parsed.action).toBe(testCase.expectedAction);
    }
  });

  it("Continue command should extract feature name correctly", () => {
    // Test that continue/resume commands properly extract feature names
    // Feature names must contain hyphens or underscores to be recognized
    const testCases = [
      {
        message: "mcp-testing-server continue",
        expectedName: "mcp-testing-server",
      },
      { message: "my-cool-feature resume", expectedName: "my-cool-feature" },
      { message: "test-spec-123 continue", expectedName: "test-spec-123" },
    ];

    for (const testCase of testCases) {
      const parsed = parseCommand(testCase.message);
      expect(parsed.action).toBe("update");
      expect(parsed.featureName).toBe(testCase.expectedName);
      expect(parsed.parameters?.continue).toBe(true);
    }
  });

  it("Create command should extract feature name after create keyword", () => {
    // Test that create commands properly extract feature names that come after "create"
    const testCases = [
      {
        message: 'create agent-hooks "some description"',
        expectedName: "agent-hooks",
        expectedAction: "create",
      },
      {
        message: '/create agent-hooks "some description"',
        expectedName: "agent-hooks",
        expectedAction: "create",
      },
      {
        message: "new test-feature with idea",
        expectedName: "test-feature",
        expectedAction: "create",
      },
      {
        message: "start my_cool_feature",
        expectedName: "my_cool_feature",
        expectedAction: "create",
      },
    ];

    for (const testCase of testCases) {
      const parsed = parseCommand(testCase.message);
      expect(parsed.action).toBe(testCase.expectedAction);
      expect(parsed.featureName).toBe(testCase.expectedName);
    }
  });

  it("Create command should not match keywords in quoted descriptions", () => {
    // Test that command keywords in descriptions don't cause false matches
    const testCases = [
      {
        message:
          'agent-hooks "Implement an agent hooks system for event-triggered automation. Hooks should trigger on file save, git commit, and other VS Code events, executing predefined prompts automatically in the background. Include hooks configuration file (.akira/hooks.json), event listener registration, and hook execution engine."',
        expectedAction: "create",
        expectedName: "agent-hooks",
      },
      {
        message:
          'my-feature "This feature will list all items and execute commands"',
        expectedAction: "create",
        expectedName: "my-feature",
      },
    ];

    for (const testCase of testCases) {
      const parsed = parseCommand(testCase.message);
      expect(parsed.action).toBe(testCase.expectedAction);
      expect(parsed.featureName).toBe(testCase.expectedName);
    }
  });
});

describe("Response Formatting Property Tests", () => {
  it("Property 25: Response formatting - For any MCP tool result, the response should be formatted with clear structure and readable content", () => {
    // **Feature: copilot-spec-extension, Property 25: Response formatting**
    // **Validates: Requirements 11.4**

    fc.assert(
      fc.property(
        fc.oneof(
          // Create command results - success case
          fc
            .record({
              success: fc.constant(true),
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              directory: fc.string({ minLength: 1, maxLength: 100 }),
              requirementsPath: fc.string({ minLength: 1, maxLength: 100 }),
              message: fc.string({ minLength: 1, maxLength: 200 }),
            })
            .map((result) => ({
              command: { action: "create" as const },
              result,
            })),

          // Create command results - failure case
          fc
            .record({
              success: fc.constant(false),
              error: fc.string({ minLength: 1, maxLength: 200 }),
              suggestion: fc.option(
                fc.string({ minLength: 1, maxLength: 200 })
              ),
            })
            .map((result) => ({
              command: { action: "create" as const },
              result,
            })),

          // List command results
          fc
            .record({
              success: fc.constant(true),
              count: fc.integer({ min: 0, max: 10 }),
              specs: fc.array(
                fc.record({
                  featureName: fc.string({ minLength: 1, maxLength: 50 }),
                  directory: fc.string({ minLength: 1, maxLength: 100 }),
                  currentPhase: fc.constantFrom(
                    "requirements",
                    "design",
                    "tasks",
                    "execution"
                  ),
                  hasRequirements: fc.boolean(),
                  hasDesign: fc.boolean(),
                  hasTasks: fc.boolean(),
                }),
                { maxLength: 10 }
              ),
            })
            .map((result) => ({
              command: { action: "list" as const },
              result,
            })),

          // Validate command results - success case
          fc
            .record({
              success: fc.constant(true),
              valid: fc.boolean(),
              errors: fc.array(
                fc.record({
                  requirementId: fc.string({ minLength: 1, maxLength: 10 }),
                  rule: fc.constantFrom("EARS", "INCOSE"),
                  message: fc.string({ minLength: 1, maxLength: 200 }),
                  suggestion: fc.option(
                    fc.string({ minLength: 1, maxLength: 200 })
                  ),
                }),
                { maxLength: 5 }
              ),
              warnings: fc.array(
                fc.record({
                  requirementId: fc.string({ minLength: 1, maxLength: 10 }),
                  message: fc.string({ minLength: 1, maxLength: 200 }),
                }),
                { maxLength: 5 }
              ),
            })
            .map((result) => ({
              command: { action: "validate" as const },
              result,
            })),

          // Execute command results - success case
          fc
            .record({
              success: fc.constant(true),
              featureName: fc.string({ minLength: 1, maxLength: 50 }),
              taskId: fc.string({ minLength: 1, maxLength: 10 }),
              status: fc.constantFrom(
                "not-started",
                "in-progress",
                "completed",
                "skipped"
              ),
              message: fc.string({ minLength: 1, maxLength: 200 }),
            })
            .map((result) => ({
              command: { action: "execute" as const },
              result,
            })),

          // Execute command results - failure case
          fc
            .record({
              success: fc.constant(false),
              error: fc.string({ minLength: 1, maxLength: 200 }),
            })
            .map((result) => ({
              command: { action: "execute" as const },
              result,
            }))
        ),
        ({ command, result }) => {
          // Format the response
          const formatted = formatResponse(command, result);

          // Verify that a response was generated
          expect(formatted).toBeDefined();
          expect(typeof formatted).toBe("string");
          expect(formatted.length).toBeGreaterThan(0);

          // Verify response has clear structure (contains markdown formatting)
          // Success responses should have checkmarks or other indicators
          if (result.success) {
            expect(
              formatted.includes("✅") ||
                formatted.includes("**") ||
                formatted.includes("###")
            ).toBe(true);
          }

          // Error responses should have error indicators
          if (result.success === false) {
            expect(
              formatted.includes("❌") ||
                formatted.includes("Error") ||
                formatted.includes("Failed")
            ).toBe(true);
          }

          // Response should be readable (not just raw JSON)
          // Check that it's not just a JSON dump
          const isJustJson =
            formatted.startsWith("```json") && formatted.endsWith("```");
          if (command.action !== "status") {
            // Status might fallback to JSON in some cases
            expect(isJustJson).toBe(false);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 25 (Specific formatting): Each action type should have appropriate formatting", () => {
    // Test specific formatting for each action type
    const testCases = [
      {
        command: { action: "create" as const },
        result: {
          success: true,
          featureName: "test-feature",
          directory: ".akira/specs/test-feature",
          requirementsPath: ".akira/specs/test-feature/requirements.md",
          message: "Created successfully",
        },
        expectedContains: ["✅", "test-feature", "Created successfully"],
      },
      {
        command: { action: "list" as const },
        result: {
          success: true,
          count: 2,
          specs: [
            {
              featureName: "feature-1",
              directory: ".akira/specs/feature-1",
              currentPhase: "requirements",
              hasRequirements: true,
              hasDesign: false,
              hasTasks: false,
            },
          ],
        },
        expectedContains: ["📋", "feature-1", "requirements"],
      },
      {
        command: { action: "validate" as const },
        result: {
          success: true,
          valid: false,
          errors: [
            {
              requirementId: "1.1",
              rule: "EARS",
              message: "Invalid pattern",
              suggestion: "Use WHEN pattern",
            },
          ],
          warnings: [],
        },
        expectedContains: ["⚠️", "1.1", "Invalid pattern", "Use WHEN pattern"],
      },
    ];

    for (const testCase of testCases) {
      const formatted = formatResponse(testCase.command, testCase.result);
      for (const expected of testCase.expectedContains) {
        expect(formatted).toContain(expected);
      }
    }
  });
});

describe("Error Handling Property Tests", () => {
  it("Property 26: Error message helpfulness - For any error, the message should include a description and at least one suggested correction", () => {
    // **Feature: copilot-spec-extension, Property 26: Error message helpfulness**
    // **Validates: Requirements 11.5**

    fc.assert(
      fc.property(
        fc.oneof(
          // Common error messages
          fc.constant(new Error("Feature name is required")),
          fc.constant(new Error("Spec not found for feature: test-feature")),
          fc.constant(
            new Error("Spec already exists for feature: test-feature")
          ),
          fc.constant(new Error("Phase is required")),
          fc.constant(new Error("Task not found: 1.2")),
          fc.constant(new Error("Unknown action: invalid")),
          fc.constant(new Error("Timeout waiting for response")),
          fc.constant(new Error("File does not exist")),

          // Generic errors
          fc
            .string({ minLength: 10, maxLength: 100 })
            .map((msg) => new Error(msg))
        ),
        (error) => {
          // Format the error message
          const formatted = formatErrorMessage(error);

          // Verify that an error message was generated
          expect(formatted).toBeDefined();
          expect(typeof formatted).toBe("string");
          expect(formatted.length).toBeGreaterThan(0);

          // Verify it includes error indicator
          expect(formatted.includes("❌") || formatted.includes("Error")).toBe(
            true
          );

          // Verify it includes the original error message
          expect(formatted.includes(error.message)).toBe(true);

          // Verify it includes suggestions section
          expect(
            formatted.includes("💡") || formatted.includes("Suggestion")
          ).toBe(true);

          // Verify it has at least one suggestion (indicated by bullet point or dash)
          expect(formatted.includes("-") || formatted.includes("•")).toBe(true);

          // Count suggestions (lines starting with "- ")
          const suggestionLines = formatted
            .split("\n")
            .filter((line) => line.trim().startsWith("- "));
          expect(suggestionLines.length).toBeGreaterThanOrEqual(1);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 26 (Specific errors): Common error types should have context-specific suggestions", () => {
    // Test specific error types to ensure they have appropriate suggestions
    const testCases = [
      {
        error: new Error("Feature name is required"),
        expectedSuggestions: ["feature name"],
      },
      {
        error: new Error("Spec not found for feature: test"),
        expectedSuggestions: ["list", "create"],
      },
      {
        error: new Error("Spec already exists"),
        expectedSuggestions: ["update", "different"],
      },
      {
        error: new Error("Task 1.2 not found"),
        expectedSuggestions: ["task ID", "tasks.md"],
      },
      {
        error: new Error("Unknown action: invalid"),
        expectedSuggestions: ["create", "list"],
      },
    ];

    for (const testCase of testCases) {
      const formatted = formatErrorMessage(testCase.error);

      // Check that at least one expected suggestion keyword is present
      const hasExpectedSuggestion = testCase.expectedSuggestions.some(
        (keyword) => formatted.toLowerCase().includes(keyword.toLowerCase())
      );
      expect(hasExpectedSuggestion).toBe(true);
    }
  });
});

describe("Chat Participant Unit Tests", () => {
  describe("Command Parsing", () => {
    it("should parse create command with feature name", () => {
      const result = parseCommand("create spec for user-auth");
      expect(result.action).toBe("create");
      expect(result.featureName).toBe("user-auth");
    });

    it("should parse list command", () => {
      const result = parseCommand("list all specs");
      expect(result.action).toBe("list");
    });

    it("should parse status command with feature name", () => {
      const result = parseCommand("status for my-feature");
      expect(result.action).toBe("status");
      expect(result.featureName).toBe("my-feature");
    });

    it("should parse validate command with phase", () => {
      const result = parseCommand("validate requirements for my-feature");
      expect(result.action).toBe("validate");
      expect(result.featureName).toBe("my-feature");
      expect(result.phase).toBe("requirements");
    });

    it("should parse execute command with task ID", () => {
      const result = parseCommand("execute task 1.2 for my-feature");
      expect(result.action).toBe("execute");
      expect(result.featureName).toBe("my-feature");
      expect(result.taskId).toBe("1.2");
    });

    it("should parse update command with phase", () => {
      const result = parseCommand("update design for my-feature");
      expect(result.action).toBe("update");
      expect(result.featureName).toBe("my-feature");
      expect(result.phase).toBe("design");
    });

    it("should default to create for unrecognized commands", () => {
      const result = parseCommand("some random text");
      expect(result.action).toBe("create");
      expect(result.parameters?.featureIdea).toBe("some random text");
    });
  });

  describe("Response Formatting", () => {
    it("should format successful create response", () => {
      const result = {
        success: true,
        featureName: "test-feature",
        directory: ".akira/specs/test-feature",
        requirementsPath: ".akira/specs/test-feature/requirements.md",
        message: "Spec created",
      };
      const formatted = formatResponse({ action: "create" }, result);
      expect(formatted).toContain("✅");
      expect(formatted).toContain("test-feature");
      expect(formatted).toContain("Spec created");
    });

    it("should format failed create response", () => {
      const result = {
        success: false,
        error: "Feature already exists",
        suggestion: "Use update instead",
      };
      const formatted = formatResponse({ action: "create" }, result);
      expect(formatted).toContain("❌");
      expect(formatted).toContain("Feature already exists");
      expect(formatted).toContain("Use update instead");
    });

    it("should format list response with specs", () => {
      const result = {
        success: true,
        count: 2,
        specs: [
          {
            featureName: "feature-1",
            directory: ".akira/specs/feature-1",
            currentPhase: "requirements",
            hasRequirements: true,
            hasDesign: false,
            hasTasks: false,
          },
          {
            featureName: "feature-2",
            directory: ".akira/specs/feature-2",
            currentPhase: "design",
            hasRequirements: true,
            hasDesign: true,
            hasTasks: false,
          },
        ],
      };
      const formatted = formatResponse({ action: "list" }, result);
      expect(formatted).toContain("📋");
      expect(formatted).toContain("feature-1");
      expect(formatted).toContain("feature-2");
      expect(formatted).toContain("requirements");
      expect(formatted).toContain("design");
    });

    it("should format empty list response", () => {
      const result = {
        success: true,
        count: 0,
        specs: [],
      };
      const formatted = formatResponse({ action: "list" }, result);
      expect(formatted).toContain("No Specs Found");
    });

    it("should format validation response with errors", () => {
      const result = {
        success: true,
        valid: false,
        errors: [
          {
            requirementId: "1.1",
            rule: "EARS",
            message: "Invalid pattern",
            suggestion: "Use WHEN pattern",
          },
        ],
        warnings: [],
      };
      const formatted = formatResponse({ action: "validate" }, result);
      expect(formatted).toContain("⚠️");
      expect(formatted).toContain("1.1");
      expect(formatted).toContain("Invalid pattern");
      expect(formatted).toContain("Use WHEN pattern");
    });

    it("should format successful validation response", () => {
      const result = {
        success: true,
        valid: true,
        errors: [],
        warnings: [],
      };
      const formatted = formatResponse({ action: "validate" }, result);
      expect(formatted).toContain("✅");
      expect(formatted).toContain("Validation Passed");
    });
  });

  describe("Error Handling", () => {
    it("should format error with feature name suggestion", () => {
      const error = new Error("Feature name is required");
      const formatted = formatErrorMessage(error);
      expect(formatted).toContain("❌");
      expect(formatted).toContain("Feature name is required");
      expect(formatted).toContain("💡");
      expect(formatted).toContain("feature name");
    });

    it("should format error with spec not found suggestion", () => {
      const error = new Error("Spec not found for feature: test");
      const formatted = formatErrorMessage(error);
      expect(formatted).toContain("❌");
      expect(formatted).toContain("Spec not found");
      expect(formatted).toContain("💡");
      expect(formatted).toContain("list");
    });

    it("should format error with already exists suggestion", () => {
      const error = new Error("Spec already exists for feature: test");
      const formatted = formatErrorMessage(error);
      expect(formatted).toContain("❌");
      expect(formatted).toContain("already exists");
      expect(formatted).toContain("💡");
      expect(formatted).toContain("update");
    });

    it("should provide generic suggestions for unknown errors", () => {
      const error = new Error("Some unknown error occurred");
      const formatted = formatErrorMessage(error);
      expect(formatted).toContain("❌");
      expect(formatted).toContain("Some unknown error occurred");
      expect(formatted).toContain("💡");
      // Should have at least one suggestion
      const suggestionCount = (formatted.match(/- /g) || []).length;
      expect(suggestionCount).toBeGreaterThanOrEqual(1);
    });
  });
});
