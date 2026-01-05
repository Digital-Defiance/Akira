/**
 * LLM Integration for Autonomous Execution
 * Connects execution engine to LLM code generation
 */

import * as vscode from "vscode";
import { generateDesignWithLLM } from "../llm-design-generator";
import { generateRequirementsWithLLM } from "../llm-requirements-generator";
import { generateTasksWithLLM } from "../llm-task-generator";
import { ExecutionAction, TaskRecord, FailureContext } from "./types";

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
  failureContext?: FailureContext;
}

/**
 * LLM generation result
 */
export interface LLMGenerationResult {
  success: boolean;
  actions: ExecutionAction[];
  error?: string;
  reasoning?: string;
  taskId?: string;
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

      // Determine generation type based on task title or description
      const taskText = task.description || task.title || "";
      const generationType = this.inferGenerationType(taskText);

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
            error: `Could not determine generation type from task: "${taskText}"`,
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
    const { task, context, failureContext } = request;

    try {
      // Build context for code generation
      const prompt = this.buildImplementationPrompt(task, context, failureContext);

      // For now, we'll use a simple approach:
      // Parse the task description for file paths and actions
      const actions = this.parseTaskForActions(task);

      if (actions.length === 0) {
        return {
          success: false,
          actions: [],
          error: "Could not determine actions from task description",
          taskId: task.id,
        };
      }

      return {
        success: true,
        actions,
        reasoning: "Parsed actions from task description",
        taskId: task.id,
      };
    } catch (error) {
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : String(error),
        taskId: task.id,
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
    context: LLMGenerationRequest["context"],
    failureContext?: FailureContext
  ): string {
    const previousTaskSummary = context.previousTasks
      .slice(-3)
      .map((t) => `- ${t.title}`)
      .join("\n");

    let prompt = `
# Task Implementation Request

## Current Task
${task.title}

## Context
- Spec: ${context.specPath}
- Session: ${context.sessionId}
- Phase: ${context.phase}

## Previous Tasks
${previousTaskSummary || "None"}
`.trim();

    // Add failure context if provided
    if (failureContext && failureContext.previousAttempts.length > 0) {
      prompt += `\n\n## Previous Attempts\n`;
      prompt += `This task has been attempted ${failureContext.previousAttempts.length} time(s) before.\n\n`;

      for (const attempt of failureContext.previousAttempts) {
        prompt += `### Attempt ${attempt.iteration} (${attempt.timestamp})\n`;
        prompt += `**Actions Taken:**\n`;
        for (const action of attempt.actions) {
          prompt += `- ${action.type}: ${action.target}\n`;
        }
        prompt += `\n**Result:** ${attempt.result.success ? "Success" : "Failed"}\n`;
        if (attempt.result.error) {
          prompt += `**Error:** ${attempt.result.error}\n`;
        }
        prompt += `**Evaluation:** ${attempt.evaluationReason} (confidence: ${attempt.confidence})\n\n`;
      }

      // Add failure patterns summary
      if (failureContext.failurePatterns.length > 0) {
        prompt += `## Failure Patterns Detected\n`;
        prompt += this.summarizeFailurePatterns(failureContext.failurePatterns);
        prompt += `\n`;
      }

      // Add environment state
      if (failureContext.environmentState.filesCreated.length > 0) {
        prompt += `## Files Created in Previous Attempts\n`;
        for (const file of failureContext.environmentState.filesCreated) {
          prompt += `- ${file}\n`;
        }
        prompt += `\n`;
      }

      if (failureContext.environmentState.filesModified.length > 0) {
        prompt += `## Files Modified in Previous Attempts\n`;
        for (const file of failureContext.environmentState.filesModified) {
          prompt += `- ${file}\n`;
        }
        prompt += `\n`;
      }

      // Add explicit instructions to try different approach
      prompt += this.buildDifferentApproachInstructions(failureContext);
    }

    prompt += `\n## Instructions\n`;
    prompt += `Generate the necessary code and file changes to complete this task.\n`;
    prompt += `Provide specific file paths and content.\n`;

    return prompt;
  }

  /**
   * Summarize failure patterns in a clear, actionable way
   * Validates: Requirements 3.4
   */
  private summarizeFailurePatterns(patterns: FailurePattern[]): string {
    let summary = "";

    // Group patterns by frequency
    const frequent = patterns.filter((p) => p.occurrences >= 2);
    const occasional = patterns.filter((p) => p.occurrences === 1);

    if (frequent.length > 0) {
      summary += `**Recurring Issues (appeared multiple times):**\n`;
      for (const pattern of frequent) {
        summary += `- "${pattern.errorMessage}" (occurred ${pattern.occurrences} times)\n`;
        summary += `  First seen: ${pattern.firstSeen}, Last seen: ${pattern.lastSeen}\n`;
      }
      summary += `\n`;
    }

    if (occasional.length > 0) {
      summary += `**Other Issues:**\n`;
      for (const pattern of occasional) {
        summary += `- "${pattern.errorMessage}"\n`;
      }
      summary += `\n`;
    }

    // Add analysis
    if (frequent.length > 0) {
      summary += `**Analysis:** The recurring issues suggest a systematic problem that needs a fundamentally different approach.\n`;
    }

    return summary;
  }

  /**
   * Build explicit instructions to try a different approach
   * Validates: Requirements 3.5
   */
  private buildDifferentApproachInstructions(
    failureContext: FailureContext
  ): string {
    let instructions = `\n## ⚠️ CRITICAL: Try a Different Approach\n\n`;
    instructions += `The previous ${failureContext.previousAttempts.length} attempt(s) did not succeed. `;
    instructions += `You MUST try a fundamentally different strategy.\n\n`;

    instructions += `**DO NOT:**\n`;
    instructions += `- Repeat the same actions with minor tweaks\n`;
    instructions += `- Use the same file paths if they caused errors\n`;
    instructions += `- Run the same commands that failed before\n`;
    instructions += `- Make assumptions that were proven wrong\n\n`;

    instructions += `**INSTEAD, CONSIDER:**\n`;
    instructions += `- Different file locations or directory structures\n`;
    instructions += `- Alternative commands or tools\n`;
    instructions += `- A completely different implementation approach\n`;
    instructions += `- Missing dependencies, setup steps, or prerequisites\n`;
    instructions += `- Different order of operations\n`;
    instructions += `- Checking if files/directories exist before operating on them\n`;
    instructions += `- Using different APIs or libraries\n\n`;

    // Add specific suggestions based on failure patterns
    const hasFileErrors = failureContext.failurePatterns.some((p) =>
      p.errorMessage.toLowerCase().includes("file")
    );
    const hasCommandErrors = failureContext.failurePatterns.some((p) =>
      p.errorMessage.toLowerCase().includes("command")
    );
    const hasPermissionErrors = failureContext.failurePatterns.some((p) =>
      p.errorMessage.toLowerCase().includes("permission")
    );

    if (hasFileErrors) {
      instructions += `**File-related errors detected:** Verify file paths, check if parent directories exist, ensure proper file extensions.\n`;
    }

    if (hasCommandErrors) {
      instructions += `**Command-related errors detected:** Verify command availability, check working directory, ensure proper arguments.\n`;
    }

    if (hasPermissionErrors) {
      instructions += `**Permission errors detected:** Check file permissions, verify write access, consider alternative locations.\n`;
    }

    instructions += `\n`;

    return instructions;
  }

  /**
   * Parse task description for actions
   */
  private parseTaskForActions(task: TaskRecord): ExecutionAction[] {
    const actions: ExecutionAction[] = [];
    const description = task.description || task.title || "";

    // Look for file creation patterns
    const createFilePattern = /create\s+(?:file\s+)?['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = createFilePattern.exec(description)) !== null) {
      actions.push({
        type: "file-write",
        target: match[1],
        content: `// Generated file: ${match[1]}\n// TODO: Implement\n`,
      });
    }

    // Look for command execution patterns
    const commandPattern = /run\s+['"`]([^'"`]+)['"`]/gi;
    while ((match = commandPattern.exec(description)) !== null) {
      actions.push({
        type: "command",
        target: match[1],
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
