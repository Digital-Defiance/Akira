# Autonomous Code Generation - Technical Deep Dive

## End-to-End Flow

### 1. User Initiates Autonomous Execution

```typescript
// Chat command triggered
@spec my-feature autonomously execute

// Or via CodeLens
click "Execute Autonomously" button

// Or via command palette
Cmd+Shift+P > Akira: Start Autonomous Execution
```

### 2. handleAutonomousExecution() (chat-participant.ts)

```typescript
async function handleAutonomousExecution(featureName, stream, token) {
  // 1. Find next incomplete task
  const nextTask = findNextTask(featureName, workspaceRoot, specDirectory);

  // 2. Show task in chat
  stream.markdown(`📋 **Next Task:** ${nextTask.id} - ${nextTask.description}`);

  // 3. Import and call autonomous executor
  const { executeTaskAutonomously } = await import("./autonomous-executor");

  // 4. Get extension context and output channel
  const extensionContext = await vscode.commands.executeCommand(
    "_spec.getExtensionContext",
  );
  const outputChannel = await vscode.commands.executeCommand(
    "_spec.getOutputChannel",
  );

  // 5. Execute task autonomously
  const result = await executeTaskAutonomously(
    featureName,
    nextTask,
    workspaceRoot,
    specDirectory,
    extensionContext,
    outputChannel,
  );

  // 6. Report results in chat
  if (result.success) {
    stream.markdown(`✅ Task ${nextTask.id} Completed Successfully!`);
    stream.markdown(
      `Generated Files:\n${result.filesModified.map((f) => `- ${f}`)}`,
    );
  } else {
    stream.markdown(`⚠️ Task ${nextTask.id} Could Not Be Completed`);
    stream.markdown(`Reason: ${result.error}`);
  }
}
```

### 3. executeTaskAutonomously() (autonomous-executor.ts)

```typescript
async function executeTaskAutonomously(
  featureName,
  task,
  workspaceRoot,
  specDirectory,
  context,
  outputChannel,
) {
  try {
    outputChannel.info(`🤖 AUTONOMOUS EXECUTION: Task ${task.id}`);

    // Mark task as in-progress
    markTaskInProgress(featureName, task.id, workspaceRoot);
    updateTaskCheckbox(
      featureName,
      task.id,
      "in-progress",
      workspaceRoot,
      specDirectory,
    );

    // Build execution context (requirements, design, completed tasks)
    const executionContext = buildExecutionContext(
      featureName,
      task,
      workspaceRoot,
      specDirectory,
    );

    // Prepare code generation request
    const generationRequest = {
      taskId: task.id,
      taskDescription: task.description,
      requirements: executionContext.requirements || "",
      design: executionContext.design,
      testFile: findTestFile(task, workspaceRoot),
    };

    outputChannel.info(`[AutoExec] Requesting code generation from Copilot...`);

    // Call code generator with validation
    const generationResult = await generateCodeWithValidation(
      generationRequest,
      workspaceRoot,
      context,
      outputChannel,
      undefined,
      2, // maxRetries
    );

    if (!generationResult.success) {
      // Handle generation failure
      updateTaskCheckbox(
        featureName,
        task.id,
        "not-started",
        workspaceRoot,
        specDirectory,
      );
      return {
        success: false,
        error: generationResult.error,
        message: `❌ Failed to generate code: ${generationResult.error}`,
      };
    }

    // Check test results
    if (generationResult.testResults?.passed) {
      markTaskCompleted(featureName, task.id, workspaceRoot);
      updateTaskCheckbox(
        featureName,
        task.id,
        "completed",
        workspaceRoot,
        specDirectory,
      );
      return {
        success: true,
        filesModified: Object.keys(generationResult.code),
        message: `✅ Task ${task.id} completed autonomously`,
      };
    } else if (generationResult.testResults?.passed === false) {
      // Tests failed
      updateTaskCheckbox(
        featureName,
        task.id,
        "not-started",
        workspaceRoot,
        specDirectory,
      );
      return {
        success: false,
        error: `Tests failed after retries`,
        message: `⚠️ Code generated but tests failed. Manual review required.`,
      };
    } else {
      // No tests, assume success
      markTaskCompleted(featureName, task.id, workspaceRoot);
      return {
        success: true,
        filesModified: Object.keys(generationResult.code),
        message: `✅ Task ${task.id} completed (no tests)`,
      };
    }
  } catch (error) {
    outputChannel.error(`[AutoExec] Error: ${error.message}`);
    updateTaskCheckbox(
      featureName,
      task.id,
      "not-started",
      workspaceRoot,
      specDirectory,
    );
    return {
      success: false,
      error: error.message,
      message: `❌ Error executing task`,
    };
  }
}
```

### 4. generateCodeWithValidation() (copilot-code-generator.ts)

```typescript
async function generateCodeWithValidation(
  request,
  workspaceRoot,
  context,
  outputChannel,
  cancellationToken,
  maxRetries = 2,
) {
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    outputChannel.info(
      `[CodeGen] Attempt ${retryCount + 1}/${maxRetries + 1}...`,
    );

    // 1. Generate code
    const result = await generateCode(
      request,
      context,
      outputChannel,
      cancellationToken,
    );

    if (!result.success) {
      return result; // Fatal error
    }

    // 2. Write generated code to files
    for (const [filePath, code] of Object.entries(result.code)) {
      const absolutePath = path.join(workspaceRoot, filePath);
      const dir = path.dirname(absolutePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(absolutePath, code, "utf-8");
      outputChannel.info(`[CodeGen] Wrote file: ${filePath}`);
    }

    // 3. Run tests if specified
    if (request.testFile) {
      const testResults = await executeTests(
        path.join(workspaceRoot, request.testFile),
        outputChannel,
      );

      if (testResults.passed) {
        outputChannel.info(`[CodeGen] ✅ Tests passed!`);
        result.testResults = testResults;
        result.retryCount = retryCount;
        return result;
      } else if (retryCount < maxRetries) {
        // Retry: Feed test failures back to Copilot
        outputChannel.info(`[CodeGen] ❌ Tests failed. Refining...`);

        // Append test failures to requirements
        request.existingCode = result.code;
        request.requirements = `${request.requirements}\n\n[PREVIOUS ATTEMPT FAILED TESTS]\n${formatTestFailures(testResults, request)}`;

        retryCount++;
        continue; // Try again
      } else {
        // Max retries exceeded
        result.testResults = testResults;
        result.retryCount = retryCount;
        return result;
      }
    } else {
      // No test file, assume success
      result.retryCount = retryCount;
      return result;
    }
  }
}
```

### 5. generateCode() - VS Code Language Model API Call

```typescript
async function generateCode(
  request,
  context,
  outputChannel,
  cancellationToken,
) {
  try {
    // 1. Select Copilot model
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o",
    });

    if (models.length === 0) {
      return {
        success: false,
        error: "No Copilot models available",
      };
    }

    const model = models[0];
    outputChannel.info(`[CodeGen] Using model: ${model.name}`);

    // 2. Craft generation prompt
    const prompt = craftGenerationPrompt(request);

    // 3. Send to Language Model API
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const chatRequest = model.sendRequest(messages, {}, cancellationToken);

    // 4. Stream response
    let fullResponse = "";
    for await (const chunk of chatRequest.text) {
      fullResponse += chunk;
    }

    outputChannel.info(`[CodeGen] Received ${fullResponse.length} characters`);

    // 5. Parse code blocks
    const codeBlocks = parseCodeBlocks(fullResponse);

    if (codeBlocks.length === 0) {
      return {
        success: false,
        error: "No code blocks found in response",
      };
    }

    // 6. Convert to file map
    const generatedCode = {};
    for (const block of codeBlocks) {
      generatedCode[block.filePath] = block.code;
    }

    return {
      success: true,
      code: generatedCode,
    };
  } catch (error) {
    if (error instanceof vscode.LanguageModelError) {
      // Handle specific LM errors
    }
    return {
      success: false,
      error: error.message,
    };
  }
}
```

## Prompt Engineering

### craftGenerationPrompt()

````typescript
function craftGenerationPrompt(request) {
  const parts = [
    `You are an expert code generator. Generate code to complete the following task:`,
    ``,
    `TASK ID: ${request.taskId}`,
    `TASK DESCRIPTION: ${request.taskDescription}`,
    ``,
    `REQUIREMENTS:`,
    request.requirements,
  ];

  if (request.design) {
    parts.push("", "DESIGN SPECIFICATION:", request.design);
  }

  if (request.existingCode && Object.keys(request.existingCode).length > 0) {
    parts.push("", "EXISTING CODE TO CONSIDER:");
    for (const [filePath, code] of Object.entries(request.existingCode)) {
      parts.push(`\nFile: ${filePath}`, "```", code, "```");
    }
  }

  parts.push(
    "",
    "INSTRUCTIONS:",
    "1. Generate complete, production-ready code",
    "2. Format each file as: ```path/to/file.ts ... ```",
    "3. Include all necessary imports and types",
    "4. Follow TypeScript/JavaScript best practices",
    "5. Ensure code is compatible with project structure",
    "6. Generate only the code, no explanations",
  );

  return parts.join("\n");
}
````

## Code Block Parsing

### parseCodeBlocks()

````typescript
function parseCodeBlocks(response) {
  const codeBlocks = [];
  const blockRegex = /```([^\n]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = blockRegex.exec(response)) !== null) {
    const languageOrPath = match[1].trim();
    const code = match[2].trim();

    // Check if it looks like a file path
    if (languageOrPath.includes("/") || languageOrPath.includes(".")) {
      codeBlocks.push({
        filePath: languageOrPath,
        language: inferLanguage(languageOrPath),
        code: code,
      });
    }
  }

  return codeBlocks;
}
````

## State Management

After successful execution:

```typescript
// Task status updated in state
state.taskStatuses[taskId] = "completed";
state.currentPhase = "tasks";

// Task checkbox updated in tasks.md
// From: - [ ] 1.1 Implement modular arithmetic
// To:   - [x] 1.1 Implement modular arithmetic

// Files written to workspace
src / arithmetic / modular - arithmetic.ts;
src / arithmetic / modular - arithmetic.test.ts;
```

## Error Recovery

### On Generation Failure

1. Task remains in previous state
2. No files written
3. User informed of error
4. Output channel shows detailed logs

### On Test Failure (with retries)

1. Keep generated files (for reference)
2. Append test failures to requirements
3. Request Copilot refinement
4. Run tests again
5. On max retries: Mark task incomplete

### On File Write Failure

1. Attempt to create directories
2. Check workspace permissions
3. Report error with file path
4. Task remains incomplete

## Logging Details

All operations logged with timestamps to Akira output channel:

```
[Time] [Component] [Level] Message

Examples:
[15:24:30.123] [CodeGen] [INFO] Starting code generation for task: 1.1
[15:24:35.456] [CodeGen] [INFO] Using model: Copilot (gpt-4o)
[15:24:40.789] [CodeGen] [INFO] Received response: 2841 characters
[15:24:41.012] [CodeGen] [INFO] Parsed 2 code blocks from response
[15:24:41.234] [CodeGen] [INFO] Generated code for: src/arithmetic/modular-arithmetic.ts (584 chars)
[15:24:41.456] [AutoExec] [INFO] Wrote file: src/arithmetic/modular-arithmetic.ts
[15:24:42.678] [TestRunner] [INFO] Running tests from: src/arithmetic/modular-arithmetic.test.ts
[15:24:45.901] [AutoExec] [INFO] ✅ Tests passed! Task 1.1 completed successfully.
```

## Performance Characteristics

| Operation              | Time             |
| ---------------------- | ---------------- |
| Copilot API call       | 3-10s            |
| Response streaming     | Included above   |
| Parse code blocks      | <100ms           |
| Write files            | <500ms per file  |
| Task status update     | <50ms            |
| Output channel logging | <10ms per line   |
| **Total per task**     | **5-20 seconds** |

## Security & Privacy

- Code never leaves your machine except to Copilot API
- All code written directly to workspace (visible in git)
- No automatic commits or pushes
- All operations logged locally
- Uses your Copilot subscription (no new API keys)
- Respects VS Code enterprise policies

## Extensibility Points

Easy to extend for:

- Additional test frameworks
- Different languages
- Custom code generators
- Alternative LM providers
- Pre/post-generation hooks
