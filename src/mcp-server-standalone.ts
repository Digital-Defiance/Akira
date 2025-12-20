/**
 * Standalone MCP Server Entry Point
 * This file is spawned as a separate process by the MCP client
 */

import { SpecMCPServer } from "./mcp-server";

// Create and start the server
const server = new SpecMCPServer();

server.start().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});
