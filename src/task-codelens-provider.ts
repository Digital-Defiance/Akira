/**
 * Task CodeLens Provider
 * Provides interactive "Start Task" / "Complete Task" buttons above task checkboxes
 */

import * as vscode from "vscode";

interface TaskCheckbox {
  line: number;
  taskId: string;
  text: string;
  status: "pending" | "in-progress" | "completed";
  isParent?: boolean; // true for tasks like "1." that have subtasks
  subtasks?: string[]; // list of subtask IDs like ["1.1", "1.2"]
}

export class TaskCodeLensProvider implements vscode.CodeLensProvider {
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
    console.log(
      `[TaskCodeLensProvider] provideCodeLenses called for: ${document.fileName}`
    );

    // Only provide lenses for tasks.md files
    if (!document.fileName.endsWith("tasks.md")) {
      console.log(`[TaskCodeLensProvider] Skipping - not a tasks.md file`);
      return [];
    }

    console.log(`[TaskCodeLensProvider] Processing tasks.md file`);

    const codeLenses: vscode.CodeLens[] = [];
    const tasks = this.parseTasksFromDocument(document);
    const phases = this.parsePhasesFromDocument(document);

    // Add code lenses for phase headers
    for (const phase of phases) {
      const range = new vscode.Range(phase.line, 0, phase.line, 0);

      // Add "Start Phase" button to execute all tasks in sequence
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: "▶ Start Phase (All Tasks)",
          command: "akira.startPhaseFromCodeLens",
          arguments: [document.uri, phase.line, phase.phaseNumber, phase.tasks],
        })
      );
    }

    // Add code lenses for individual tasks
    for (const task of tasks) {
      const range = new vscode.Range(task.line, 0, task.line, 0);

      // For parent tasks (like "1."), show "Start All Subtasks" button
      if (task.isParent && task.subtasks && task.subtasks.length > 0) {
        if (task.status === "pending") {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `▶ Start All Subtasks (${task.subtasks.length})`,
              command: "akira.startParentTaskFromCodeLens",
              arguments: [document.uri, task.line, task.taskId, task.subtasks],
            })
          );
        }
        continue; // Don't add regular task buttons for parent tasks
      }

      // Add appropriate action based on task status for regular subtasks
      if (task.status === "pending") {
        // Start task button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "▶ Start Task",
            command: "akira.startTaskFromCodeLens",
            arguments: [document.uri, task.line, task.taskId],
          })
        );
      } else if (task.status === "in-progress") {
        // Complete task button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "✓ Complete Task",
            command: "akira.completeTaskFromCodeLens",
            arguments: [document.uri, task.line, task.taskId],
          })
        );
        // Also add a pause button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "⏸ Pause",
            command: "akira.pauseTaskFromCodeLens",
            arguments: [document.uri, task.line, task.taskId],
          })
        );
      } else if (task.status === "completed") {
        // Reopen task button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "↻ Reopen",
            command: "akira.reopenTaskFromCodeLens",
            arguments: [document.uri, task.line, task.taskId],
          })
        );
      }
    }

    console.log(
      `[TaskCodeLensProvider] Returning ${codeLenses.length} code lenses (${phases.length} phases, ${tasks.length} tasks)`
    );
    return codeLenses;
  }

  /**
   * Parse tasks from document
   */
  private parseTasksFromDocument(
    document: vscode.TextDocument
  ): TaskCheckbox[] {
    const tasks: TaskCheckbox[] = [];
    const text = document.getText();
    const lines = text.split("\n").map((l) => l.replace(/\r$/, "")); // Strip Windows line endings

    console.log(
      `[TaskCodeLensProvider] Parsing ${lines.length} lines from ${document.fileName}`
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Debug: log first few interesting lines
      if (i < 15 && (line.includes("[") || line.includes("##"))) {
        console.log(
          `[TaskCodeLensProvider] Line ${i}: "${line}" (chars: ${line
            .split("")
            .map((c) => c.charCodeAt(0))
            .join(",")})`
        );
      }

      // Try to match any task checkbox line first
      const match = line.match(/^-\s+\[([ x~])\]\s+(.+)$/);
      if (match) {
        console.log(
          `[TaskCodeLensProvider] Line ${i}: Matched checkbox: "${line.substring(
            0,
            60
          )}"`
        );
        const checkbox = match[1];
        const taskText = match[2];

        // Extract task ID - handles "1. Description", "1.1 Description", or "1.1. Description"
        const taskMatch = taskText.match(/^([\d.]+)\.?\s+(.+)$/);
        if (!taskMatch) {
          console.log(`[TaskCodeLensProvider]   -> No task ID found, skipping`);
          continue; // Skip lines that don't have task IDs
        }

        console.log(
          `[TaskCodeLensProvider]   -> Task ID: ${
            taskMatch[1]
          }, Desc: "${taskMatch[2].substring(0, 40)}"`
        );
        const taskId = taskMatch[1];
        const description = taskMatch[2];

        let status: "pending" | "in-progress" | "completed";
        if (checkbox === "x") {
          status = "completed";
        } else if (checkbox === "~") {
          status = "in-progress";
        } else {
          status = "pending";
        }

        // Check if this is a parent task (like "1." with just a number, no decimal)
        const isParentTask = /^\d+$/.test(taskId);

        if (isParentTask) {
          // Look ahead to find subtasks
          const subtasks: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            const subtaskLine = lines[j];
            // Stop if we hit another parent task or phase header
            if (
              subtaskLine.match(/^-\s+\[[ x~]\]\s+\d+\.?\s+/) ||
              subtaskLine.match(/^##/)
            ) {
              const isAnotherParent = subtaskLine.match(
                /^-\s+\[[ x~]\]\s+(\d+)\.?\s+/
              );
              if (isAnotherParent && /^\d+$/.test(isAnotherParent[1])) {
                break; // Found another parent task
              }
            }
            // Match potential subtasks
            const subtaskMatch = subtaskLine.match(
              /^-\s+\[([ x~])\]\s+([\d.]+)\.?\s+(.+)$/
            );
            if (subtaskMatch && subtaskMatch[2].startsWith(taskId + ".")) {
              subtasks.push(subtaskMatch[2]);
            }
          }

          tasks.push({
            line: i,
            taskId,
            text: description,
            status,
            isParent: true,
            subtasks,
          });
        } else {
          // Regular subtask
          tasks.push({
            line: i,
            taskId,
            text: description,
            status,
            isParent: false,
          });
        }
      }
    }

    console.log(`[TaskCodeLensProvider] Found ${tasks.length} tasks`);
    tasks.forEach((t) =>
      console.log(
        `[TaskCodeLensProvider]   - Task ${t.taskId}: ${t.text.substring(
          0,
          40
        )}, isParent: ${t.isParent}, subtasks: ${t.subtasks?.length || 0}`
      )
    );

    return tasks;
  }

  /**
   * Parse phases from document
   */
  private parsePhasesFromDocument(document: vscode.TextDocument): Array<{
    line: number;
    phaseNumber: number;
    title: string;
    tasks: string[];
  }> {
    const phases: Array<{
      line: number;
      phaseNumber: number;
      title: string;
      tasks: string[];
    }> = [];
    const text = document.getText();
    const lines = text.split("\n").map((l) => l.replace(/\r$/, "")); // Strip Windows line endings

    console.log(
      `[TaskCodeLensProvider] Parsing phases from ${lines.length} lines`
    );

    let currentPhase: {
      line: number;
      phaseNumber: number;
      title: string;
      tasks: string[];
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Debug: check lines that might be phase headers
      if (line.trim().startsWith("##")) {
        console.log(
          `[TaskCodeLensProvider] Line ${i} starts with ##: "${line}"`
        );
      }

      // Match phase headers like "## Phase 1: Foundation & Setup"
      const phaseMatch = line.match(/^##\s+(?:Phase\s+)?(\d+):\s*(.+)$/i);
      if (phaseMatch) {
        console.log(
          `[TaskCodeLensProvider] Line ${i}: Found phase ${phaseMatch[1]}: ${phaseMatch[2]}`
        );
        // Save previous phase if exists
        if (currentPhase) {
          phases.push(currentPhase);
        }

        currentPhase = {
          line: i,
          phaseNumber: parseInt(phaseMatch[1]),
          title: phaseMatch[2].trim(),
          tasks: [],
        };
      }

      // Match task lines to associate with current phase
      // Collect ALL tasks (both parent and subtasks) to execute
      const taskMatch = line.match(/^-\s+\[([ x~])\]\s+([\d.]+)\.?\s+(.+)$/);
      if (taskMatch && currentPhase) {
        const taskId = taskMatch[2];

        // Add to phase's task list
        // If it's a parent task (like "1."), collect its subtasks later
        // If it's a subtask (like "1.1"), add it directly
        if (!taskId.match(/^\d+$/)) {
          // This is a subtask (has a dot like "1.1"), add it
          currentPhase.tasks.push(taskId);
        } else {
          // This is a parent task (just a number like "1")
          // We'll still add it to allow "Start Phase" to work
          // but it will be expanded to subtasks when executed
          currentPhase.tasks.push(taskId);
        }
      }
    }

    // Don't forget the last phase
    if (currentPhase) {
      phases.push(currentPhase);
    }

    console.log(`[TaskCodeLensProvider] Found ${phases.length} phases`);
    phases.forEach((p) =>
      console.log(
        `[TaskCodeLensProvider]   - Phase ${p.phaseNumber}: ${p.title}, ${p.tasks.length} tasks`
      )
    );

    return phases;
  }
}

/**
 * Update task checkbox in document
 */
export async function updateTaskCheckbox(
  uri: vscode.Uri,
  line: number,
  newStatus: " " | "x" | "~"
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);

  const lineText = document.lineAt(line).text;
  const newLineText = lineText.replace(
    /^(-\s+\[)[ x~](\]\s+.+)$/,
    `$1${newStatus}$2`
  );

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    uri,
    new vscode.Range(line, 0, line, lineText.length),
    newLineText
  );

  await vscode.workspace.applyEdit(edit);
  await document.save();
}
