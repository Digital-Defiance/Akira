import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { setOutputChannel, registerExtension, unregisterExtension } from "../vscode-shared-status-bar/src/index";
import { SpecMCPClient } from "./mcp-client";
import { SpecMCPServer } from "./mcp-server";
import { registerChatParticipant } from "./chat-participant";
import { ConfigManager } from "./config-manager";
import { StatusBarManager } from "./status-bar-manager";
import { SpecTreeProvider } from "./spec-tree-provider";
import { generateRequirementsWithLLM } from "./llm-requirements-generator";
import { generateDesignWithLLM } from "./llm-design-generator";
import { generateTasksWithLLM } from "./llm-task-generator";
import {
  isPhaseApproved,
  approvePhase as approvePhaseInState,
  unapprovePhase as unapprovePhaseInState,
  getOrCreateState,
  updatePhase,
} from "./state-manager";
import { getSpecDirectoryPath } from "./spec-directory";
import {
  TaskCodeLensProvider,
  updateTaskCheckbox,
} from "./task-codelens-provider";
import {
  TestCodeLensProvider,
  runTest,
  debugTest,
} from "./test-codelens-provider";

let mcpClient: SpecMCPClient | null = null;
let mcpServer: SpecMCPServer | null = null;
let statusBarManager: StatusBarManager | null = null;
let treeProvider: SpecTreeProvider | null = null;
let taskCodeLensProvider: TaskCodeLensProvider | null = null;
let testCodeLensProvider: TestCodeLensProvider | null = null;
let outputChannel: vscode.LogOutputChannel | null = null;

// Track specs currently being generated to prevent premature approvals
const specsBeingGenerated = new Set<string>();

/**
 * Extension activation function
 * Called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log("Akira Spec Extension is now active");

  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel("Akira", { log: true });
  context.subscriptions.push(outputChannel);

  outputChannel.info("=== Akira Extension Activation Started ===");
  outputChannel.info(`VS Code version: ${vscode.version}`);
  outputChannel.info(`Extension path: ${context.extensionPath}`);

  // Set output channel for shared status bar
  setOutputChannel(outputChannel);

  // Register with shared status bar
  await registerExtension("akira", {
    displayName: "Akira",
    status: "ok",
    actions: [
      {
        label: "Create Spec",
        command: "akira.createSpec",
        description: "Create a new specification"
      },
      {
        label: "Refresh Specs",
        command: "akira.refreshSpecs",
        description: "Refresh specification tree"
      }
    ]
  });
  outputChannel.info("Registered with shared status bar");

  // Add unregister to context subscriptions
  context.subscriptions.push({
    dispose: () => unregisterExtension("akira")
  });

  // Initialize Status Bar Manager
  statusBarManager = new StatusBarManager();
  context.subscriptions.push({
    dispose: async () => {
      if (statusBarManager) {
        await statusBarManager.dispose();
      }
    },
  });
  outputChannel.info("Status Bar Manager initialized");

  // Initialize MCP Client
  try {
    mcpClient = new SpecMCPClient(outputChannel);
    await mcpClient.start();
    outputChannel.info("MCP Client started successfully");
  } catch (error) {
    outputChannel.error("Failed to start MCP Client:", error);
    vscode.window.showErrorMessage(
      `Failed to start Akira MCP Client: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Initialize legacy MCP Server (for backward compatibility)
  mcpServer = new SpecMCPServer();
  outputChannel.info("MCP Server initialized");

  // Register Tree View Provider
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  treeProvider = new SpecTreeProvider(workspaceRoot);
  const treeView = vscode.window.createTreeView("specTreeView", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);
  outputChannel.info("Tree View Provider registered");

  // Register Task CodeLens Provider
  taskCodeLensProvider = new TaskCodeLensProvider();

  // Register once for all markdown files matching tasks.md pattern
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      {
        language: "markdown",
        scheme: "file",
        pattern: "**/tasks.md",
      },
      taskCodeLensProvider
    )
  );

  outputChannel.info("Task CodeLens Provider registered");

  // Register Test CodeLens Provider
  testCodeLensProvider = new TestCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "typescript", scheme: "file" },
      testCodeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "javascript", scheme: "file" },
      testCodeLensProvider
    )
  );
  outputChannel.info("Test CodeLens Provider registered");

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("akira.refreshSpecs", () => {
      treeProvider?.refresh();
      outputChannel?.info("Specs refreshed");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("akira.debugCodeLens", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const config = vscode.workspace.getConfiguration("editor");
      const codeLensEnabled = config.get("codeLens");

      outputChannel.info(`=== Code Lens Debug Info ===`);
      outputChannel.info(`Active file: ${editor.document.fileName}`);
      outputChannel.info(
        `File ends with tasks.md: ${editor.document.fileName.endsWith(
          "tasks.md"
        )}`
      );
      outputChannel.info(`editor.codeLens setting: ${codeLensEnabled}`);
      outputChannel.info(`Language: ${editor.document.languageId}`);
      outputChannel.info(`Scheme: ${editor.document.uri.scheme}`);

      if (taskCodeLensProvider) {
        outputChannel.info(`Task CodeLens Provider exists: true`);
        taskCodeLensProvider.refresh();
        outputChannel.info(`Manually triggered refresh`);
      } else {
        outputChannel.info(`Task CodeLens Provider exists: false`);
      }

      vscode.window.showInformationMessage(
        `Code Lens debug info written to output. editor.codeLens: ${codeLensEnabled}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("akira.createSpec", async () => {
      const featureName = await vscode.window.showInputBox({
        prompt: "Enter feature name",
        placeHolder: "my-feature",
      });

      if (!featureName) {
        return;
      }

      const featureIdea = await vscode.window.showInputBox({
        prompt: "Enter feature description",
        placeHolder: "Brief description of the feature",
      });

      if (!featureIdea) {
        return;
      }

      try {
        if (statusBarManager) {
          await statusBarManager.showProgress("Creating spec...");
        }

        if (mcpClient) {
          // Generate requirements with LLM
          outputChannel?.info("Generating requirements with LLM...");
          const llmContent = await generateRequirementsWithLLM(featureIdea);
          outputChannel?.info("LLM generation complete");

          const result = await mcpClient.createSpec(
            featureName,
            featureIdea,
            llmContent
          );
          outputChannel?.info("Spec created:", result);
          vscode.window.showInformationMessage(
            `Spec created for ${featureName}`
          );
        }

        treeProvider?.refresh();

        if (statusBarManager) {
          await statusBarManager.hideProgress();
        }
      } catch (error) {
        outputChannel?.error("Failed to create spec:", error);
        vscode.window.showErrorMessage(
          `Failed to create spec: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (statusBarManager) {
          await statusBarManager.showError("Failed to create spec");
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("akira.openSpec", async (item: any) => {
      // Open the spec's requirements.md file
      const featureName = item?.featureName;
      if (!featureName) {
        return;
      }

      const config = ConfigManager.getConfig();
      const specDir = config.specDirectory;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!workspaceRoot) {
        return;
      }

      const requirementsPath = vscode.Uri.file(
        `${workspaceRoot}/${specDir}/${featureName}/requirements.md`
      );

      try {
        const doc = await vscode.workspace.openTextDocument(requirementsPath);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        outputChannel?.error("Failed to open spec:", error);
        vscode.window.showErrorMessage(
          `Failed to open spec: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  // Open or create phase document command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.openOrCreatePhaseDocument",
      async (
        featureName: string,
        documentType: "requirements" | "design" | "tasks"
      ) => {
        const config = ConfigManager.getConfig();
        const specDir = config.specDirectory;
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
          return;
        }

        const documentPath = vscode.Uri.file(
          `${workspaceRoot}/${specDir}/${featureName}/${documentType}.md`
        );

        try {
          // Try to open the document
          const doc = await vscode.workspace.openTextDocument(documentPath);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          // If file doesn't exist, create it with placeholder content
          try {
            const fs = require("fs").promises;
            const path = require("path");
            const dirPath = path.dirname(documentPath.fsPath);

            // Ensure directory exists
            await fs.mkdir(dirPath, { recursive: true });

            // Create empty file
            await fs.writeFile(documentPath.fsPath, "", "utf8");

            // Open the newly created file
            const doc = await vscode.workspace.openTextDocument(documentPath);
            await vscode.window.showTextDocument(doc);

            // Refresh tree view
            treeProvider?.refresh();
          } catch (createError) {
            outputChannel?.error(
              `Failed to create ${documentType} document:`,
              createError
            );
            vscode.window.showErrorMessage(
              `Failed to create ${documentType} document: ${
                createError instanceof Error
                  ? createError.message
                  : String(createError)
              }`
            );
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.openTaskInEditor",
      async (featureName: string, _taskId: string, lineNumber?: number) => {
        const config = ConfigManager.getConfig();
        const specDir = config.specDirectory;
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
          return;
        }

        const tasksPath = vscode.Uri.file(
          `${workspaceRoot}/${specDir}/${featureName}/tasks.md`
        );

        try {
          const doc = await vscode.workspace.openTextDocument(tasksPath);
          const editor = await vscode.window.showTextDocument(doc);

          // If line number provided, move cursor to that line
          if (lineNumber !== undefined && lineNumber > 0) {
            const position = new vscode.Position(lineNumber - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter
            );
          }
        } catch (error) {
          outputChannel?.error("Failed to open task in editor:", error);
          vscode.window.showErrorMessage(
            `Failed to open task: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  // CodeLens command handlers
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.startPhaseFromCodeLens",
      async (
        uri: vscode.Uri,
        line: number,
        phaseNumber: number,
        taskIds: string[]
      ) => {
        try {
          // Extract feature name from the URI path
          const pathParts = uri.fsPath.split(/[/\\]/);
          const specsIndex = pathParts.findIndex((p) => p === "specs");
          const featureName = specsIndex >= 0 ? pathParts[specsIndex + 1] : "";

          if (!featureName) {
            vscode.window.showErrorMessage(
              "Could not determine feature name from file path"
            );
            return;
          }

          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }

          outputChannel?.appendLine(`\n${"=".repeat(80)}`);
          outputChannel?.appendLine(
            `🚀 STARTING PHASE ${phaseNumber} - ${taskIds.length} tasks`
          );
          outputChannel?.appendLine(`Feature: ${featureName}`);
          outputChannel?.appendLine(`Tasks: ${taskIds.join(", ")}`);
          outputChannel?.appendLine(`${"=".repeat(80)}\n`);

          const action = await vscode.window.showInformationMessage(
            `🚀 Start Phase ${phaseNumber} with ${taskIds.length} tasks?`,
            "Start Sequential",
            "Cancel"
          );

          if (action !== "Start Sequential") {
            return;
          }

          // Execute tasks sequentially
          for (const taskId of taskIds) {
            // Find the task line
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const lines = text.split("\n");
            let taskLine = -1;

            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(
                /^-\s+\[([ x~])\]\s+([\d.]+)\.?\s+(.+)$/
              );
              if (match && match[2] === taskId) {
                taskLine = i;
                break;
              }
            }

            if (taskLine === -1) {
              outputChannel?.appendLine(
                `⚠️  Task ${taskId} not found, skipping...`
              );
              continue;
            }

            // Execute this task
            outputChannel?.appendLine(`\n▶️  Starting task ${taskId}...`);
            await vscode.commands.executeCommand(
              "akira.startTaskFromCodeLens",
              uri,
              taskLine,
              taskId
            );

            // Wait a bit before starting next task
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          outputChannel?.appendLine(
            `\n✅ Phase ${phaseNumber} execution started for all tasks`
          );
          vscode.window.showInformationMessage(
            `✅ Phase ${phaseNumber} - Started all ${taskIds.length} tasks`
          );
        } catch (error) {
          outputChannel?.error("Failed to start phase:", error);
          vscode.window.showErrorMessage(
            `Failed to start phase: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  // Start parent task (executes all subtasks sequentially)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.startParentTaskFromCodeLens",
      async (
        uri: vscode.Uri,
        line: number,
        parentTaskId: string,
        subtaskIds: string[]
      ) => {
        try {
          // Extract feature name from the URI path
          const pathParts = uri.fsPath.split(/[/\\]/);
          const specsIndex = pathParts.findIndex((p) => p === "specs");
          const featureName = specsIndex >= 0 ? pathParts[specsIndex + 1] : "";

          if (!featureName) {
            vscode.window.showErrorMessage(
              "Could not determine feature name from file path"
            );
            return;
          }

          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }

          outputChannel?.appendLine(`\n${"=".repeat(80)}`);
          outputChannel?.appendLine(
            `🚀 STARTING TASK ${parentTaskId} - ${subtaskIds.length} subtasks`
          );
          outputChannel?.appendLine(`Feature: ${featureName}`);
          outputChannel?.appendLine(`Subtasks: ${subtaskIds.join(", ")}`);
          outputChannel?.appendLine(`${"=".repeat(80)}\n`);

          const action = await vscode.window.showInformationMessage(
            `🚀 Start Task ${parentTaskId} with ${subtaskIds.length} subtasks?`,
            "Start Sequential",
            "Cancel"
          );

          if (action !== "Start Sequential") {
            return;
          }

          // Mark parent task as in-progress
          await updateTaskCheckbox(uri, line, "~");
          taskCodeLensProvider?.refresh();

          // Execute subtasks sequentially
          for (const taskId of subtaskIds) {
            // Find the task line
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const lines = text.split("\n");
            let taskLine = -1;

            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(
                /^-\s+\[([ x~])\]\s+([\d.]+)\.?\s+(.+)$/
              );
              if (match && match[2] === taskId) {
                taskLine = i;
                break;
              }
            }

            if (taskLine === -1) {
              outputChannel?.appendLine(
                `⚠️  Subtask ${taskId} not found, skipping...`
              );
              continue;
            }

            // Execute this subtask
            outputChannel?.appendLine(`\n▶️  Starting subtask ${taskId}...`);
            await vscode.commands.executeCommand(
              "akira.startTaskFromCodeLens",
              uri,
              taskLine,
              taskId
            );

            // Wait a bit before starting next task
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          outputChannel?.appendLine(
            `\n✅ Task ${parentTaskId} - Started all ${subtaskIds.length} subtasks`
          );
          vscode.window.showInformationMessage(
            `✅ Task ${parentTaskId} - Started all ${subtaskIds.length} subtasks`
          );
        } catch (error) {
          outputChannel?.error("Failed to start parent task:", error);
          vscode.window.showErrorMessage(
            `Failed to start task: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.startTaskFromCodeLens",
      async (uri: vscode.Uri, line: number, taskId: string) => {
        try {
          // Extract feature name from the URI path
          const pathParts = uri.fsPath.split(/[/\\]/);
          const specsIndex = pathParts.findIndex((p) => p === "specs");
          const featureName = specsIndex >= 0 ? pathParts[specsIndex + 1] : "";

          if (!featureName) {
            vscode.window.showErrorMessage(
              "Could not determine feature name from file path"
            );
            return;
          }

          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }

          const config = vscode.workspace.getConfiguration("copilotSpec");
          const specDirectory =
            config.get<string>("specDirectory") || ".kiro/specs";

          // Update checkbox to in-progress
          await updateTaskCheckbox(uri, line, "~");
          taskCodeLensProvider?.refresh();

          // Build execution context
          const {
            findNextTask,
            buildExecutionContext,
            generateTaskExecutionPrompt,
          } = await import("./autonomous-executor");

          // Find the specific task
          const tasksPath = path.join(
            getSpecDirectoryPath(featureName, workspaceRoot),
            "tasks.md"
          );
          const tasksContent = fs.readFileSync(tasksPath, "utf-8");
          const state = readState(featureName, workspaceRoot);
          const { parseTasks } = await import("./autonomous-executor");
          const tasks = parseTasks(tasksContent, state?.taskStatuses || {});
          const task = tasks.find((t) => t.id === taskId);

          if (!task) {
            vscode.window.showErrorMessage(`Task ${taskId} not found`);
            return;
          }

          // Mark as in-progress in state
          updateTaskStatus(featureName, taskId, "in-progress", workspaceRoot);

          // Build context and generate prompt
          const context = buildExecutionContext(
            featureName,
            task,
            workspaceRoot,
            specDirectory
          );
          const prompt = generateTaskExecutionPrompt(context);

          // Show implementation guidance in output channel
          outputChannel?.show(true);
          outputChannel?.appendLine(`\n${"=".repeat(80)}`);
          outputChannel?.appendLine(
            `🤖 STARTING TASK: ${taskId} - ${task.description}`
          );
          outputChannel?.appendLine(`${"=".repeat(80)}\n`);
          outputChannel?.appendLine(`Feature: ${featureName}\n`);

          if (context.requirements) {
            outputChannel?.appendLine(
              `REQUIREMENTS CONTEXT:\n${context.requirements.substring(
                0,
                500
              )}...\n`
            );
          }

          if (context.design) {
            outputChannel?.appendLine(
              `DESIGN CONTEXT:\n${context.design.substring(0, 500)}...\n`
            );
          }

          outputChannel?.appendLine(`IMPLEMENTATION PROMPT:\n${prompt}\n`);
          outputChannel?.appendLine(`${"=".repeat(80)}`);
          outputChannel?.appendLine(`NEXT STEPS:`);
          outputChannel?.appendLine(
            `1. Review the task requirements and context above`
          );
          outputChannel?.appendLine(
            `2. Use @workspace or regular Copilot to implement the required files/code`
          );
          outputChannel?.appendLine(`3. Test your implementation`);
          outputChannel?.appendLine(`4. Click "✓ Complete Task" when done\n`);

          // Show notification
          const action = await vscode.window.showInformationMessage(
            `🤖 Task ${taskId} started - see Output panel for details`,
            "View Output",
            "Ask Copilot"
          );

          if (action === "View Output") {
            outputChannel?.show(true);
          } else if (action === "Ask Copilot") {
            // Open chat focused on implementing this task
            await vscode.commands.executeCommand("workbench.action.chat.open");
          }
        } catch (error) {
          outputChannel?.error("Failed to start task:", error);
          vscode.window.showErrorMessage(
            `Failed to start task: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.completeTaskFromCodeLens",
      async (uri: vscode.Uri, line: number, taskId: string) => {
        await updateTaskCheckbox(uri, line, "x");
        taskCodeLensProvider?.refresh();
        vscode.window.showInformationMessage(`✓ Completed task ${taskId}`);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.pauseTaskFromCodeLens",
      async (uri: vscode.Uri, line: number, taskId: string) => {
        await updateTaskCheckbox(uri, line, " ");
        taskCodeLensProvider?.refresh();
        vscode.window.showInformationMessage(`Paused task ${taskId}`);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.reopenTaskFromCodeLens",
      async (uri: vscode.Uri, line: number, taskId: string) => {
        await updateTaskCheckbox(uri, line, " ");
        taskCodeLensProvider?.refresh();
        vscode.window.showInformationMessage(`Reopened task ${taskId}`);
      }
    )
  );

  // Test CodeLens command handlers
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.runTest",
      async (uri: vscode.Uri, testName: string, line: number) => {
        await runTest(uri, testName, line);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.debugTest",
      async (uri: vscode.Uri, testName: string, line: number) => {
        await debugTest(uri, testName, line);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("akira.deleteSpec", async (item: any) => {
      const featureName = item?.featureName;
      if (!featureName) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete spec for ${featureName}? This will permanently delete all files in the spec directory.`,
        { modal: true },
        "Delete"
      );

      if (confirm !== "Delete") {
        return;
      }

      try {
        const config = ConfigManager.getConfig();
        const specDir = config.specDirectory;
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        const specPath = path.join(workspaceRoot, specDir, featureName);

        // Check if directory exists
        if (!fs.existsSync(specPath)) {
          vscode.window.showWarningMessage(
            `Spec directory not found: ${featureName}`
          );
          return;
        }

        // Delete the directory recursively
        fs.rmSync(specPath, { recursive: true, force: true });
        outputChannel?.info(`Deleted spec: ${featureName}`);

        // Refresh the tree view
        treeProvider?.refresh();

        vscode.window.showInformationMessage(`Spec deleted: ${featureName}`);
      } catch (error) {
        outputChannel?.error("Failed to delete spec:", error);
        vscode.window.showErrorMessage(
          `Failed to delete spec: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("akira.executeTask", async () => {
      // TODO: Implement task execution
      vscode.window.showInformationMessage(
        `Task execution not yet implemented`
      );
    })
  );

  // Approve Phase Command (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand("akira.approvePhase", async (item: any) => {
      // Handle both SpecTreeItem (has featureName and phase) and PhaseDocumentTreeItem (has featureName and documentType)
      const featureName = item?.featureName;
      const phase = item?.phase || item?.documentType; // documentType from PhaseDocumentTreeItem

      if (!featureName || !phase) {
        vscode.window.showErrorMessage("Invalid spec item");
        return;
      }

      try {
        if (statusBarManager) {
          await statusBarManager.showProgress(`Approving ${phase}...`);
        }

        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && mcpClient) {
          // Check if phase is already approved
          if (
            isPhaseApproved(
              featureName,
              phase as "requirements" | "design" | "tasks",
              workspaceRoot
            )
          ) {
            if (statusBarManager) {
              await statusBarManager.hideProgress();
            }
            vscode.window.showInformationMessage(
              `${phase} for ${featureName} is already approved.`
            );
            return;
          }

          // Check if this spec is currently being generated
          const generationKey = `${featureName}:${phase}`;
          if (specsBeingGenerated.has(generationKey)) {
            if (statusBarManager) {
              await statusBarManager.hideProgress();
            }
            vscode.window.showWarningMessage(
              `Cannot approve ${phase}: The ${phase} is currently being generated. Please wait for it to complete.`
            );
            return;
          }

          // Check if the phase document exists before approving
          try {
            await mcpClient.readSpec(
              featureName,
              phase as "requirements" | "design" | "tasks"
            );
          } catch (error) {
            if (statusBarManager) {
              await statusBarManager.hideProgress();
            }
            vscode.window.showWarningMessage(
              `Cannot approve ${phase}: The ${phase} document doesn't exist yet. Complete it first.`
            );
            return;
          }

          approvePhaseInState(
            featureName,
            phase as "requirements" | "design" | "tasks",
            workspaceRoot
          );
          outputChannel?.info(`Approved phase: ${phase} for ${featureName}`);
          vscode.window.showInformationMessage(
            `✓ Approved ${phase} for ${featureName}`
          );
        }

        treeProvider?.refresh();

        if (statusBarManager) {
          await statusBarManager.hideProgress();
        }
      } catch (error) {
        outputChannel?.error("Failed to approve phase:", error);
        vscode.window.showErrorMessage(
          `Failed to approve phase: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (statusBarManager) {
          await statusBarManager.showError("Failed to approve phase");
        }
      }
    })
  );

  // Unapprove Phase Command (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "akira.unapprovePhase",
      async (item: any) => {
        // Handle both SpecTreeItem (has featureName and phase) and PhaseDocumentTreeItem (has featureName and documentType)
        const featureName = item?.featureName;
        const phase = item?.phase || item?.documentType; // documentType from PhaseDocumentTreeItem

        if (!featureName || !phase) {
          vscode.window.showErrorMessage("Invalid spec item");
          return;
        }

        try {
          if (statusBarManager) {
            await statusBarManager.showProgress(`Unapproving ${phase}...`);
          }

          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            // Check if phase is already unapproved
            if (
              !isPhaseApproved(
                featureName,
                phase as "requirements" | "design" | "tasks",
                workspaceRoot
              )
            ) {
              if (statusBarManager) {
                await statusBarManager.hideProgress();
              }
              vscode.window.showInformationMessage(
                `${phase} for ${featureName} is not currently approved.`
              );
              return;
            }

            unapprovePhaseInState(
              featureName,
              phase as "requirements" | "design" | "tasks",
              workspaceRoot
            );
            outputChannel?.info(
              `Unapproved phase: ${phase} for ${featureName}`
            );
            vscode.window.showInformationMessage(
              `✗ Unapproved ${phase} for ${featureName}`
            );
          }

          treeProvider?.refresh();

          if (statusBarManager) {
            await statusBarManager.hideProgress();
          }
        } catch (error) {
          outputChannel?.error("Failed to unapprove phase:", error);
          vscode.window.showErrorMessage(
            `Failed to unapprove phase: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          if (statusBarManager) {
            await statusBarManager.showError("Failed to unapprove phase");
          }
        }
      }
    )
  );

  // Continue Spec Command (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand("akira.continueSpec", async (item: any) => {
      const featureName = item?.featureName;

      if (!featureName) {
        vscode.window.showErrorMessage("Invalid spec item");
        return;
      }

      try {
        if (statusBarManager) {
          await statusBarManager.showProgress(`Continuing ${featureName}...`);
        }

        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (mcpClient && workspaceRoot) {
          // Get current state to determine next action
          const listResult = await mcpClient.listSpecs();
          const parsedResult = JSON.parse(listResult.content[0].text);
          const spec = parsedResult.specs.find(
            (s: any) => s.featureName === featureName
          );

          if (!spec) {
            throw new Error(`Spec not found: ${featureName}`);
          }

          const phase = spec.currentPhase;
          outputChannel?.info(
            `Continue spec: ${featureName}, current phase: ${phase}`
          );

          // Determine what we can continue to based on current phase and approvals
          // The logic: check if the CURRENT phase is approved to move to the NEXT phase
          // But if current phase is not approved, we may need to regenerate it
          let shouldRegenerate = false;
          let phaseToGenerate: "requirements" | "design" | "tasks";

          if (phase === "requirements") {
            // Check if requirements is approved to continue to design
            if (!isPhaseApproved(featureName, "requirements", workspaceRoot)) {
              vscode.window.showWarningMessage(
                `Cannot continue: requirements phase is not approved yet. Approve it first.`
              );
              return;
            }
            phaseToGenerate = "design";
          } else if (phase === "design") {
            // Check if design is approved to continue to tasks
            if (!isPhaseApproved(featureName, "design", workspaceRoot)) {
              vscode.window.showWarningMessage(
                `Cannot continue: design phase is not approved yet. Approve it first.`
              );
              return;
            }
            phaseToGenerate = "tasks";
          } else if (phase === "tasks") {
            // If we're on tasks phase but it's not approved, we might need to regenerate it
            // Check if design is approved (the phase before tasks)
            if (!isPhaseApproved(featureName, "design", workspaceRoot)) {
              vscode.window.showWarningMessage(
                `Cannot continue: design phase is not approved yet. Approve it first before generating tasks.`
              );
              return;
            }
            // Design is approved, so we can (re)generate tasks
            shouldRegenerate = true;
            phaseToGenerate = "tasks";
          } else {
            vscode.window.showInformationMessage(
              `All phases complete for ${featureName}`
            );
            return;
          }

          // Determine next phase and generate content
          let nextPhase: "requirements" | "design" | "tasks" = phaseToGenerate;
          let generatedContent: string;

          // Generate content based on what phase we're moving to/regenerating
          if (phaseToGenerate === "design") {
            // Generate design from requirements
            const generationKey = `${featureName}:design`;
            specsBeingGenerated.add(generationKey);

            try {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: `Generating design for ${featureName}`,
                  cancellable: false,
                },
                async (progress) => {
                  progress.report({ message: "Reading requirements..." });
                  const requirementsResult = await mcpClient.readSpec(
                    featureName,
                    "requirements"
                  );
                  const requirementsData = JSON.parse(
                    requirementsResult.content[0].text
                  );

                  progress.report({ message: "Generating design with AI..." });
                  outputChannel?.info("Generating design with LLM...");
                  generatedContent =
                    (await generateDesignWithLLM(
                      featureName,
                      requirementsData.content
                    )) || "";

                  if (!generatedContent) {
                    throw new Error(
                      "Failed to generate design - no content returned from LLM"
                    );
                  }

                  progress.report({ message: "Saving design document..." });
                  nextPhase = "design";

                  // Create design document
                  await mcpClient.updateSpec(
                    featureName,
                    nextPhase,
                    generatedContent
                  );

                  // Update phase in state
                  outputChannel?.info(
                    `Updating phase from ${phase} to ${nextPhase}`
                  );
                  const updateResult = updatePhase(
                    featureName,
                    nextPhase,
                    workspaceRoot
                  );
                  outputChannel?.info(`Phase update result: ${updateResult}`);

                  outputChannel?.info(`Created ${nextPhase} document`);
                }
              );
            } finally {
              // Always remove from generation set, even if error occurs
              specsBeingGenerated.delete(generationKey);
            }

            vscode.window.showInformationMessage(
              `✓ Generated design for ${featureName}`
            );
          } else if (phaseToGenerate === "tasks") {
            // Generate tasks from design (or regenerate if shouldRegenerate is true)
            const generationKey = `${featureName}:tasks`;
            specsBeingGenerated.add(generationKey);

            try {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: `Generating tasks for ${featureName}`,
                  cancellable: false,
                },
                async (progress) => {
                  progress.report({ message: "Reading design..." });
                  const designResult = await mcpClient.readSpec(
                    featureName,
                    "design"
                  );
                  const designData = JSON.parse(designResult.content[0].text);

                  progress.report({ message: "Generating tasks with AI..." });
                  outputChannel?.info("Generating tasks with LLM...");
                  generatedContent =
                    (await generateTasksWithLLM(
                      featureName,
                      designData.content
                    )) || "";

                  if (!generatedContent) {
                    throw new Error(
                      "Failed to generate tasks - no content returned from LLM"
                    );
                  }

                  progress.report({ message: "Saving tasks document..." });
                  nextPhase = "tasks";

                  // Create tasks document
                  await mcpClient.updateSpec(
                    featureName,
                    nextPhase,
                    generatedContent
                  );

                  // Update phase in state
                  outputChannel?.info(
                    `Updating phase from ${phase} to ${nextPhase}`
                  );
                  const updateResult = updatePhase(
                    featureName,
                    nextPhase,
                    workspaceRoot
                  );
                  outputChannel?.info(`Phase update result: ${updateResult}`);

                  outputChannel?.info(`Created ${nextPhase} document`);
                }
              );
            } finally {
              // Always remove from generation set, even if error occurs
              specsBeingGenerated.delete(generationKey);
            }

            vscode.window.showInformationMessage(
              `✓ Generated tasks for ${featureName}`
            );
          } else {
            if (statusBarManager) {
              await statusBarManager.hideProgress();
            }
            vscode.window.showInformationMessage(
              `No next phase after ${phase}. Spec is complete or awaiting execution.`
            );
            return;
          }
        }

        // Refresh tree view to show new phase
        treeProvider?.refresh();

        if (statusBarManager) {
          await statusBarManager.hideProgress();
        }
      } catch (error) {
        outputChannel?.error("Failed to continue spec:", error);
        vscode.window.showErrorMessage(
          `Failed to continue spec: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (statusBarManager) {
          await statusBarManager.showError("Failed to continue spec");
        }
      }
    })
  );

  // Validate Spec Command (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand("akira.validateSpec", async (item: any) => {
      const featureName = item?.featureName;
      const phase = item?.phase || item?.documentType; // documentType from PhaseDocumentTreeItem

      if (!featureName) {
        vscode.window.showErrorMessage("Invalid spec item");
        return;
      }

      try {
        if (statusBarManager) {
          await statusBarManager.showProgress(
            phase
              ? `Validating ${phase} phase...`
              : `Validating ${featureName}...`
          );
        }

        if (mcpClient) {
          if (phase) {
            // Validate specific phase
            const result = await mcpClient.validatePhase(featureName, phase);
            const validationData = JSON.parse(result.content[0].text);
            outputChannel?.info(
              `Validation result for ${phase}:`,
              validationData
            );

            if (validationData.valid) {
              vscode.window.showInformationMessage(
                `✓ ${phase} validation passed for ${featureName}`
              );
            } else {
              const errorCount = validationData.errors?.length || 0;
              vscode.window.showWarningMessage(
                `${phase} validation found ${errorCount} error(s). Check output channel for details.`
              );

              if (validationData.errors) {
                outputChannel?.error(
                  `Validation errors for ${phase}:`,
                  validationData.errors
                );
              }
            }
          } else {
            // Validate entire spec
            const result = await mcpClient.validateSpec(featureName);
            outputChannel?.info(`Validation result:`, result);

            if (result.valid) {
              vscode.window.showInformationMessage(
                `✓ Validation passed for ${featureName}`
              );
            } else {
              const errorCount = result.errors?.length || 0;
              vscode.window.showWarningMessage(
                `Validation found ${errorCount} error(s) in ${featureName}. Check output channel for details.`
              );

              if (result.errors) {
                outputChannel?.error(
                  `Validation errors for ${featureName}:`,
                  result.errors
                );
              }
            }
          }
        }

        if (statusBarManager) {
          await statusBarManager.hideProgress();
        }
      } catch (error) {
        outputChannel?.error("Failed to validate spec:", error);
        vscode.window.showErrorMessage(
          `Failed to validate spec: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (statusBarManager) {
          await statusBarManager.showError("Failed to validate spec");
        }
      }
    })
  );

  // Register Chat Participant
  outputChannel.info("Registering Chat Participant...");
  try {
    const chatParticipant = registerChatParticipant(context, mcpClient);
    context.subscriptions.push(chatParticipant);
    outputChannel.info(
      "✅ Chat Participant registered successfully with ID: spec"
    );
  } catch (error) {
    outputChannel.error("❌ Failed to register Chat Participant:", error);
    vscode.window.showErrorMessage(
      `Failed to register Akira chat participant: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Register configuration change listener
  const configListener = ConfigManager.onConfigurationChanged((newConfig) => {
    outputChannel?.info("Configuration changed:", newConfig);
    handleConfigurationChange(newConfig);
  });
  context.subscriptions.push(configListener);
  outputChannel.info("Configuration hot-reload enabled");

  outputChannel.info("Akira Spec Extension activated successfully");
}

/**
 * Handle configuration changes
 * Apply new settings without requiring extension restart
 */
function handleConfigurationChange(newConfig: any) {
  outputChannel?.info("Applying new configuration settings...");
  outputChannel?.info(`Spec Directory: ${newConfig.specDirectory}`);
  outputChannel?.info(`Strict Mode: ${newConfig.strictMode}`);
  outputChannel?.info(
    `Property Test Iterations: ${newConfig.propertyTestIterations}`
  );
  outputChannel?.info("Configuration applied successfully");
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export async function deactivate() {
  console.log("Akira Spec Extension is now deactivated");

  // Cleanup MCP Client
  if (mcpClient) {
    mcpClient.stop();
    mcpClient = null;
  }

  // Cleanup MCP Server
  if (mcpServer) {
    await mcpServer.stop();
    mcpServer = null;
  }

  // Cleanup Status Bar
  if (statusBarManager) {
    await statusBarManager.dispose();
    statusBarManager = null;
  }
}

/**
 * Get the MCP client instance (for testing)
 */
export function getMCPClient(): SpecMCPClient | null {
  return mcpClient;
}

/**
 * Get the MCP server instance (for testing)
 */
export function getMCPServer(): SpecMCPServer | null {
  return mcpServer;
}
