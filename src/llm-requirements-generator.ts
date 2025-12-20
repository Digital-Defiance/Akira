/**
 * LLM-powered Requirements Generator
 * Uses VS Code Language Model API to generate EARS-compliant requirements
 */

import * as vscode from "vscode";

/**
 * Generate requirements using Copilot LLM
 */
export async function generateRequirementsWithLLM(featureIdea: string): Promise<string | null> {
  const outputChannel = vscode.window.createOutputChannel("Akira LLM");
  
  try {
    outputChannel.appendLine("[LLM Generator] Starting requirements generation...");
    outputChannel.appendLine(`[LLM Generator] Feature idea: ${featureIdea.substring(0, 100)}...`);
    
    // Use the user's selected/default model without filtering
    const models = await vscode.lm.selectChatModels();
    outputChannel.appendLine(`[LLM Generator] Found ${models.length} available model(s)`);

    if (models.length === 0) {
      outputChannel.appendLine("[LLM Generator] ERROR: No language models available");
      outputChannel.appendLine("[LLM Generator] Make sure GitHub Copilot Chat is enabled");
      outputChannel.show();
      return null;
    }

    const model = models[0];
    outputChannel.appendLine(`[LLM Generator] Using model: ${model.id} (vendor: ${model.vendor}, family: ${model.family})`);

    // Create prompt for requirements generation
    const prompt = createRequirementsPrompt(featureIdea);
    outputChannel.appendLine(`[LLM Generator] Prompt created, length: ${prompt.length}`);
    
    const messages = [
      vscode.LanguageModelChatMessage.User(prompt)
    ];

    // Send request to language model
    outputChannel.appendLine("[LLM Generator] Sending request to LLM...");
    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    // Collect the response
    let fullResponse = "";
    for await (const chunk of response.text) {
      fullResponse += chunk;
    }

    outputChannel.appendLine(`[LLM Generator] SUCCESS! Received response, length: ${fullResponse.length}`);
    outputChannel.appendLine(`[LLM Generator] Response preview: ${fullResponse.substring(0, 200)}`);

    return fullResponse;
  } catch (error) {
    outputChannel.appendLine(`[LLM Generator] ERROR: ${error}`);
    outputChannel.show();
    return null;
  }
}

/**
 * Create a prompt for the LLM to generate EARS-compliant requirements
 */
function createRequirementsPrompt(featureIdea: string): string {
  return `Generate comprehensive software requirements for the following feature idea using the EARS (Easy Approach to Requirements Syntax) patterns and INCOSE best practices.

Feature Idea: ${featureIdea}

Generate 8-12 user stories with detailed acceptance criteria covering:
- Core functionality (main features and capabilities)
- User interactions (UI/UX requirements)
- Data management (storage, validation, persistence)
- Error handling (edge cases, validation failures)
- Performance (speed, scalability expectations)
- Integration (external systems, APIs, events)
- Configuration (settings, customization)
- Security/Permissions (if applicable)

Each acceptance criterion must follow one of these EARS patterns:

1. Ubiquitous: "The <system> shall <action>"
2. Event-driven: "WHEN <trigger> the <system> shall <action>"
3. State-driven: "WHILE <state> the <system> shall <action>"
4. Unwanted behavior: "IF <condition> THEN the <system> shall <action>"
5. Optional: "WHERE <feature is included> the <system> shall <action>"
6. Complex: Combinations of the above

INCOSE Rules to follow:
- Use "shall" for mandatory requirements
- Be specific, measurable, and testable
- Avoid ambiguous words like "support", "handle", "process"
- Use active voice
- One requirement per statement
- Include 3-6 acceptance criteria per user story

Return your response in this JSON format:
{
  "glossary": [
    {"term": "Term1", "definition": "Definition of technical term"},
    {"term": "Term2", "definition": "Another technical term"}
  ],
  "requirements": [
    {
      "id": "REQ-1",
      "userStory": {
        "role": "user role",
        "feature": "what they want",
        "benefit": "why they want it"
      },
      "acceptanceCriteria": [
        {"id": "REQ-1.1", "text": "The system shall..."},
        {"id": "REQ-1.2", "text": "WHEN user clicks button the system shall..."}
      ]
    }
  ]
}

Return ONLY valid JSON, no markdown code blocks or explanations.`;
}
