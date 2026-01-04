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
import * as fs from "fs";
import * as path from "path";
import {
  createSpecDirectory,
  listSpecs,
  getSpecDirectoryPath,
  specExists,
} from "./spec-directory";
import { RequirementsGenerator } from "./requirements-generator";
import { getOrCreateState, getCurrentPhase } from "./state-manager";
import { TaskExecutionManager } from "./task-execution-manager";
import { validateEARSPattern } from "./ears-validator";
import { validateINCOSE } from "./incose-validator";
import { TaskStatus } from "./types";

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
            llmGeneratedContent: {
              type: "string",
              description: "Optional LLM-generated requirements content (JSON format)",
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
   * Tool handlers
   */
  private async handleCreateSpec(args: any): Promise<any> {
    try {
      const { featureName, featureIdea, llmGeneratedContent } = args;

      if (!featureName || typeof featureName !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "featureName is required and must be a string",
              }),
            },
          ],
        };
      }

      if (!featureIdea || typeof featureIdea !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "featureIdea is required and must be a string",
              }),
            },
          ],
        };
      }

      // Check if spec already exists
      if (specExists(featureName)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Spec already exists for feature: ${featureName}`,
                suggestion: "Use update_spec to modify existing spec",
              }),
            },
          ],
        };
      }

      // Create spec directory
      const dirResult = createSpecDirectory(featureName);
      if (!dirResult.success) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: dirResult.error,
              }),
            },
          ],
        };
      }

      // Generate initial requirements (with optional LLM content from extension)
      const generator = new RequirementsGenerator();
      const requirements = generator.generateRequirements(featureIdea, llmGeneratedContent);
      const requirementsMarkdown = generator.formatAsMarkdown(requirements);

      // Write requirements to file
      const requirementsPath = path.join(
        dirResult.directory,
        "requirements.md"
      );
      fs.writeFileSync(requirementsPath, requirementsMarkdown, "utf-8");

      // Initialize state
      getOrCreateState(featureName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              featureName,
              directory: dirResult.directory,
              requirementsPath,
              message: `Spec created successfully for ${featureName}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to create spec: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
  }

  private async handleReadSpec(args: any): Promise<any> {
    try {
      const { featureName, phase } = args;

      if (!featureName || typeof featureName !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "featureName is required and must be a string",
              }),
            },
          ],
        };
      }

      if (!phase || !["requirements", "design", "tasks"].includes(phase)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "phase is required and must be one of: requirements, design, tasks",
              }),
            },
          ],
        };
      }

      // Check if spec exists
      if (!specExists(featureName)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Spec not found for feature: ${featureName}`,
              }),
            },
          ],
        };
      }

      // Get spec directory and file path
      const specDir = getSpecDirectoryPath(featureName);
      const fileName = `${phase}.md`;
      const filePath = path.join(specDir, fileName);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `${phase}.md not found for feature: ${featureName}`,
                suggestion: `The ${phase} document has not been created yet`,
              }),
            },
          ],
        };
      }

      // Read file content
      const content = fs.readFileSync(filePath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              featureName,
              phase,
              content,
              filePath,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to read spec: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
  }

  private async handleUpdateSpec(args: any): Promise<any> {
    try {
      const { featureName, phase, content } = args;

      if (!featureName || typeof featureName !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "featureName is required and must be a string",
              }),
            },
          ],
        };
      }

      if (!phase || !["requirements", "design", "tasks"].includes(phase)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "phase is required and must be one of: requirements, design, tasks",
              }),
            },
          ],
        };
      }

      if (!content || typeof content !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "content is required and must be a string",
              }),
            },
          ],
        };
      }

      // Check if spec exists
      if (!specExists(featureName)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Spec not found for feature: ${featureName}`,
                suggestion: "Use create_spec to create a new spec first",
              }),
            },
          ],
        };
      }

      // Get spec directory and file path
      const specDir = getSpecDirectoryPath(featureName);
      const fileName = `${phase}.md`;
      const filePath = path.join(specDir, fileName);

      // Write content to file (preserving formatting by writing as-is)
      fs.writeFileSync(filePath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              featureName,
              phase,
              filePath,
              message: `${phase}.md updated successfully for ${featureName}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to update spec: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
  }

  private async handleListSpecs(_args: any): Promise<any> {
    try {
      // Get all specs
      const specs = listSpecs();

      // Enhance with current phase information
      const specsWithPhase = specs.map((spec) => {
        const phase = getCurrentPhase(spec.featureName);
        return {
          featureName: spec.featureName,
          directory: spec.directory,
          currentPhase: phase,
          hasRequirements: spec.hasRequirements,
          hasDesign: spec.hasDesign,
          hasTasks: spec.hasTasks,
          hasState: spec.hasState,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              specs: specsWithPhase,
              count: specsWithPhase.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to list specs: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
  }

  private async handleValidateRequirements(args: any): Promise<any> {
    try {
      const { content } = args;

      if (!content || typeof content !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "content is required and must be a string",
              }),
            },
          ],
        };
      }

      const errors: any[] = [];
      const warnings: any[] = [];

      // Parse requirements from markdown content
      // Look for acceptance criteria lines (numbered lists)
      const lines = content.split("\n");
      let currentRequirementId = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect requirement sections (e.g., "### Requirement 1")
        const reqMatch = line.match(/###\s+Requirement\s+(\d+)/);
        if (reqMatch) {
          currentRequirementId = reqMatch[1];
          continue;
        }

        // Detect acceptance criteria (numbered lists)
        const criteriaMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (criteriaMatch && currentRequirementId) {
          const criteriaText = criteriaMatch[1];
          const criteriaId = `${currentRequirementId}.${i}`;

          // Validate EARS pattern
          const earsResult = validateEARSPattern(criteriaText);
          if (!earsResult.isValid) {
            errors.push({
              requirementId: criteriaId,
              rule: "EARS",
              message: `Invalid EARS pattern: ${
                earsResult.message || "Unknown error"
              }`,
              suggestion: "Use one of the six EARS patterns",
            });
          }

          // Validate INCOSE rules
          const incoseResult = validateINCOSE(criteriaText);
          if (!incoseResult.isValid) {
            for (const violation of incoseResult.violations) {
              errors.push({
                requirementId: criteriaId,
                rule: "INCOSE",
                message: violation.message,
                suggestion: violation.suggestion,
              });
            }
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              valid: errors.length === 0,
              errors,
              warnings,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to validate requirements: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
  }

  private async handleUpdateTaskStatus(args: any): Promise<any> {
    try {
      const { featureName, taskId, status } = args;

      if (!featureName || typeof featureName !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "featureName is required and must be a string",
              }),
            },
          ],
        };
      }

      if (!taskId || typeof taskId !== "string") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "taskId is required and must be a string",
              }),
            },
          ],
        };
      }

      if (
        !status ||
        !["not-started", "in-progress", "completed", "skipped"].includes(status)
      ) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "status is required and must be one of: not-started, in-progress, completed, skipped",
              }),
            },
          ],
        };
      }

      // Check if spec exists
      if (!specExists(featureName)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Spec not found for feature: ${featureName}`,
              }),
            },
          ],
        };
      }

      // Update task status using TaskExecutionManager
      const manager = new TaskExecutionManager();
      const updateResult = manager.updateTaskStatus(
        featureName,
        taskId,
        status as TaskStatus
      );

      if (!updateResult) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Failed to update task status for ${taskId}`,
              }),
            },
          ],
        };
      }

      // Also update the tasks.md file to reflect the status
      // Read current tasks.md
      const specDir = getSpecDirectoryPath(featureName);
      const tasksPath = path.join(specDir, "tasks.md");

      if (fs.existsSync(tasksPath)) {
        let tasksContent = fs.readFileSync(tasksPath, "utf-8");

        // Update checkbox status in markdown
        // Match patterns like "- [ ] 1." or "- [x] 1.1"
        const checkboxPattern = new RegExp(
          `^(\\s*- \\[[ x]\\])(\\*?)\\s+${taskId.replace(/\./g, "\\.")}\\s+`,
          "gm"
        );

        tasksContent = tasksContent.replace(checkboxPattern, (match) => {
          // Update the checkbox based on status
          if (status === "completed") {
            return match.replace("[ ]", "[x]");
          } else {
            return match.replace("[x]", "[ ]");
          }
        });

        fs.writeFileSync(tasksPath, tasksContent, "utf-8");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              featureName,
              taskId,
              status,
              message: `Task ${taskId} status updated to ${status}`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to update task status: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          },
        ],
      };
    }
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
