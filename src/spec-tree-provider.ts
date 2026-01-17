/**
 * Spec Tree View Provider
 * Provides a tree view of all specs in the workspace with phase and progress information
 */

import * as vscode from "vscode";
import { listSpecs, SpecInfo } from "./spec-directory";
import { readState } from "./state-manager";
import { Phase, TaskProgress } from "./types";
import { calculateTaskProgress } from "./task-progress";

/**
 * Tree item representing a spec in the tree view
 */
export class SpecTreeItem extends vscode.TreeItem {
  constructor(
    public readonly featureName: string,
    public readonly phase: Phase,
    public readonly progress: TaskProgress,
    public readonly approved: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(featureName, collapsibleState);

    this.tooltip = this.buildTooltip();
    this.description = this.buildDescription();
    this.iconPath = this.getIcon();
    this.contextValue = "spec";
  }

  private buildTooltip(): string {
    const lines = [
      `Feature: ${this.featureName}`,
      `Phase: ${this.phase}`,
      `Progress: ${this.progress.completed}/${this.progress.total} tasks (${this.progress.percentage}%)`,
    ];

    if (this.approved) {
      lines.push("✓ Approved");
    }

    return lines.join("\n");
  }

  private buildDescription(): string {
    return `${this.phase} • ${this.progress.percentage}%`;
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.approved) {
      return new vscode.ThemeIcon(
        "pass",
        new vscode.ThemeColor("testing.iconPassed")
      );
    }

    if (this.progress.inProgress > 0) {
      return new vscode.ThemeIcon(
        "sync~spin",
        new vscode.ThemeColor("testing.iconQueued")
      );
    }

    if (this.progress.completed > 0) {
      return new vscode.ThemeIcon(
        "circle-outline",
        new vscode.ThemeColor("testing.iconUnset")
      );
    }

    return new vscode.ThemeIcon(
      "circle-outline",
      new vscode.ThemeColor("testing.iconUnset")
    );
  }
}

/**
 * Tree item representing an individual task
 */
export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly taskId: string,
    public readonly taskText: string,
    public readonly status: "pending" | "in-progress" | "completed",
    public readonly featureName: string,
    public readonly lineNumber?: number
  ) {
    super(taskText, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `Task ${taskId}: ${taskText}\nClick to open in editor`;
    this.description = this.getStatusIcon();
    this.iconPath = this.getIcon();
    this.contextValue = `task-${status}`;

    // Add command to open tasks file at this task's location
    this.command = {
      command: "akira.openTaskInEditor",
      title: "Open Task",
      arguments: [featureName, taskId, lineNumber],
    };
  }

  private getStatusIcon(): string {
    switch (this.status) {
      case "completed":
        return "✓";
      case "in-progress":
        return "⟳";
      case "pending":
        return "○";
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.status) {
      case "completed":
        return new vscode.ThemeIcon(
          "pass",
          new vscode.ThemeColor("testing.iconPassed")
        );
      case "in-progress":
        return new vscode.ThemeIcon(
          "sync~spin",
          new vscode.ThemeColor("testing.iconQueued")
        );
      case "pending":
        return new vscode.ThemeIcon(
          "circle-outline",
          new vscode.ThemeColor("testing.iconUnset")
        );
    }
  }
}

/**
 * Tree item representing a phase document (requirements, design, tasks)
 */
export class PhaseDocumentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly featureName: string,
    public readonly documentType: "requirements" | "design" | "tasks",
    public readonly exists: boolean,
    public readonly approved: boolean = false
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    // Always allow opening - will create file if it doesn't exist
    this.command = {
      command: "akira.openOrCreatePhaseDocument",
      title: "Open Document",
      arguments: [this.featureName, this.documentType],
    };

    // Set icon based on approval status and existence
    if (!exists) {
      this.iconPath = new vscode.ThemeIcon(
        "file",
        new vscode.ThemeColor("disabledForeground")
      );
      this.description = "not created";
    } else if (approved) {
      this.iconPath = new vscode.ThemeIcon(
        "pass",
        new vscode.ThemeColor("testing.iconPassed")
      );
      this.description = "✓ approved";
    } else {
      this.iconPath = new vscode.ThemeIcon(
        "file",
        new vscode.ThemeColor("symbolIcon.fileForeground")
      );
      this.description = "pending approval";
    }

    this.contextValue = exists ? "phaseDocument" : "missingDocument";
    this.tooltip = this.buildTooltip();
  }

  private buildTooltip(): string {
    if (!this.exists) {
      return `${this.label} (not created yet)`;
    }
    if (this.approved) {
      return `${this.label} (approved) - Click to open`;
    }
    return `${this.label} (pending approval) - Click to open`;
  }
}

/**
 * Tree data provider for specs
 */
export class SpecTreeProvider
  implements
    vscode.TreeDataProvider<
      SpecTreeItem | PhaseDocumentTreeItem | TaskTreeItem
    >
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    | SpecTreeItem
    | PhaseDocumentTreeItem
    | TaskTreeItem
    | undefined
    | null
    | void
  > = new vscode.EventEmitter<
    | SpecTreeItem
    | PhaseDocumentTreeItem
    | TaskTreeItem
    | undefined
    | null
    | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    | SpecTreeItem
    | PhaseDocumentTreeItem
    | TaskTreeItem
    | undefined
    | null
    | void
  > = this._onDidChangeTreeData.event;

  private activeSpec?: string;

  constructor(private workspaceRoot?: string) {}

  /**
   * Set the currently active spec
   */
  setActiveSpec(featureName: string) {
    this.activeSpec = featureName;
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(
    element: SpecTreeItem | PhaseDocumentTreeItem | TaskTreeItem
  ): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  getChildren(
    element?: SpecTreeItem | PhaseDocumentTreeItem | TaskTreeItem
  ): Thenable<(SpecTreeItem | PhaseDocumentTreeItem | TaskTreeItem)[]> {
    if (!element) {
      // Root level - return all specs
      return Promise.resolve(this.getSpecTreeItems());
    }

    if (element instanceof SpecTreeItem) {
      // Spec level - return phase documents AND tasks
      const phaseDocuments = this.getPhaseDocuments(element.featureName);
      const tasks = this.getTaskItems(element.featureName);
      return Promise.resolve([...phaseDocuments, ...tasks]);
    }

    // Phase document and task level - no children
    return Promise.resolve([]);
  }

  /**
   * Get all spec tree items
   */
  private getSpecTreeItems(): SpecTreeItem[] {
    const specs = listSpecs(this.workspaceRoot);

    return specs.map((spec) => {
      const state = readState(spec.featureName, this.workspaceRoot);
      const phase = state?.currentPhase ?? "requirements";
      const progress = this.getProgressForSpec(spec);
      const approvalStatus = this.getApprovalStatus(spec);
      
      // Check if current phase is approved
      const currentPhaseApproved = this.isSpecApproved(spec, phase);

      const item = new SpecTreeItem(
        spec.featureName,
        phase,
        progress,
        currentPhaseApproved,
        vscode.TreeItemCollapsibleState.Collapsed
      );

      // Override icon based on approval status
      if (approvalStatus === "all") {
        item.iconPath = new vscode.ThemeIcon(
          "pass",
          new vscode.ThemeColor("testing.iconPassed")
        );
      } else if (approvalStatus === "some") {
        item.iconPath = new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("editorWarning.foreground")
        );
      } else {
        item.iconPath = new vscode.ThemeIcon(
          "circle-outline",
          new vscode.ThemeColor("testing.iconUnset")
        );
      }

      // Mark active spec with special indicator
      if (this.activeSpec === spec.featureName) {
        item.label = `▶ ${spec.featureName}`;
        item.iconPath = new vscode.ThemeIcon(
          "target",
          new vscode.ThemeColor("charts.blue")
        );
      }

      return item;
    });
  }

  /**
   * Get task items for a spec
   */
  private getTaskItems(featureName: string): TaskTreeItem[] {
    const specs = listSpecs(this.workspaceRoot);
    const spec = specs.find((s) => s.featureName === featureName);

    if (!spec || !spec.hasTasks) {
      return [];
    }

    try {
      // Read tasks.md file and parse tasks
      const workspaceRoot =
        this.workspaceRoot ||
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        "";
      const config = vscode.workspace.getConfiguration("copilotSpec");
      const specBaseDir = config.get<string>("specDirectory") || ".akira/specs";
      const tasksPath = `${workspaceRoot}/${specBaseDir}/${featureName}/tasks.md`;

      const fs = require("fs");
      if (!fs.existsSync(tasksPath)) {
        return [];
      }

      const content = fs.readFileSync(tasksPath, "utf-8");
      const tasks: TaskTreeItem[] = [];

      // Parse tasks from markdown
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match checkboxes flexibly: - [ ], - [x], - [X], - [~], - [-]
        const match = line.match(/^-\s*\[([\sxX~-])\]\s*(.+)$/i);
        if (match) {
          const checkbox = match[1];
          const text = match[2].trim();

          // Extract task ID flexibly
          // Handles: "1 Task", "1. Task", "1: Task", "1.1 Task", "1.1: Task", "1.) Task", etc.
          // Captures numeric ID and allows any combination of separators (dots, colons, parens, spaces)
          const taskMatch = text.match(/^(\d+(?:\.\d+)*)[:.\)\s]*(.+)$/);
          const taskId = taskMatch ? taskMatch[1] : tasks.length.toString();
          const taskText = taskMatch ? taskMatch[2] : text;

          let status: "pending" | "in-progress" | "completed";
          const checkboxLower = checkbox.toLowerCase();
          if (checkboxLower === "x") {
            status = "completed";
          } else if (checkbox === "~" || checkbox === "-") {
            status = "in-progress";
          } else {
            status = "pending";
          }

          tasks.push(
            new TaskTreeItem(
              taskId,
              taskText.trim(),
              status,
              featureName,
              i + 1
            )
          );
        }
      }

      return tasks;
    } catch (error) {
      console.error(`Error reading tasks for ${featureName}:`, error);
      return [];
    }
  }

  /**
   * Get phase documents for a spec
   */
  private getPhaseDocuments(featureName: string): PhaseDocumentTreeItem[] {
    const specs = listSpecs(this.workspaceRoot);
    const spec = specs.find((s) => s.featureName === featureName);

    if (!spec) {
      return [];
    }

    const state = readState(spec.featureName, this.workspaceRoot);

    return [
      new PhaseDocumentTreeItem(
        "Requirements",
        featureName,
        "requirements",
        spec.hasRequirements,
        state?.approvals.requirements ?? false
      ),
      new PhaseDocumentTreeItem(
        "Design",
        featureName,
        "design",
        spec.hasDesign,
        state?.approvals.design ?? false
      ),
      new PhaseDocumentTreeItem(
        "Tasks",
        featureName,
        "tasks",
        spec.hasTasks,
        state?.approvals.tasks ?? false
      ),
    ];
  }

  /**
   * Get progress for a spec
   */
  private getProgressForSpec(spec: SpecInfo): TaskProgress {
    if (!spec.hasTasks) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        optional: 0,
        percentage: 0,
      };
    }

    try {
      return calculateTaskProgress(spec.featureName, this.workspaceRoot);
    } catch (error) {
      console.error(
        `Error calculating progress for ${spec.featureName}:`,
        error
      );
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        optional: 0,
        percentage: 0,
      };
    }
  }

  /**
   * Get approval status for a spec
   * Returns "all" only when ALL three phases exist and are approved
   */
  private getApprovalStatus(spec: SpecInfo): "none" | "some" | "all" {
    const state = readState(spec.featureName, this.workspaceRoot);

    if (!state) {
      return "none";
    }

    // Check which phases are approved
    const requirementsApproved = state.approvals.requirements === true;
    const designApproved = state.approvals.design === true;
    const tasksApproved = state.approvals.tasks === true;

    // "all" only if ALL three phases exist AND are approved
    if (
      spec.hasRequirements &&
      spec.hasDesign &&
      spec.hasTasks &&
      requirementsApproved &&
      designApproved &&
      tasksApproved
    ) {
      return "all";
    }

    // "some" if at least one phase is approved
    if (requirementsApproved || designApproved || tasksApproved) {
      return "some";
    }

    return "none";
  }

  /**
   * Check if a spec is approved for its current phase
   */
  private isSpecApproved(spec: SpecInfo, phase: Phase): boolean {
    const state = readState(spec.featureName, this.workspaceRoot);

    if (!state) {
      return false;
    }

    // Check if current phase is approved
    if (phase === "requirements") {
      return state.approvals.requirements;
    } else if (phase === "design") {
      return state.approvals.design;
    } else if (phase === "tasks") {
      return state.approvals.tasks;
    }

    return false;
  }
}
