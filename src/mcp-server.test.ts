/**
 * Tests for MCP Server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { SpecMCPServer } from "./mcp-server";

describe("MCP Server Tests", () => {
  let server: SpecMCPServer;

  beforeEach(() => {
    server = new SpecMCPServer();
  });

  afterEach(async () => {
    if (server.isServerRunning()) {
      await server.stop();
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
  });
});
