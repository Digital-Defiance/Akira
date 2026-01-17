/**
 * MCP Client implementation using BaseMCPClient
 * Provides spec operations through MCP protocol
 */

import {
  BaseMCPClient,
  LogOutputChannel,
  ConnectionState,
} from "@ai-capabilities-suite/mcp-client-base";
import * as vscode from "vscode";
import * as path from "path";

/**
 * SpecMCPClient extends BaseMCPClient to provide spec-specific operations
 */
export class SpecMCPClient extends BaseMCPClient {
  constructor(outputChannel: LogOutputChannel) {
    super("akira-spec-client", outputChannel, {
      timeout: {
        initializationTimeoutMs: 60000,
        standardRequestTimeoutMs: 30000,
        toolsListTimeoutMs: 60000,
      },
      reSync: {
        maxRetries: 3,
        retryDelayMs: 2000,
        backoffMultiplier: 1.5,
      },
      logging: {
        logLevel: "info",
        logCommunication: true,
      },
    });
  }

  /**
   * Get the command to spawn the MCP server
   */
  protected getServerCommand(): { command: string; args: string[] } {
    // Get the extension path with backwards-compatible IDs
    const extensionIdCandidates = [
      "DigitalDefiance.acs-akira",
      "digitaldefiance.acs-akira",
      "DigitalDefiance.akira",
      "digitaldefiance.akira",
    ];

    const extension =
      extensionIdCandidates
        .map((id) => vscode.extensions.getExtension(id))
        .find((ext): ext is vscode.Extension<any> => Boolean(ext)) ??
      vscode.extensions.all.find((ext) =>
        ext.id.toLowerCase().includes("acs-akira")
      );

    const extensionPath = extension?.extensionPath;
    if (!extensionPath) {
      throw new Error("Extension path not found");
    }

    // Path to the MCP server script
    const serverPath = path.join(
      extensionPath,
      "dist",
      "mcp-server-standalone.js"
    );

    return {
      command: process.execPath, // Node.js executable
      args: [serverPath],
    };
  }

  /**
   * Get environment variables for the server
   */
  protected getServerEnv(): Record<string, string> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const config = vscode.workspace.getConfiguration("copilotSpec");
    const specDirectory = config.get<string>("specDirectory") || ".akira/specs";
    const strictMode = config.get<boolean>("strictMode", false);
    const propertyTestIterations = config.get<number>("propertyTestIterations", 100);

    return {
      ...process.env,
      WORKSPACE_ROOT: workspaceRoot,
      SPEC_DIRECTORY: specDirectory,
      STRICT_MODE: strictMode.toString(),
      PROPERTY_TEST_ITERATIONS: propertyTestIterations.toString(),
      NODE_ENV: "production",
    } as Record<string, string>;
  }

  /**
   * Called when server is ready
   */
  protected async onServerReady(): Promise<void> {
    this.log("info", "Spec MCP server is ready");
  }

  /**
   * Check if the client is connected to the server
   */
  isConnected(): boolean {
    return this.getConnectionStatus().state === ConnectionState.CONNECTED;
  }

  /**
   * Create a new spec
   */
  async createSpec(featureName: string, featureIdea: string, llmGeneratedContent?: string): Promise<any> {
    return await this.callTool("create_spec", {
      featureName,
      featureIdea,
      llmGeneratedContent,
    });
  }

  /**
   * Read a spec document
   */
  async readSpec(
    featureName: string,
    phase: "requirements" | "design" | "tasks"
  ): Promise<any> {
    return await this.callTool("read_spec", {
      featureName,
      phase,
    });
  }

  /**
   * Update a spec document
   */
  async updateSpec(
    featureName: string,
    phase: "requirements" | "design" | "tasks",
    content: string
  ): Promise<any> {
    return await this.callTool("update_spec", {
      featureName,
      phase,
      content,
    });
  }

  /**
   * List all specs
   */
  async listSpecs(): Promise<any> {
    return await this.callTool("list_specs", {});
  }

  /**
   * Validate requirements
   */
  async validateRequirements(content: string): Promise<any> {
    return await this.callTool("validate_requirements", {
      content,
    });
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    featureName: string,
    taskId: string,
    status: "not-started" | "in-progress" | "completed" | "skipped"
  ): Promise<any> {
    return await this.callTool("update_task_status", {
      featureName,
      taskId,
      status,
    });
  }

  /**
   * Validate a specific phase
   */
  async validatePhase(
    featureName: string,
    phase: "requirements" | "design" | "tasks"
  ): Promise<any> {
    return await this.callTool("validate_phase", {
      featureName,
      phase,
    });
  }

  /**
   * Validate an entire spec
   */
  async validateSpec(featureName: string): Promise<any> {
    return await this.callTool("validate_spec", {
      featureName,
    });
  }
}
