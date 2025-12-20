/**
 * MCP Server implementation for spec operations
 * Provides tools for creating, reading, and updating spec documents
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * SpecMCPServer manages the MCP server lifecycle and tool registration
 */
export class SpecMCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private isRunning = false;

  constructor() {
    this.server = new Server(
      {
        name: "copilot-spec-extension",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerHandlers();
  }

  /**
   * Register MCP protocol handlers
   */
  private registerHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolSchemas(),
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "create_spec":
          return await this.handleCreateSpec(args);
        case "read_spec":
          return await this.handleReadSpec(args);
        case "update_spec":
          return await this.handleUpdateSpec(args);
        case "list_specs":
          return await this.handleListSpecs(args);
        case "validate_requirements":
          return await this.handleValidateRequirements(args);
        case "update_task_status":
          return await this.handleUpdateTaskStatus(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Get tool schemas for all available tools
   */
  getToolSchemas(): Tool[] {
    return [
      {
        name: "create_spec",
        description:
          "Create a new spec directory with requirements.md file for a feature",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description:
                "Name of the feature (will be converted to kebab-case)",
            },
            featureIdea: {
              type: "string",
              description: "Brief description of the feature idea",
            },
          },
          required: ["featureName", "featureIdea"],
        },
      },
      {
        name: "read_spec",
        description: "Read a spec document (requirements, design, or tasks)",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Name of the feature",
            },
            phase: {
              type: "string",
              enum: ["requirements", "design", "tasks"],
              description: "Which document to read",
            },
          },
          required: ["featureName", "phase"],
        },
      },
      {
        name: "update_spec",
        description: "Update a spec document with new content",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Name of the feature",
            },
            phase: {
              type: "string",
              enum: ["requirements", "design", "tasks"],
              description: "Which document to update",
            },
            content: {
              type: "string",
              description: "New content for the document",
            },
          },
          required: ["featureName", "phase", "content"],
        },
      },
      {
        name: "list_specs",
        description: "List all specs in the workspace with their current phase",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "validate_requirements",
        description:
          "Validate requirements document against EARS patterns and INCOSE rules",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Requirements document content to validate",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "update_task_status",
        description: "Update the status of a task in the tasks.md file",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Name of the feature",
            },
            taskId: {
              type: "string",
              description: "Task ID (e.g., '1', '1.1', '2.3')",
            },
            status: {
              type: "string",
              enum: ["not-started", "in-progress", "completed", "skipped"],
              description: "New status for the task",
            },
          },
          required: ["featureName", "taskId", "status"],
        },
      },
    ];
  }

  /**
   * Tool handlers - placeholder implementations
   */
  private async handleCreateSpec(args: any): Promise<any> {
    // TODO: Implement in task 3
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "create_spec tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  private async handleReadSpec(args: any): Promise<any> {
    // TODO: Implement in task 3
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "read_spec tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  private async handleUpdateSpec(args: any): Promise<any> {
    // TODO: Implement in task 3
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "update_spec tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  private async handleListSpecs(args: any): Promise<any> {
    // TODO: Implement in task 3
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "list_specs tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  private async handleValidateRequirements(args: any): Promise<any> {
    // TODO: Implement in task 4
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message:
              "validate_requirements tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  private async handleUpdateTaskStatus(args: any): Promise<any> {
    // TODO: Implement in task 9
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "update_task_status tool called (implementation pending)",
            args,
          }),
        },
      ],
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    this.isRunning = true;
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.transport) {
      await this.server.close();
      this.transport = null;
    }
    this.isRunning = false;
  }

  /**
   * Restart the MCP server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the underlying server instance (for testing)
   */
  getServer(): Server {
    return this.server;
  }
}
