import * as vscode from "vscode";
import { SpecMCPServer } from "./mcp-server";

let mcpServer: SpecMCPServer | null = null;

/**
 * Extension activation function
 * Called when the extension is activated
 */
export function activate(_context: vscode.ExtensionContext) {
  console.log("Copilot Spec Extension is now active");

  // Initialize MCP Server (Task 2)
  mcpServer = new SpecMCPServer();
  console.log("MCP Server initialized");

  // TODO: Register Chat Participant (Task 11)
  // TODO: Register UI Components (Task 13)
  // TODO: Register Configuration (Task 14)
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export async function deactivate() {
  console.log("Copilot Spec Extension is now deactivated");

  // Cleanup MCP Server
  if (mcpServer) {
    await mcpServer.stop();
    mcpServer = null;
  }
}

/**
 * Get the MCP server instance (for testing)
 */
export function getMCPServer(): SpecMCPServer | null {
  return mcpServer;
}
