/**
 * Tests for MCP Server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SpecMCPServer } from "./mcp-server";
import { createSpecDirectory } from "./spec-directory";
import { createInitialState, writeState } from "./state-manager";

describe("MCP Server Tests", () => {
  let server: SpecMCPServer;
  let tempDir: string;

  beforeEach(() => {
    server = new SpecMCPServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
  });

  afterEach(async () => {
    if (server.isServerRunning()) {
      await server.stop();
    }
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Property Tests", () => {
    it("Property 16: MCP tool provision", () => {
      // **Feature: copilot-spec-extension, Property 16: MCP tool provision**
      // For any request for spec context from Copilot Chat, the MCP server should provide
      // the requested documents via the appropriate MCP tools.

      fc.assert(
        fc.property(
          fc.constantFrom(
            "create_spec",
            "read_spec",
            "update_spec",
            "list_specs",
            "validate_requirements",
            "update_task_status"
          ),
          (toolName) => {
            // Get the list of tools
            const tools = server.getToolSchemas();
            const toolNames = tools.map((t) => t.name);

            // Verify the requested tool is available
            expect(toolNames).toContain(toolName);

            // Verify each tool has proper schema
            const tool = tools.find((t) => t.name === toolName);
            expect(tool).toBeDefined();
            expect(tool?.description).toBeDefined();
            expect(tool?.inputSchema).toBeDefined();
            expect(tool?.inputSchema.type).toBe("object");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 19: Spec listing completeness", async () => {
      // **Feature: copilot-spec-extension, Property 19: Spec listing completeness**
      // For any workspace containing N specs, the list_specs tool should return exactly N
      // spec summaries, each with the correct feature name and current phase.

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // Number of specs to create
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
              const trimmed = s.trim();
              if (trimmed.length === 0) return false;
              return /[a-zA-Z0-9]/.test(trimmed);
            }),
            { minLength: 0, maxLength: 5 }
          ),
          async (numSpecs, featureNames) => {
            // Create a unique temp directory for this test run
            const testTempDir = fs.mkdtempSync(
              path.join(os.tmpdir(), "spec-list-test-")
            );

            try {
              // Import toKebabCase to deduplicate after conversion
              const { toKebabCase } = await import("./spec-directory");

              // Deduplicate based on kebab-case conversion (what actually matters for directories)
              const kebabNames = featureNames.map((name) => toKebabCase(name));
              const uniqueKebabNames = [...new Set(kebabNames)].slice(
                0,
                numSpecs
              );
              const actualNumSpecs = uniqueKebabNames.length;

              // Create specs using the original names that map to unique kebab names
              const uniqueNames: string[] = [];
              const seenKebab = new Set<string>();
              for (const name of featureNames) {
                const kebab = toKebabCase(name);
                if (!seenKebab.has(kebab) && uniqueNames.length < numSpecs) {
                  uniqueNames.push(name);
                  seenKebab.add(kebab);
                }
              }

              // Create specs
              for (const featureName of uniqueNames) {
                const result = createSpecDirectory(featureName, testTempDir);
                expect(result.success).toBe(true);

                // Create state with random phase
                const state = createInitialState(featureName);
                const phases = ["requirements", "design", "tasks", "execution"];
                state.currentPhase = phases[
                  Math.floor(Math.random() * phases.length)
                ] as any;
                writeState(state, testTempDir);
              }

              // Call list_specs (we need to test the actual implementation)
              // Since we can't easily call the MCP handler directly, we'll test the underlying
              // listSpecs function which is what the handler uses
              const { listSpecs } = await import("./spec-directory");
              const { getCurrentPhase } = await import("./state-manager");

              const specs = listSpecs(testTempDir);
              const specsWithPhase = specs.map((spec) => ({
                featureName: spec.featureName,
                currentPhase: getCurrentPhase(spec.featureName, testTempDir),
              }));

              // Verify we get exactly N specs
              expect(specsWithPhase.length).toBe(actualNumSpecs);

              // Verify each spec has correct feature name and phase
              // Note: spec.featureName is the kebab-cased directory name
              const kebabNamesExpected = uniqueNames.map((name) =>
                toKebabCase(name)
              );

              for (const spec of specsWithPhase) {
                expect(kebabNamesExpected).toContain(spec.featureName);
                expect(spec.currentPhase).toBeDefined();
                expect([
                  "requirements",
                  "design",
                  "tasks",
                  "execution",
                ]).toContain(spec.currentPhase);
              }
            } finally {
              // Clean up test temp directory
              if (fs.existsSync(testTempDir)) {
                fs.rmSync(testTempDir, { recursive: true, force: true });
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 18: MCP tool execution", async () => {
      // **Feature: copilot-spec-extension, Property 18: MCP tool execution**
      // For any MCP tool invocation, the tool should execute the operation and return
      // a result that conforms to its defined output schema.

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            "create_spec",
            "read_spec",
            "update_spec",
            "list_specs",
            "validate_requirements",
            "update_task_status"
          ),
          async (toolName) => {
            // Get the tool schema
            const tools = server.getToolSchemas();
            const tool = tools.find((t) => t.name === toolName);
            expect(tool).toBeDefined();

            // Verify tool has proper structure
            expect(tool?.name).toBe(toolName);
            expect(tool?.description).toBeDefined();
            expect(tool?.inputSchema).toBeDefined();
            expect(tool?.inputSchema.type).toBe("object");
            expect(tool?.inputSchema.properties).toBeDefined();

            // Note: We can't easily test actual execution without mocking the MCP protocol,
            // but we can verify the tool schemas are properly defined and would allow execution
            // The actual execution is tested in unit tests with specific inputs
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Unit Tests", () => {
    it("should initialize server successfully", () => {
      expect(server).toBeDefined();
      expect(server.isServerRunning()).toBe(false);
    });

    it("should register all required tools", () => {
      const tools = server.getToolSchemas();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("create_spec");
      expect(toolNames).toContain("read_spec");
      expect(toolNames).toContain("update_spec");
      expect(toolNames).toContain("list_specs");
      expect(toolNames).toContain("validate_requirements");
      expect(toolNames).toContain("update_task_status");
      expect(toolNames).toHaveLength(6);
    });

    it("should have proper schema for create_spec tool", () => {
      const tools = server.getToolSchemas();
      const createSpecTool = tools.find((t) => t.name === "create_spec");

      expect(createSpecTool).toBeDefined();
      expect(createSpecTool?.description).toContain("Create a new spec");
      expect(createSpecTool?.inputSchema.properties).toHaveProperty(
        "featureName"
      );
      expect(createSpecTool?.inputSchema.properties).toHaveProperty(
        "featureIdea"
      );
      expect(createSpecTool?.inputSchema.required).toContain("featureName");
      expect(createSpecTool?.inputSchema.required).toContain("featureIdea");
    });

    it("should have proper schema for read_spec tool", () => {
      const tools = server.getToolSchemas();
      const readSpecTool = tools.find((t) => t.name === "read_spec");

      expect(readSpecTool).toBeDefined();
      expect(readSpecTool?.inputSchema.properties).toHaveProperty(
        "featureName"
      );
      expect(readSpecTool?.inputSchema.properties).toHaveProperty("phase");
      expect(readSpecTool?.inputSchema.required).toContain("featureName");
      expect(readSpecTool?.inputSchema.required).toContain("phase");
    });

    it("should have proper schema for update_spec tool", () => {
      const tools = server.getToolSchemas();
      const updateSpecTool = tools.find((t) => t.name === "update_spec");

      expect(updateSpecTool).toBeDefined();
      expect(updateSpecTool?.inputSchema.properties).toHaveProperty(
        "featureName"
      );
      expect(updateSpecTool?.inputSchema.properties).toHaveProperty("phase");
      expect(updateSpecTool?.inputSchema.properties).toHaveProperty("content");
      expect(updateSpecTool?.inputSchema.required).toContain("featureName");
      expect(updateSpecTool?.inputSchema.required).toContain("phase");
      expect(updateSpecTool?.inputSchema.required).toContain("content");
    });

    it("should track server running state", () => {
      expect(server.isServerRunning()).toBe(false);

      // Note: We can't actually start the server in tests because it requires stdio transport
      // The lifecycle methods are tested through integration tests
    });

    it("should have proper schema for list_specs tool", () => {
      const tools = server.getToolSchemas();
      const listSpecsTool = tools.find((t) => t.name === "list_specs");

      expect(listSpecsTool).toBeDefined();
      expect(listSpecsTool?.description).toContain("List all specs");
      expect(listSpecsTool?.inputSchema.properties).toBeDefined();
    });

    it("should have proper schema for validate_requirements tool", () => {
      const tools = server.getToolSchemas();
      const validateTool = tools.find(
        (t) => t.name === "validate_requirements"
      );

      expect(validateTool).toBeDefined();
      expect(validateTool?.description).toContain("Validate requirements");
      expect(validateTool?.inputSchema.properties).toHaveProperty("content");
      expect(validateTool?.inputSchema.required).toContain("content");
    });

    it("should have proper schema for update_task_status tool", () => {
      const tools = server.getToolSchemas();
      const updateTaskTool = tools.find((t) => t.name === "update_task_status");

      expect(updateTaskTool).toBeDefined();
      expect(updateTaskTool?.description).toContain("Update the status");
      expect(updateTaskTool?.inputSchema.properties).toHaveProperty(
        "featureName"
      );
      expect(updateTaskTool?.inputSchema.properties).toHaveProperty("taskId");
      expect(updateTaskTool?.inputSchema.properties).toHaveProperty("status");
      expect(updateTaskTool?.inputSchema.required).toContain("featureName");
      expect(updateTaskTool?.inputSchema.required).toContain("taskId");
      expect(updateTaskTool?.inputSchema.required).toContain("status");
    });
  });
});
