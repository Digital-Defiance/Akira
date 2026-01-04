/**
 * Test CodeLens Provider
 * Provides interactive "Run Test" and "Debug Test" buttons above test functions
 */

import * as vscode from "vscode";

interface TestFunction {
  line: number;
  name: string;
  range: vscode.Range;
}

export class TestCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  /**
   * Refresh code lenses
   */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide code lenses for a document
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    // Only provide lenses for test files
    if (!this.isTestFile(document)) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const tests = this.parseTestsFromDocument(document);

    for (const test of tests) {
      // Run Test button
      codeLenses.push(
        new vscode.CodeLens(test.range, {
          title: "▶ Run Test",
          command: "akira.runTest",
          arguments: [document.uri, test.name, test.line],
        })
      );

      // Debug Test button
      codeLenses.push(
        new vscode.CodeLens(test.range, {
          title: "🐛 Debug Test",
          command: "akira.debugTest",
          arguments: [document.uri, test.name, test.line],
        })
      );
    }

    return codeLenses;
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    return (
      fileName.endsWith(".test.ts") ||
      fileName.endsWith(".test.js") ||
      fileName.endsWith(".spec.ts") ||
      fileName.endsWith(".spec.js") ||
      fileName.includes("/test/") ||
      fileName.includes("\\test\\") ||
      fileName.endsWith(".e2e.test.ts")
    );
  }

  /**
   * Parse test functions from document
   */
  private parseTestsFromDocument(
    document: vscode.TextDocument
  ): TestFunction[] {
    const tests: TestFunction[] = [];
    const text = document.getText();
    const lines = text.split("\n");

    // Patterns for different test frameworks
    const patterns = [
      // Vitest/Jest: describe, test, it
      /^\s*(describe|test|it)\s*\(\s*["'`]([^"'`]+)["'`]/,
      // Mocha style
      /^\s*(describe|it|specify|context)\s*\(\s*["'`]([^"'`]+)["'`]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const testType = match[1];
          const testName = match[2];

          // Create range for the entire test declaration line
          const range = new vscode.Range(
            new vscode.Position(i, 0),
            new vscode.Position(i, line.length)
          );

          tests.push({
            line: i,
            name: `${testType}: ${testName}`,
            range,
          });
          break;
        }
      }
    }

    return tests;
  }
}

/**
 * Run a specific test
 */
export async function runTest(
  uri: vscode.Uri,
  testName: string,
  line: number
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "Cannot run test: No workspace folder found"
    );
    return;
  }

  // Construct test command based on the file type and framework
  let command: string;
  const relativePath = vscode.workspace.asRelativePath(uri);

  if (uri.fsPath.includes(".e2e.test.")) {
    // E2E test
    command = `npm run test:e2e -- ${relativePath}`;
  } else {
    // Unit test with line number for precise test selection
    command = `npm test -- ${relativePath}:${line + 1}`;
  }

  // Create and show terminal
  const terminal = vscode.window.createTerminal({
    name: `Test: ${testName}`,
    cwd: workspaceFolder.uri.fsPath,
  });
  terminal.show();
  terminal.sendText(command);
}

/**
 * Debug a specific test
 */
export async function debugTest(
  uri: vscode.Uri,
  testName: string,
  line: number
): Promise<void> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "Cannot debug test: No workspace folder found"
    );
    return;
  }

  // Create debug configuration
  const debugConfig: vscode.DebugConfiguration = {
    type: "node",
    request: "launch",
    name: `Debug: ${testName}`,
    program: "${workspaceFolder}/node_modules/vitest/vitest.mjs",
    args: [
      "run",
      vscode.workspace.asRelativePath(uri),
      "--testNamePattern",
      testName,
    ],
    console: "integratedTerminal",
    internalConsoleOptions: "neverOpen",
    cwd: workspaceFolder.uri.fsPath,
  };

  // Start debugging
  await vscode.debug.startDebugging(workspaceFolder, debugConfig);
}
