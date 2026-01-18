/**
 * Copilot Code Generator
 * 
 * Uses VS Code's native Language Model API to generate code autonomously
 * based on specification documents and task requirements.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface CodeGenerationRequest {
  taskId: string;
  taskDescription: string;
  requirements: string;
  design?: string;
  existingCode?: Record<string, string>; // Map of file paths to current code
  testFile?: string; // Path to test file to validate against
}

export interface CodeGenerationResult {
  success: boolean;
  code: Record<string, string>; // Map of file paths to generated code
  testResults?: {
    passed: boolean;
    output: string;
    failedTests?: string[];
  };
  error?: string;
  retryCount?: number;
}

export interface GeneratedCodeBlock {
  filePath: string;
  language: string;
  code: string;
}

/**
 * Generate code using VS Code's Language Model API (Copilot)
 */
export async function generateCode(
  request: CodeGenerationRequest,
  outputChannel?: vscode.LogOutputChannel,
  cancellationToken?: vscode.CancellationToken
): Promise<CodeGenerationResult> {
  try {
    outputChannel?.info(`[CodeGen] Starting code generation for task: ${request.taskId}`);

    // Select Copilot model
    let models: vscode.LanguageModelChat[] = [];
    try {
      models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o',
      });
    } catch (error) {
      // Fallback to any available Copilot model
      models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }

    if (models.length === 0) {
      return {
        success: false,
        code: {},
        error: 'No Copilot models available. Ensure Copilot is installed and enabled.',
      };
    }

    const model = models[0];
    outputChannel?.info(`[CodeGen] Using model: ${model.name} (${model.family})`);

    // Craft the generation prompt
    const prompt = craftGenerationPrompt(request);
    
    outputChannel?.info(`[CodeGen] Sending prompt to Copilot...`);
    outputChannel?.debug(`[CodeGen] Prompt length: ${prompt.length} characters`);

    // Send request to Language Model
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    const chatRequest = await model.sendRequest(messages, {}, cancellationToken);
    let fullResponse = '';

    // Stream the response
    for await (const chunk of chatRequest.text) {
      fullResponse += chunk;
    }

    outputChannel?.info(`[CodeGen] Received response: ${fullResponse.length} characters`);
    outputChannel?.debug(`[CodeGen] Response preview: ${fullResponse.substring(0, 200)}...`);

    // Parse generated code blocks from response
    const codeBlocks = parseCodeBlocks(fullResponse);
    
    if (codeBlocks.length === 0) {
      return {
        success: false,
        code: {},
        error: 'No code blocks found in Copilot response. Response may be off-topic or invalid.',
      };
    }

    outputChannel?.info(`[CodeGen] Parsed ${codeBlocks.length} code blocks from response`);

    // Convert code blocks to file map
    const generatedCode: Record<string, string> = {};
    for (const block of codeBlocks) {
      generatedCode[block.filePath] = block.code;
      outputChannel?.info(`[CodeGen] Generated code for: ${block.filePath} (${block.code.length} chars)`);
    }

    return {
      success: true,
      code: generatedCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel?.error(`[CodeGen] Code generation failed: ${errorMessage}`);

    // Check for specific error types
    if (error instanceof vscode.LanguageModelError) {
      const cause = error.cause as any;
      if (cause?.message?.includes('off_topic')) {
        return {
          success: false,
          code: {},
          error: 'The model considered the request off-topic. Ensure requirements and task are well-defined.',
        };
      }
    }

    return {
      success: false,
      code: {},
      error: `Code generation failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate code with test-driven refinement
 * Generates code, runs tests, and refines if tests fail
 */
export async function generateCodeWithValidation(
  request: CodeGenerationRequest,
  workspaceRoot: string,
  outputChannel?: vscode.LogOutputChannel,
  cancellationToken?: vscode.CancellationToken,
  maxRetries: number = 2
): Promise<CodeGenerationResult> {
  let retryCount = 0;
  let lastResult: CodeGenerationResult | null = null;

  while (retryCount <= maxRetries) {
    outputChannel?.info(`[CodeGen] Attempt ${retryCount + 1}/${maxRetries + 1}...`);

    // Generate code
    const result = await generateCode(request, outputChannel, cancellationToken);

    if (!result.success) {
      lastResult = result;
      return result; // Fatal error, don't retry
    }

    // Write code to files
    try {
      for (const [filePath, code] of Object.entries(result.code)) {
        const absolutePath = path.join(workspaceRoot, filePath);
        const dir = path.dirname(absolutePath);

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          outputChannel?.info(`[CodeGen] Created directory: ${dir}`);
        }

        fs.writeFileSync(absolutePath, code, 'utf-8');
        outputChannel?.info(`[CodeGen] Wrote file: ${filePath}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      outputChannel?.error(`[CodeGen] Failed to write files: ${errorMessage}`);
      return {
        success: false,
        code: result.code,
        error: `Failed to write generated files: ${errorMessage}`,
      };
    }

    // Run tests if test file is specified
    if (request.testFile) {
      outputChannel?.info(`[CodeGen] Running tests from: ${request.testFile}`);
      
      const testResults = await executeTests(
        path.join(workspaceRoot, request.testFile),
        outputChannel
      );

      if (testResults.passed) {
        outputChannel?.info(`[CodeGen] ✅ Tests passed! Generation successful.`);
        result.testResults = testResults;
        result.retryCount = retryCount;
        return result;
      } else {
        outputChannel?.warn(`[CodeGen] ❌ Tests failed. ${testResults.failedTests?.length || 0} failures.`);
        
        if (retryCount < maxRetries) {
          // Feed test failures back to Copilot for refinement
          outputChannel?.info(`[CodeGen] Refining code based on test failures...`);
          
          request.existingCode = result.code;
          const testFailureContext = formatTestFailures(testResults, request);
          
          const refinementRequest: CodeGenerationRequest = {
            ...request,
            requirements: `${request.requirements}\n\n[PREVIOUS ATTEMPT FAILED TESTS]\n${testFailureContext}`,
          };

          request = refinementRequest;
          retryCount++;
          continue;
        } else {
          // Max retries exceeded
          outputChannel?.error(`[CodeGen] Max retries (${maxRetries}) exceeded. Tests still failing.`);
          result.testResults = testResults;
          result.retryCount = retryCount;
          return result;
        }
      }
    }

    // No test file, return success
    result.retryCount = retryCount;
    return result;
  }

  // Should not reach here
  return lastResult || {
    success: false,
    code: {},
    error: 'Code generation failed after all retries',
  };
}

/**
 * Craft the generation prompt from requirements and design
 */
function craftGenerationPrompt(request: CodeGenerationRequest): string {
  const parts: string[] = [
    `You are an expert code generator. Generate code to complete the following task:`,
    ``,
    `TASK ID: ${request.taskId}`,
    `TASK DESCRIPTION: ${request.taskDescription}`,
    ``,
    `REQUIREMENTS:`,
    request.requirements,
  ];

  if (request.design) {
    parts.push('');
    parts.push('DESIGN SPECIFICATION:');
    parts.push(request.design);
  }

  if (Object.keys(request.existingCode || {}).length > 0) {
    parts.push('');
    parts.push('EXISTING CODE TO CONSIDER:');
    for (const [filePath, code] of Object.entries(request.existingCode || {})) {
      parts.push(`\nFile: ${filePath}`);
      parts.push('```');
      parts.push(code);
      parts.push('```');
    }
  }

  parts.push('');
  parts.push('INSTRUCTIONS:');
  parts.push('1. Generate complete, production-ready code that fulfills the task');
  parts.push('2. Format each file as a code block with the file path as the language identifier');
  parts.push('3. Use this format for each file:');
  parts.push('');
  parts.push('```path/to/file.ts');
  parts.push('// Generated code here');
  parts.push('```');
  parts.push('');
  parts.push('4. Include all necessary imports, types, and error handling');
  parts.push('5. Follow TypeScript/JavaScript best practices');
  parts.push('6. Ensure code is compatible with the existing project structure');
  parts.push('7. Generate only the code, no explanations');

  return parts.join('\n');
}

/**
 * Parse code blocks from Copilot response
 * Expects format: ```path/to/file.ts ... ```
 */
function parseCodeBlocks(response: string): GeneratedCodeBlock[] {
  const codeBlocks: GeneratedCodeBlock[] = [];
  
  // Match code blocks with file paths in language identifier
  const blockRegex = /```([^\n]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = blockRegex.exec(response)) !== null) {
    const languageOrPath = match[1].trim();
    const code = match[2].trim();

    // Check if the language identifier looks like a file path
    if (languageOrPath.includes('/') || languageOrPath.includes('.')) {
      codeBlocks.push({
        filePath: languageOrPath,
        language: inferLanguage(languageOrPath),
        code: code,
      });
    } else if (code.length > 0) {
      // Still parse it but infer the file path if possible
      // This handles cases where Copilot might format differently
      const inferred = inferFilePath(languageOrPath, code);
      if (inferred) {
        codeBlocks.push({
          filePath: inferred,
          language: languageOrPath || 'typescript',
          code: code,
        });
      }
    }
  }

  return codeBlocks;
}

/**
 * Infer language from file path
 */
function inferLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.md': 'markdown',
  };
  return languageMap[ext] || ext.replace('.', '') || 'text';
}

/**
 * Infer file path from language identifier when not explicit
 */
function inferFilePath(language: string, code: string): string | null {
  // Check for common patterns in code
  if (language === 'typescript' || language === 'ts') {
    if (code.includes('import React') || code.includes('from "react"')) {
      return 'src/components/Component.tsx';
    }
    if (code.includes('export class') || code.includes('export function')) {
      return 'src/index.ts';
    }
    if (code.includes('describe(') || code.includes('it(')) {
      return 'src/index.test.ts';
    }
  }
  return null;
}

/**
 * Execute tests and capture results using vitest
 */
async function executeTests(
  testFile: string,
  outputChannel?: vscode.LogOutputChannel
): Promise<{ passed: boolean; output: string; failedTests?: string[] }> {
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    
    if (!fs.existsSync(testFile)) {
      outputChannel?.warn(`[TestRunner] Test file not found: ${testFile}`);
      return {
        passed: false,
        output: `Test file not found: ${testFile}`,
        failedTests: ['File not found'],
      };
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return {
        passed: false,
        output: 'No workspace folder found',
        failedTests: ['No workspace'],
      };
    }

    outputChannel?.info(`[TestRunner] Running tests in: ${testFile}`);
    
    // Determine test runner and build command
    let testCommand = '';
    
    // Check if vitest is available
    try {
      execSync('npm ls vitest', { cwd: workspaceRoot, stdio: 'pipe' });
      testCommand = `npm run test -- ${path.relative(workspaceRoot, testFile)} --reporter=verbose`;
    } catch {
      // Fall back to generic npm test
      testCommand = `npm test -- ${path.relative(workspaceRoot, testFile)}`;
    }

    outputChannel?.debug(`[TestRunner] Command: ${testCommand}`);

    try {
      // Run tests and capture output
      const output = execSync(testCommand, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      outputChannel?.info(`[TestRunner] Tests passed`);
      outputChannel?.debug(`[TestRunner] Output:\n${output.substring(0, 500)}`);

      return {
        passed: true,
        output: output,
      };
    } catch (testError: any) {
      // Test command failed - parse output for failures
      const testOutput = testError.stdout ? testError.stdout.toString() : '';
      const testStderr = testError.stderr ? testError.stderr.toString() : '';
      const fullOutput = testOutput + testStderr;

      outputChannel?.warn(`[TestRunner] Tests failed`);
      outputChannel?.debug(`[TestRunner] Output:\n${fullOutput.substring(0, 1000)}`);

      // Try to extract failed test names
      const failedTests = parseFailedTests(fullOutput);

      return {
        passed: false,
        output: fullOutput,
        failedTests: failedTests.length > 0 ? failedTests : ['Test suite failed'],
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel?.error(`[TestRunner] Failed to execute tests: ${errorMessage}`);
    return {
      passed: false,
      output: errorMessage,
      failedTests: ['Test execution failed'],
    };
  }
}

/**
 * Parse failed test names from vitest/jest output
 */
function parseFailedTests(output: string): string[] {
  const failedTests: string[] = [];
  
  // Vitest format: "✓ test name" or "× test name"
  const vitestFailures = output.match(/×\s+(.+?)(?:\n|$)/g) || [];
  failedTests.push(...vitestFailures.map(line => line.replace(/×\s+/, '').trim()));
  
  // Jest format: "● Test Suites: 1 failed"
  const jestFailures = output.match(/●\s+(.+?)(?:\n|$)/g) || [];
  failedTests.push(...jestFailures.map(line => line.replace(/●\s+/, '').trim()));
  
  // Generic FAIL patterns
  const genericFailures = output.match(/FAIL|Error:|failed|Failed/gi) || [];
  if (genericFailures.length > 0 && failedTests.length === 0) {
    failedTests.push('Test suite execution failed');
  }
  
  return [...new Set(failedTests)]; // Remove duplicates
}

/**
 * Format test failures for feedback to Copilot
 */
function formatTestFailures(
  testResults: { passed: boolean; output: string; failedTests?: string[] },
  _request: CodeGenerationRequest
): string {
  const parts: string[] = [
    'The following tests failed:',
    testResults.output,
    '',
    'Failed test names:',
    ...(testResults.failedTests || ['Unknown failures']),
    '',
    'Please revise the implementation to fix these failures.',
  ];
  return parts.join('\n');
}

/**
 * Dispose of any resources
 */
export function dispose(): void {
  // Cleanup if needed
}
