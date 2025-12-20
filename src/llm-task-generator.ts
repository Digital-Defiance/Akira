/**
 * LLM-powered Task Generator
 * Uses VS Code Language Model API to generate implementation tasks from design
 */

import * as vscode from "vscode";

/**
 * Generate tasks document using Copilot LLM
 */
export async function generateTasksWithLLM(
  featureName: string,
  designContent: string
): Promise<string | null> {
  const outputChannel = vscode.window.createOutputChannel("Akira LLM");

  try {
    outputChannel.appendLine("[LLM Task Generator] Starting task generation...");
    outputChannel.appendLine(`[LLM Task Generator] Feature: ${featureName}`);

    // Use the user's selected/default model
    const models = await vscode.lm.selectChatModels();
    outputChannel.appendLine(`[LLM Task Generator] Found ${models.length} available model(s)`);

    if (models.length === 0) {
      outputChannel.appendLine("[LLM Task Generator] ERROR: No language models available");
      outputChannel.show();
      return null;
    }

    const model = models[0];
    outputChannel.appendLine(
      `[LLM Task Generator] Using model: ${model.id} (vendor: ${model.vendor}, family: ${model.family})`
    );

    // Create prompt for task generation
    const prompt = createTaskPrompt(featureName, designContent);
    outputChannel.appendLine(`[LLM Task Generator] Prompt created, length: ${prompt.length}`);

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    // Send request to language model
    outputChannel.appendLine("[LLM Task Generator] Sending request to LLM...");
    const response = await model.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token
    );

    // Collect the response
    let result = "";
    for await (const chunk of response.text) {
      result += chunk;
    }

    outputChannel.appendLine(`[LLM Task Generator] Received response, length: ${result.length}`);
    outputChannel.appendLine("[LLM Task Generator] Task generation complete");

    return result;
  } catch (error) {
    outputChannel.appendLine(`[LLM Task Generator] ERROR: ${error}`);
    outputChannel.show();
    return null;
  }
}

/**
 * Create prompt for task generation
 */
function createTaskPrompt(featureName: string, designContent: string): string {
  return `You are a senior software engineer creating an implementation task list for the feature "${featureName}".

Based on the following design document, generate a comprehensive list of implementation tasks organized into phases and subtasks.

DESIGN DOCUMENT:
${designContent}

Generate a tasks.md file with the following structure:

# Tasks for ${featureName}

## Phase 1: Foundation & Setup
- [ ] 1.1 Task description
- [ ] 1.2 Task description
  - Implementation notes
  - Success criteria

## Phase 2: Core Implementation
- [ ] 2.1 Task description
- [ ] 2.2 Task description

## Phase 3: Integration & Polish
- [ ] 3.1 Task description
- [ ] 3.2 Task description

## Phase 4: Testing & Documentation
- [ ] 4.1 Task description
- [ ] 4.2 Task description

IMPORTANT GUIDELINES:
1. Use checkbox format: - [ ] for pending tasks
2. Number tasks hierarchically (1.1, 1.2, 2.1, etc.)
3. Include 10-20 actionable, specific tasks
4. Each task should be completable in 30 minutes to 2 hours
5. Add implementation notes and success criteria for complex tasks
6. Cover: setup, core logic, error handling, testing, documentation
7. Order tasks by dependencies (foundational work first)
8. Be specific about file names, function names, and implementation details
9. Include both coding and non-coding tasks (testing, documentation, review)
10. Add optional tasks marked with (Optional) for enhancements

Generate the complete tasks.md content now:`;
}
