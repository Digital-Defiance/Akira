/**
 * LLM-powered Design Generator
 * Uses VS Code Language Model API to generate architectural design from requirements
 */

import * as vscode from "vscode";

/**
 * Generate design document using Copilot LLM
 */
export async function generateDesignWithLLM(
  featureName: string,
  requirementsContent: string
): Promise<string | null> {
  const outputChannel = vscode.window.createOutputChannel("Akira LLM");

  try {
    outputChannel.appendLine(
      "[LLM Design Generator] Starting design generation..."
    );
    outputChannel.appendLine(`[LLM Design Generator] Feature: ${featureName}`);

    // Use the user's selected/default model
    const models = await vscode.lm.selectChatModels();
    outputChannel.appendLine(
      `[LLM Design Generator] Found ${models.length} available model(s)`
    );

    if (models.length === 0) {
      outputChannel.appendLine(
        "[LLM Design Generator] ERROR: No language models available"
      );
      outputChannel.show();
      return null;
    }

    const model = models[0];
    outputChannel.appendLine(
      `[LLM Design Generator] Using model: ${model.id} (vendor: ${model.vendor}, family: ${model.family})`
    );

    // Create prompt for design generation
    const prompt = createDesignPrompt(featureName, requirementsContent);
    outputChannel.appendLine(
      `[LLM Design Generator] Prompt created, length: ${prompt.length}`
    );

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    // Send request to language model
    outputChannel.appendLine(
      "[LLM Design Generator] Sending request to LLM..."
    );
    const response = await model.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token
    );

    // Collect the response
    let fullResponse = "";
    for await (const chunk of response.text) {
      fullResponse += chunk;
    }

    outputChannel.appendLine(
      `[LLM Design Generator] SUCCESS! Received response, length: ${fullResponse.length}`
    );

    return fullResponse;
  } catch (error) {
    outputChannel.appendLine(`[LLM Design Generator] ERROR: ${error}`);
    outputChannel.show();
    return null;
  }
}

/**
 * Create a prompt for the LLM to generate architectural design
 */
function createDesignPrompt(
  featureName: string,
  requirementsContent: string
): string {
  return `Generate a comprehensive architectural design document for the following feature based on its requirements.

Feature: ${featureName}

Requirements Document:
${requirementsContent}

Generate a detailed design document in Markdown format with the following sections:

# Design Document

## Overview
Brief summary of the architectural approach and design philosophy

## System Architecture
High-level system architecture description. Include:
- Major components and their responsibilities
- Component interactions and dependencies
- Data flow between components

## Component Design
For each major component, describe:
- Purpose and responsibilities
- Public interfaces/APIs
- Internal structure
- Dependencies on other components

## Data Model
Describe data structures, schemas, and persistence:
- Key data types and interfaces
- Data validation rules
- Storage mechanisms (files, memory, database)
- Data lifecycle management

## Sequence Diagrams (in text/Mermaid)
Describe key interaction flows:
- User interaction flows
- Event processing flows
- Error handling flows

## Design Decisions
Document key architectural decisions:
- Technology choices and rationale
- Design patterns used
- Trade-offs considered
- Alternative approaches rejected

## Error Handling Strategy
How the system handles errors:
- Error types and categories
- Recovery mechanisms
- User feedback approach
- Logging and debugging support

## Performance Considerations
Expected performance characteristics:
- Scalability limits
- Resource usage
- Optimization strategies
- Performance monitoring

## Security & Privacy
Security considerations:
- Authentication/authorization (if applicable)
- Data protection
- Input validation
- Security best practices

## Testing Strategy
How the design supports testing:
- Unit testing approach
- Integration testing approach
- Testability considerations
- Mock/stub strategies

## Future Extensibility
How the design accommodates future growth:
- Extension points
- Plugin architecture (if applicable)
- Backward compatibility considerations

Return the complete design document in Markdown format. Be specific and technical.`;
}
