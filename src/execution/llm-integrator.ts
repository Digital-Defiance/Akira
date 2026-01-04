/**
 * LLM Integration for Autonomous Execution
 * Connects execution engine to LLM code generation
 */

import * as vscode from "vscode";
import { generateDesignWithLLM } from "../llm-design-generator";
import { generateRequirementsWithLLM } from "../llm-requirements-generator";
import { generateTasksWithLLM } from "../llm-task-generator";
import { ExecutionAction, TaskRecord } from "./types";

/**
 * LLM generation request
 */
export interface LLMGenerationRequest {
  task: TaskRecord;
  context: {
    specPath: string;
    sessionId: string;
    phase: number;
    previousTasks: TaskRecord[];
  };
}

/**
 * LLM generation result
 */
export interface LLMGenerationResult {
  success: boolean;
  actions: ExecutionAction[];
  error?: string;
  reasoning?: string;
}

/**
 * LLM Integrator connects execution engine to LLM generators
 */
export class LLMIntegrator {
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "Akira LLM Integration"
    );
  }

  /**
   * Generate execution actions using LLM
   */
  async generateActions(
    request: LLMGenerationRequest
  ): Promise<LLMGenerationResult> {
    try {
      const { task, context } = request;

      // Determine generation type based on task description
      const generationType = this.inferGenerationType(task.description);

      switch (generationType) {
        case "requirements":
          return await this.generateRequirements(request);
        case "design":
          return await this.generateDesign(request);
        case "tasks":
          return await this.generateTasks(request);
        case "implementation":
          return await this.generateImplementation(request);
        default:
          return {
            success: false,
            actions: [],
            error: "Could not determine generation type",
          };
      }
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate requirements using LLM
   */
  private async generateRequirements(
    request: LLMGenerationRequest
  ): Promise<LLMGenerationResult> {
    const { context } = request;

    try {
      // Read spec content
      const specUri = vscode.Uri.file(context.specPath);
      const specContent = await vscode.workspace.fs.readFile(specUri);
      const specText = Buffer.from(specContent).toString("utf-8");

      // Generate requirements
      const result = await generateRequirementsWithLLM(specText);

      if (!result.success || !result.requirements) {
        return {
          success: false,
          actions: [],
          error: result.error || "Requirements generation failed",
        };
      }

      // Create actions to write requirements
      const actions: ExecutionAction[] = [
        {
          type: "file-write",
          path: context.specPath,
          content: result.requirements,
        },
      ];

      return {
        success: true,
        actions,
        reasoning: "Generated requirements section",
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate design using LLM
   */
  private async generateDesign(
    request: LLMGenerationRequest
  ): Promise<LLMGenerationResult> {
    const { context } = request;

    try {
      // Read spec content
      const specUri = vscode.Uri.file(context.specPath);
      const specContent = await vscode.workspace.fs.readFile(specUri);
      const specText = Buffer.from(specContent).toString("utf-8");

      // Generate design
      const result = await generateDesignWithLLM(specText);

      if (!result.success || !result.design) {
        return {
          success: false,
          actions: [],
          error: result.error || "Design generation failed",
        };
      }

      // Create actions to write design
      const actions: ExecutionAction[] = [
        {
          type: "file-write",
          path: context.specPath,
          content: result.design,
        },
      ];

      return {
        success: true,
        actions,
        reasoning: "Generated design section",
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate tasks using LLM
   */
  private async generateTasks(
    request: LLMGenerationRequest
  ): Promise<LLMGenerationResult> {
    const { context } = request;

    try {
      // Read spec content
      const specUri = vscode.Uri.file(context.specPath);
      const specContent = await vscode.workspace.fs.readFile(specUri);
      const specText = Buffer.from(specContent).toString("utf-8");

      // Generate tasks
      const result = await generateTasksWithLLM(specText);

      if (!result.success || !result.tasks) {
        return {
          success: false,
          actions: [],
          error: result.error || "Task generation failed",
        };
      }

      // Create actions to write tasks
      const actions: ExecutionAction[] = [
        {
          type: "file-write",
          path: context.specPath,
          content: result.tasks,
        },
      ];

      return {
        success: true,
        actions,
        reasoning: "Generated tasks section",
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate implementation code using LLM
   */
  private async generateImplementation(
    request: LLMGenerationRequest
  ): Promise<LLMGenerationResult> {
    const { task, context } = request;

    try {
      // Build context for code generation
      const prompt = this.buildImplementationPrompt(task, context);

      // For now, we'll use a simple approach:
      // Parse the task description for file paths and actions
      const actions = this.parseTaskForActions(task);

      if (actions.length === 0) {
        return {
          success: false,
          actions: [],
          error: "Could not determine actions from task description",
        };
      }

      return {
        success: true,
        actions,
        reasoning: "Parsed actions from task description",
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Infer generation type from task description
   */
  private inferGenerationType(
    description: string
  ): "requirements" | "design" | "tasks" | "implementation" | "unknown" {
    const lower = description.toLowerCase();

    if (
      lower.includes("requirements") ||
      lower.includes("user stories") ||
      lower.includes("acceptance criteria")
    ) {
      return "requirements";
    }

    if (
      lower.includes("design") ||
      lower.includes("architecture") ||
      lower.includes("structure")
    ) {
      return "design";
    }

    if (
      lower.includes("tasks") ||
      lower.includes("implementation plan") ||
      lower.includes("breakdown")
    ) {
      return "tasks";
    }

    if (
      lower.includes("implement") ||
      lower.includes("create") ||
      lower.includes("write") ||
      lower.includes("build")
    ) {
      return "implementation";
    }

    return "unknown";
  }

  /**
   * Build prompt for implementation generation
   */
  private buildImplementationPrompt(
    task: TaskRecord,
    context: LLMGenerationRequest["context"]
  ): string {
    const previousTaskSummary = context.previousTasks
      .slice(-3)
      .map((t) => `- ${t.description}`)
      .join("\n");

    return `
# Task Implementation Request

## Current Task
${task.description}

## Context
- Spec: ${context.specPath}
- Session: ${context.sessionId}
- Phase: ${context.phase}

## Previous Tasks
${previousTaskSummary || "None"}

## Instructions
Generate the necessary code and file changes to complete this task.
Provide specific file paths and content.
`.trim();
  }

  /**
   * Parse task description for actions
   */
  private parseTaskForActions(task: TaskRecord): ExecutionAction[] {
    const actions: ExecutionAction[] = [];
    const description = task.description;

    // Look for file creation patterns
    const createFilePattern = /create\s+(?:file\s+)?['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = createFilePattern.exec(description)) !== null) {
      actions.push({
        type: "file-write",
        path: match[1],
        content: `// Generated file: ${match[1]}\n// TODO: Implement\n`,
      });
    }

    // Look for command execution patterns
    const commandPattern = /run\s+['"`]([^'"`]+)['"`]/gi;
    while ((match = commandPattern.exec(description)) !== null) {
      actions.push({
        type: "command",
        command: match[1],
      });
    }

    return actions;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
