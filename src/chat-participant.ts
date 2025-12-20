/**
 * Chat Participant implementation for @spec participant
 * Handles interactions with GitHub Copilot Chat
 */

import * as vscode from "vscode";
import { SpecMCPClient } from "./mcp-client";
import { Phase } from "./types";
import {
  findNextTask,
  buildExecutionContext,
  generateTaskExecutionPrompt,
  markTaskInProgress,
  updateTaskCheckbox,
} from "./autonomous-executor";
import { generateRequirementsWithLLM } from "./llm-requirements-generator";
import { generateDesignWithLLM } from "./llm-design-generator";

/**
 * Represents a parsed spec command
 */
export interface SpecCommand {
  action:
    | "create"
    | "update"
    | "execute"
    | "list"
    | "status"
    | "validate"
    | "approve"
    | "unapprove";
  featureName?: string;
  phase?: Phase;
  taskId?: string;
  parameters?: Record<string, any>;
}

/**
 * Register the @spec chat participant with VS Code
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  mcpClient: SpecMCPClient | null
): vscode.Disposable {
  // Create the chat participant
  const participant = vscode.chat.createChatParticipant(
    "spec",
    async (
      request: vscode.ChatRequest,
      context: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      // Handle the chat request
      await handleChatRequest(request, context, stream, token, mcpClient);
    }
  );

  // Set participant properties
  participant.iconPath = vscode.Uri.file(context.asAbsolutePath("icon.png"));

  return participant;
}

/**
 * Parse a user message into a SpecCommand
 */
/**
 * Parse a user message into a SpecCommand
 *
 * Command patterns:
 * - create <feature-name> "<description>" | create <feature-name> with <description>
 * - list
 * - status <feature-name> | <feature-name> status
 * - validate <feature-name> [phase]
 * - continue <feature-name> | <feature-name> continue | resume <feature-name>
 * - update <feature-name> [phase] with <content>
 * - execute <feature-name> <task-id> | complete <feature-name> <task-id>
 * - <feature-name> "<description>" (implicit create)
 */
export function parseCommand(message: string): SpecCommand {
  // Remove leading slash if present and trim
  const trimmedMessage = message.trim().replace(/^\//, "");

  // Empty message defaults to list
  if (!trimmedMessage) {
    return { action: "list" };
  }

  // Extract quoted description if present (to avoid matching keywords in descriptions)
  const quotedMatch = trimmedMessage.match(/["']([^"']+)["']/);
  const description = quotedMatch ? quotedMatch[1] : undefined;
  const beforeQuote = quotedMatch
    ? trimmedMessage.substring(0, quotedMatch.index).trim()
    : trimmedMessage;

  // Split the part before the quote into tokens for command detection
  const tokens = beforeQuote.toLowerCase().split(/\s+/);
  const firstToken = tokens[0] || "";
  const secondToken = tokens[1] || "";

  // List command - must be exact match or standalone word
  if (firstToken === "list" || beforeQuote.toLowerCase() === "list") {
    return { action: "list" };
  }

  // Create command patterns
  if (
    firstToken === "create" ||
    firstToken === "new" ||
    firstToken === "start"
  ) {
    // Pattern: create <feature-name> "<description>"
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    return {
      action: "create",
      featureName,
      parameters: {
        featureIdea:
          description || beforeQuote.substring(firstToken.length).trim(),
      },
    };
  }

  // Status command patterns
  if (firstToken === "status") {
    // Pattern: status <feature-name>
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    return { action: "status", featureName };
  }
  if (secondToken === "status") {
    // Pattern: <feature-name> status
    return { action: "status", featureName: firstToken };
  }

  // Validate command patterns
  if (firstToken === "validate") {
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    const phase = extractPhase(beforeQuote);
    return { action: "validate", featureName, phase };
  }

  // Approve command patterns
  if (firstToken === "approve") {
    // Pattern: approve <phase> <feature-name> OR approve <feature-name> <phase>
    const phase = extractPhase(beforeQuote);
    const featureName = extractFeatureNameFromTokens(
      tokens.slice(phase ? 2 : 1)
    );
    return { action: "approve", featureName, phase };
  }
  if (secondToken === "approve") {
    // Pattern: <feature-name> approve <phase>
    const phase = extractPhase(beforeQuote);
    return { action: "approve", featureName: firstToken, phase };
  }

  // Unapprove command patterns
  if (firstToken === "unapprove") {
    // Pattern: unapprove <phase> <feature-name> OR unapprove <feature-name> <phase>
    const phase = extractPhase(beforeQuote);
    const featureName = extractFeatureNameFromTokens(
      tokens.slice(phase ? 2 : 1)
    );
    return { action: "unapprove", featureName, phase };
  }
  if (secondToken === "unapprove") {
    // Pattern: <feature-name> unapprove <phase>
    const phase = extractPhase(beforeQuote);
    return { action: "unapprove", featureName: firstToken, phase };
  }

  // Continue/Resume command patterns
  if (firstToken === "continue" || firstToken === "resume") {
    // Pattern: continue <feature-name>
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    return {
      action: "update",
      featureName,
      parameters: { continue: true },
    };
  }
  if (secondToken === "continue" || secondToken === "resume") {
    // Pattern: <feature-name> continue
    return {
      action: "update",
      featureName: firstToken,
      parameters: { continue: true },
    };
  }

  // Update command patterns
  if (firstToken === "update" || firstToken === "modify") {
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    const phase = extractPhase(beforeQuote);
    const content = extractContent(trimmedMessage);
    return {
      action: "update",
      featureName,
      phase,
      parameters: { content },
    };
  }

  // Execute/Complete command patterns
  if (
    firstToken === "execute" ||
    firstToken === "run" ||
    firstToken === "implement" ||
    firstToken === "complete" ||
    firstToken === "done"
  ) {
    const isComplete = firstToken === "complete" || firstToken === "done";
    const featureName = extractFeatureNameFromTokens(tokens.slice(1));
    const taskId = extractTaskId(beforeQuote);
    return {
      action: "execute",
      featureName,
      taskId,
      parameters: { complete: isComplete },
    };
  }

  // Task command pattern
  if (firstToken === "task") {
    const taskId = extractTaskId(beforeQuote);
    const featureName = extractFeatureNameFromTokens(tokens.slice(2));
    return {
      action: "execute",
      featureName,
      taskId,
      parameters: { complete: false },
    };
  }

  // Implicit create: <feature-name> "<description>"
  // Feature names must have hyphens or underscores
  if (firstToken.includes("-") || firstToken.includes("_")) {
    return {
      action: "create",
      featureName: firstToken,
      parameters: {
        featureIdea:
          description || trimmedMessage.substring(firstToken.length).trim(),
      },
    };
  }

  // Default: treat entire message as feature idea for create
  return {
    action: "create",
    parameters: { featureIdea: trimmedMessage },
  };
}

/**
 * Extract feature name from token array
 */
function extractFeatureNameFromTokens(tokens: string[]): string | undefined {
  // Find the first token that looks like a feature name (has hyphen or underscore)
  const featureToken = tokens.find((t) => t.includes("-") || t.includes("_"));
  return featureToken || tokens[0];
}

/**
 * Extract phase from message
 */
function extractPhase(message: string): Phase | undefined {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("requirement")) {
    return "requirements";
  }
  if (lowerMessage.includes("design")) {
    return "design";
  }
  if (lowerMessage.includes("task")) {
    return "tasks";
  }
  if (lowerMessage.includes("execution") || lowerMessage.includes("execute")) {
    return "execution";
  }

  return undefined;
}

/**
 * Extract task ID from message
 */
function extractTaskId(message: string): string | undefined {
  // Look for patterns like "task 1.2" or "task 3"
  const taskMatch = message.match(/\btask\s+(\d+(?:\.\d+)?)/i);
  if (taskMatch) {
    return taskMatch[1];
  }

  // Look for standalone task IDs like "1.2" or "3"
  const idMatch = message.match(/\b(\d+(?:\.\d+)?)\b/);
  if (idMatch) {
    return idMatch[1];
  }

  return undefined;
}

/**
 * Extract content from message
 */
function extractContent(message: string): string | undefined {
  // Look for content after "with" or "to"
  const withMatch = message.match(/\b(?:with|to)\s+(.+)$/i);
  if (withMatch) {
    return withMatch[1];
  }

  return undefined;
}

/**
 * Format MCP tool result for chat display
 */
export function formatResponse(command: SpecCommand, result: any): string {
  // Parse result if it's a string
  let parsedResult = result;
  if (typeof result === "string") {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      // If parsing fails, use as-is
    }
  }

  // Extract content if it's in MCP response format
  if (parsedResult?.content?.[0]?.text) {
    try {
      parsedResult = JSON.parse(parsedResult.content[0].text);
    } catch {
      parsedResult = parsedResult.content[0].text;
    }
  }

  switch (command.action) {
    case "create":
      if (parsedResult.success) {
        return (
          `✅ **Spec Created Successfully**\n\n` +
          `- Feature: ${parsedResult.featureName}\n` +
          `- Directory: \`${parsedResult.directory}\`\n` +
          `- Requirements: \`${parsedResult.requirementsPath}\`\n\n` +
          `${parsedResult.message}`
        );
      } else {
        return (
          `❌ **Failed to Create Spec**\n\n` +
          `Error: ${parsedResult.error}\n\n` +
          (parsedResult.suggestion
            ? `💡 Suggestion: ${parsedResult.suggestion}`
            : "")
        );
      }

    case "list":
      if (parsedResult.success && parsedResult.specs) {
        if (parsedResult.specs.length === 0) {
          return `📋 **No Specs Found**\n\nThere are no specs in the workspace yet. Create one with \`@spec create <feature-name>\``;
        }

        let response = `📋 **Specs in Workspace** (${parsedResult.count})\n\n`;
        for (const spec of parsedResult.specs) {
          response += `### ${spec.featureName}\n`;
          response += `- Phase: ${spec.currentPhase}\n`;
          response += `- Directory: \`${spec.directory}\`\n`;
          response += `- Files: `;
          const files = [];
          if (spec.hasRequirements) files.push("requirements.md");
          if (spec.hasDesign) files.push("design.md");
          if (spec.hasTasks) files.push("tasks.md");
          response += files.join(", ") || "none";
          response += "\n\n";
        }
        return response;
      } else {
        return `❌ **Failed to List Specs**\n\nError: ${
          parsedResult.error || "Unknown error"
        }`;
      }

    case "status":
      if (parsedResult.success) {
        return (
          `📊 **Status for ${parsedResult.featureName}**\n\n` +
          `- Current Phase: ${parsedResult.phase}\n` +
          `- File: \`${parsedResult.filePath}\`\n\n` +
          `The spec is currently in the **${parsedResult.phase}** phase.`
        );
      } else {
        return `❌ **Failed to Get Status**\n\nError: ${parsedResult.error}`;
      }

    case "validate":
      if (parsedResult.success) {
        if (parsedResult.valid) {
          return (
            `✅ **Validation Passed**\n\n` +
            `All requirements follow EARS patterns and INCOSE rules.`
          );
        } else {
          let response = `⚠️ **Validation Issues Found**\n\n`;

          if (parsedResult.errors && parsedResult.errors.length > 0) {
            response += `**Errors (${parsedResult.errors.length}):**\n\n`;
            for (const error of parsedResult.errors) {
              response += `- **${error.requirementId}** (${error.rule}): ${error.message}\n`;
              if (error.suggestion) {
                response += `  💡 ${error.suggestion}\n`;
              }
            }
            response += "\n";
          }

          if (parsedResult.warnings && parsedResult.warnings.length > 0) {
            response += `**Warnings (${parsedResult.warnings.length}):**\n\n`;
            for (const warning of parsedResult.warnings) {
              response += `- **${warning.requirementId}**: ${warning.message}\n`;
            }
          }

          return response;
        }
      } else {
        return `❌ **Validation Failed**\n\nError: ${parsedResult.error}`;
      }

    case "approve":
      if (parsedResult.success) {
        return (
          `✅ **Phase Approved**\n\n` +
          `- Feature: ${parsedResult.featureName}\n` +
          `- Current Phase: ${parsedResult.currentPhase}\n` +
          `- Next Phase: ${parsedResult.nextPhase}\n\n` +
          `${parsedResult.message}\n\n` +
          `Use \`@spec continue ${parsedResult.featureName}\` to proceed.`
        );
      } else {
        return `❌ **Approval Failed**\n\nError: ${parsedResult.error}`;
      }

    case "unapprove":
      if (parsedResult.success) {
        return (
          `✅ **Phase Unapproved**\n\n` +
          `- Feature: ${parsedResult.featureName}\n` +
          `- Phase: ${parsedResult.phase}\n\n` +
          `${parsedResult.message}`
        );
      } else {
        return `❌ **Unapproval Failed**\n\nError: ${parsedResult.error}`;
      }

    case "update":
      if (parsedResult.success) {
        // Handle "continue" action with autonomous execution
        if (parsedResult.action === "continue") {
          // If shouldExecute is true, autonomous execution will be handled separately
          if (parsedResult.shouldExecute) {
            // This shouldn't normally be reached as execution is handled in handleChatRequest
            return `🤖 Starting autonomous execution for "${parsedResult.featureName}"...`;
          }

          // Show status and guidance when tasks aren't ready
          let response = `📍 **Current Status: ${parsedResult.featureName}**\n\n`;
          response += `- Current Phase: **${parsedResult.currentPhase}**\n`;
          response += `- Files: `;
          const files = [];
          if (parsedResult.hasRequirements) files.push("✅ requirements.md");
          if (parsedResult.hasDesign) files.push("✅ design.md");
          if (parsedResult.hasTasks) files.push("✅ tasks.md");
          response += files.join(", ") || "none";
          response += "\n\n";

          // Provide next steps guidance
          response += "**💡 Next Steps:**\n\n";
          if (!parsedResult.hasRequirements) {
            response +=
              "- Create requirements: Ask me to generate requirements for this feature\n";
          } else if (!parsedResult.hasDesign) {
            response +=
              "- Create design: Ask me to generate a design based on the requirements\n";
          } else if (!parsedResult.hasTasks) {
            response +=
              "- Create tasks: Ask me to generate tasks from the design\n";
          }

          response += `\n${parsedResult.message}`;
          return response;
        }

        // Regular update response
        return (
          `✅ **Spec Updated Successfully**\n\n` +
          `- Feature: ${parsedResult.featureName}\n` +
          `- Phase: ${parsedResult.phase}\n` +
          `- File: \`${parsedResult.filePath}\`\n\n` +
          `${parsedResult.message}`
        );
      } else {
        return (
          `❌ **Failed to Update Spec**\n\n` +
          `Error: ${parsedResult.error}\n\n` +
          (parsedResult.suggestion
            ? `💡 Suggestion: ${parsedResult.suggestion}`
            : "")
        );
      }

    case "execute":
      if (parsedResult.success) {
        return (
          `✅ **Task Status Updated**\n\n` +
          `- Feature: ${parsedResult.featureName}\n` +
          `- Task: ${parsedResult.taskId}\n` +
          `- Status: ${parsedResult.status}\n\n` +
          `${parsedResult.message}`
        );
      } else {
        return `❌ **Failed to Execute Task**\n\nError: ${parsedResult.error}`;
      }

    default:
      // Fallback: show raw JSON
      return `**Result:**\n\n\`\`\`json\n${JSON.stringify(
        parsedResult,
        null,
        2
      )}\n\`\`\``;
  }
}

/**
 * Route a command to the appropriate MCP tool
 */
export async function routeCommand(
  command: SpecCommand,
  mcpClient: SpecMCPClient
): Promise<any> {
  switch (command.action) {
    case "create":
      // Check if spec already exists BEFORE generating requirements
      const featureName = command.featureName || "new-feature";
      const featureIdea = command.parameters?.featureIdea || "";

      // Quick check if spec exists by trying to list and finding it
      try {
        const listResult = await mcpClient.listSpecs();
        const parsedList =
          typeof listResult === "string" ? JSON.parse(listResult) : listResult;
        const listContent = parsedList?.content?.[0]?.text
          ? JSON.parse(parsedList.content[0].text)
          : parsedList;

        const existingSpec = listContent?.specs?.find(
          (s: any) => s.featureName === featureName
        );

        if (existingSpec) {
          return {
            success: false,
            error: `Spec already exists for feature: ${featureName}`,
            suggestion:
              "Use update_spec to modify existing spec or delete the spec first",
          };
        }
      } catch (error) {
        // If list fails, continue with create attempt (let MCP server handle it)
      }

      // Generate requirements with LLM
      let llmGeneratedContent: string | null = null;
      try {
        llmGeneratedContent = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Generating requirements with AI...",
            cancellable: false,
          },
          async () => {
            return await generateRequirementsWithLLM(featureIdea);
          }
        );

        if (llmGeneratedContent) {
          vscode.window.showInformationMessage(
            `✅ Generated ${llmGeneratedContent.length} characters of requirements`
          );
        } else {
          vscode.window.showWarningMessage(
            "⚠️ AI generation unavailable, using fallback"
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `❌ LLM generation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Create spec with optional LLM-generated content
      // The MCP server will use this if provided, otherwise falls back to basic generation
      return await mcpClient.createSpec(
        featureName,
        featureIdea,
        llmGeneratedContent || undefined
      );

    case "list":
      return await mcpClient.listSpecs();

    case "status":
      if (!command.featureName) {
        throw new Error("Feature name is required for status command");
      }
      // Get spec state by reading the requirements file
      return await mcpClient.readSpec(command.featureName, "requirements");

    case "validate": {
      if (!command.featureName) {
        throw new Error("Feature name is required for validate command");
      }
      const phase = command.phase || "requirements";
      // Ensure phase is valid for readSpec (exclude "execution")
      const validPhase: "requirements" | "design" | "tasks" =
        phase === "execution"
          ? "requirements"
          : (phase as "requirements" | "design" | "tasks");
      // Read the spec document
      const readResult = await mcpClient.readSpec(
        command.featureName,
        validPhase
      );

      // Parse the content and validate
      const content =
        typeof readResult === "string"
          ? readResult
          : (readResult as any)?.content?.[0]?.text || "";
      const parsedContent =
        typeof content === "string" ? JSON.parse(content) : content;

      return await mcpClient.validateRequirements(parsedContent.content || "");
    }

    case "approve": {
      if (!command.featureName) {
        throw new Error("Feature name is required for approve command");
      }
      if (!command.phase) {
        throw new Error(
          "Phase is required for approve command (e.g., approve requirements feature-name)"
        );
      }

      // Approve phase will transition to the next phase
      const phaseTransitions = {
        requirements: "design",
        design: "tasks",
        tasks: "execution",
      };

      const nextPhase =
        phaseTransitions[command.phase as keyof typeof phaseTransitions];
      if (!nextPhase) {
        throw new Error(`Cannot approve phase: ${command.phase}`);
      }

      return {
        success: true,
        action: "approve",
        featureName: command.featureName,
        currentPhase: command.phase,
        nextPhase: nextPhase,
        message: `Phase "${command.phase}" approved for "${command.featureName}". Ready to proceed to ${nextPhase} phase.`,
      };
    }

    case "unapprove": {
      if (!command.featureName) {
        throw new Error("Feature name is required for unapprove command");
      }
      if (!command.phase) {
        throw new Error(
          "Phase is required for unapprove command (e.g., unapprove requirements feature-name)"
        );
      }

      return {
        success: true,
        action: "unapprove",
        featureName: command.featureName,
        phase: command.phase,
        message: `Phase "${command.phase}" unapproved for "${command.featureName}". You can now make changes to this phase.`,
      };
    }

    case "update":
      if (!command.featureName) {
        throw new Error("Feature name is required for update command");
      }

      // Special handling for "continue" - autonomous execution
      if (command.parameters?.continue) {
        // First, list specs to find the current state
        const listResult = await mcpClient.listSpecs();
        const parsedList =
          typeof listResult === "string" ? JSON.parse(listResult) : listResult;
        const listContent = parsedList?.content?.[0]?.text
          ? JSON.parse(parsedList.content[0].text)
          : parsedList;

        // Find the spec
        const spec = listContent?.specs?.find(
          (s: any) => s.featureName === command.featureName
        );

        if (!spec) {
          throw new Error(
            `Spec "${command.featureName}" not found. Use @spec list to see available specs.`
          );
        }

        // Auto-generate design if requirements exist but design doesn't
        if (spec.hasRequirements && !spec.hasDesign) {
          try {
            // Read requirements
            const reqResult = await mcpClient.readSpec(
              command.featureName,
              "requirements"
            );
            const reqContent =
              typeof reqResult === "string"
                ? reqResult
                : (reqResult as any)?.content?.[0]?.text || "";
            const parsedReq =
              typeof reqContent === "string"
                ? JSON.parse(reqContent)
                : reqContent;

            // Generate design with LLM
            const designContent = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Generating design with AI...",
                cancellable: false,
              },
              async () => {
                return await generateDesignWithLLM(
                  command.featureName,
                  parsedReq.content || ""
                );
              }
            );

            if (designContent) {
              // Update spec with design
              await mcpClient.updateSpec(
                command.featureName,
                "design",
                designContent
              );

              vscode.window.showInformationMessage(
                `✅ Generated design for ${command.featureName}`
              );

              return {
                success: true,
                action: "continue",
                featureName: command.featureName,
                currentPhase: "design",
                hasRequirements: true,
                hasDesign: true,
                hasTasks: false,
                directory: spec.directory,
                shouldExecute: false,
                message: `Design phase generated for "${command.featureName}". Review and approve before continuing to tasks.`,
              };
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `❌ Failed to generate design: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        // Return info for autonomous execution
        return {
          success: true,
          action: "continue",
          featureName: command.featureName,
          currentPhase: spec.currentPhase,
          hasRequirements: spec.hasRequirements,
          hasDesign: spec.hasDesign,
          hasTasks: spec.hasTasks,
          directory: spec.directory,
          // Signal that autonomous execution should happen
          shouldExecute: spec.hasTasks,
          message: spec.hasTasks
            ? `Ready to autonomously execute tasks for "${command.featureName}".`
            : `The "${command.featureName}" spec is in the ${spec.currentPhase} phase. Generate tasks before continuing with execution.`,
        };
      }

      // Regular update with content
      if (!command.phase) {
        throw new Error("Phase is required for update command");
      }
      return await mcpClient.updateSpec(
        command.featureName,
        command.phase as any,
        command.parameters?.content || ""
      );

    case "execute": {
      if (!command.featureName || !command.taskId) {
        throw new Error(
          "Feature name and task ID are required for execute command"
        );
      }

      // If this is a "complete" command, mark as completed
      if (command.parameters?.complete) {
        return await mcpClient.updateTaskStatus(
          command.featureName,
          command.taskId,
          "completed"
        );
      }

      // For execute command, mark as in-progress and return info for autonomous execution
      await mcpClient.updateTaskStatus(
        command.featureName,
        command.taskId,
        "in-progress"
      );

      return {
        success: true,
        action: "execute",
        featureName: command.featureName,
        taskId: command.taskId,
        shouldExecute: true,
        message: `Starting execution of task ${command.taskId} for "${command.featureName}"...`,
      };
    }

    default:
      throw new Error(`Unknown action: ${command.action}`);
  }
}

/**
 * Format error message with helpful suggestions
 */
export function formatErrorMessage(error: Error): string {
  const errorMessage = error.message;
  let response = `❌ **Error**\n\n${errorMessage}\n\n`;

  // Provide context-specific suggestions based on error message
  const suggestions: string[] = [];

  if (errorMessage.includes("Feature name is required")) {
    suggestions.push(
      "Include the feature name in your command, e.g., `@spec status for my-feature`"
    );
  }

  if (errorMessage.includes("Spec not found")) {
    suggestions.push(
      "Check the feature name spelling or use `@spec list` to see all available specs"
    );
    suggestions.push("Create a new spec with `@spec create <feature-name>`");
  }

  if (errorMessage.includes("Spec already exists")) {
    suggestions.push("Use `@spec update` to modify the existing spec instead");
    suggestions.push(
      "Choose a different feature name if you want to create a new spec"
    );
  }

  if (
    errorMessage.includes("not found") ||
    errorMessage.includes("does not exist")
  ) {
    suggestions.push("Verify the feature name and phase are correct");
    suggestions.push(
      "Use `@spec list` to see all available specs and their phases"
    );
  }

  if (errorMessage.includes("Task") && errorMessage.includes("not found")) {
    suggestions.push("Check the task ID format (e.g., `1`, `1.2`, `2.3`)");
    suggestions.push("View the tasks.md file to see all available task IDs");
  }

  if (errorMessage.includes("phase") || errorMessage.includes("Phase")) {
    suggestions.push("Valid phases are: `requirements`, `design`, `tasks`");
  }

  if (errorMessage.includes("Unknown action")) {
    suggestions.push(
      "Available commands: `create`, `list`, `status`, `validate`, `update`, `execute`"
    );
    suggestions.push(
      "Try `@spec list` to see all specs or `@spec create <feature-name>` to create a new one"
    );
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
    suggestions.push("The operation took too long. Try again in a moment.");
    suggestions.push(
      "If the problem persists, check if the MCP server is running properly"
    );
  }

  // Add generic suggestions if no specific ones were added
  if (suggestions.length === 0) {
    suggestions.push("Try `@spec list` to see all available specs");
    suggestions.push("Use `@spec create <feature-name>` to create a new spec");
    suggestions.push("Check the command syntax and try again");
  }

  // Add suggestions to response
  if (suggestions.length > 0) {
    response += "**💡 Suggestions:**\n\n";
    for (const suggestion of suggestions) {
      response += `- ${suggestion}\n`;
    }
  }

  return response;
}

/**
 * Handle incoming chat requests
 */
async function handleChatRequest(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  mcpClient: SpecMCPClient | null
): Promise<void> {
  try {
    // Get the user's message
    const message = request.prompt;

    // ALWAYS show what we received for debugging
    stream.markdown(`🔍 **DEBUG: Received message:** \`${message}\`\n\n`);

    // Check if MCP client is connected
    if (!mcpClient || !mcpClient.isConnected()) {
      stream.markdown(
        "❌ **Error**\n\n" +
          "Not connected\n\n" +
          "**💡 Suggestions:**\n\n" +
          "- The MCP server may still be starting. Wait a few seconds and try again.\n" +
          "- Check the Output panel (View → Output → Akira) for connection errors.\n" +
          "- Try reloading the VS Code window if the issue persists."
      );
      return;
    }

    // Parse the command
    const command = parseCommand(message);

    // Show parsed result
    stream.markdown(
      `🔍 **DEBUG: Parsed as:** \`${JSON.stringify(command)}\`\n\n`
    );

    // Route to appropriate MCP tool
    const result = await routeCommand(command, mcpClient);

    // Check if this is an autonomous execution request (continue or execute)
    if (
      result.success &&
      ((result.action === "continue" && result.shouldExecute) ||
        (result.action === "execute" && result.shouldExecute))
    ) {
      await handleAutonomousExecution(result.featureName, stream, _token);
      return;
    }

    // Format response
    const formattedResponse = formatResponse(command, result);

    // Send formatted response to chat
    stream.markdown(formattedResponse);
  } catch (error) {
    // Format error with helpful suggestions
    const errorResponse = formatErrorMessage(
      error instanceof Error ? error : new Error(String(error))
    );
    stream.markdown(errorResponse);
  }
}

/**
 * Handle autonomous task execution
 */
async function handleAutonomousExecution(
  featureName: string,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    stream.markdown("❌ No workspace folder found");
    return;
  }

  const config = vscode.workspace.getConfiguration("copilotSpec");
  const specDirectory = config.get<string>("specDirectory") || ".kiro/specs";

  stream.markdown(
    `🤖 **Starting Autonomous Execution**\n\n` +
      `Feature: ${featureName}\n\n` +
      `Finding next incomplete task...\n\n`
  );

  // Find the next task
  const nextTask = findNextTask(featureName, workspaceRoot, specDirectory);

  if (!nextTask) {
    stream.markdown(
      `✅ **All Tasks Complete!**\n\n` +
        `There are no more incomplete tasks for "${featureName}". ` +
        `The spec has been fully implemented!`
    );
    return;
  }

  stream.markdown(
    `📋 **Next Task:** ${nextTask.id} - ${nextTask.description}\n\n` +
      `Marking task as in-progress...\n\n`
  );

  // Mark task as in-progress
  markTaskInProgress(featureName, nextTask.id, workspaceRoot);
  updateTaskCheckbox(
    featureName,
    nextTask.id,
    "in-progress",
    workspaceRoot,
    specDirectory
  );

  // Build execution context
  const context = buildExecutionContext(
    featureName,
    nextTask,
    workspaceRoot,
    specDirectory
  );

  // Generate prompt for implementation
  const prompt = generateTaskExecutionPrompt(context);

  stream.markdown(`🔨 **Implementing task ${nextTask.id}...**\n\n`);

  try {
    // Show the task details
    stream.markdown(
      `**Task Details:**\n\n` +
        `${nextTask.description}\n\n`
    );

    // Show relevant context
    if (context.requirements) {
      stream.markdown(
        `**Requirements Context:**\n\n` +
          `\`\`\`markdown\n${context.requirements.substring(0, 500)}...\n\`\`\`\n\n`
      );
    }

    if (context.design) {
      stream.markdown(
        `**Design Context:**\n\n` +
          `\`\`\`markdown\n${context.design.substring(0, 500)}...\n\`\`\`\n\n`
      );
    }

    // Provide implementation guidance
    stream.markdown(
      `**Implementation Prompt:**\n\n` +
        `\`\`\`\n${prompt}\n\`\`\`\n\n`
    );

    // Guide the user on next steps
    stream.markdown(
      `**Next Steps:**\n\n` +
        `1. Review the task requirements and context above\n` +
        `2. Ask me to implement specific files or functionality\n` +
        `3. Test your implementation\n` +
        `4. Mark complete with: \`@spec ${featureName} complete ${nextTask.id}\`\n\n` +
        `**Example prompts:**\n` +
        `- "Create the file mentioned in the task"\n` +
        `- "Implement the function described in the task"\n` +
        `- "Write tests for this task"\n`
    );
  } catch (error) {
    stream.markdown(
      `\n\n❌ **Error implementing task ${nextTask.id}:**\n\n` +
        `${error instanceof Error ? error.message : String(error)}\n\n` +
        `The task has been left in "in-progress" state. You can retry with \`@spec ${featureName} continue\``
    );
  }
}
