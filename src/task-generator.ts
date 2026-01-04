/**
 * Task Generator
 * Generates actionable task lists from design documents
 */

import { RequirementsDocument } from "./requirements-generator";
import { DesignDocument, CorrectnessProperty } from "./design-generator";

export interface Task {
  id: string; // e.g., "1", "1.1", "1.2"
  description: string;
  optional: boolean;
  completed: boolean;
  subtasks: Task[];
  requirementRefs: string[];
  propertyRef?: string; // For property test tasks
}

export interface TaskDocument {
  tasks: Task[];
}

export class TaskGenerator {
  /**
   * Generate tasks from design and requirements
   */
  generateTasks(
    design: DesignDocument,
    requirements: RequirementsDocument
  ): TaskDocument {
    const tasks: Task[] = [];
    let taskCounter = 1;

    // Generate implementation tasks based on components
    for (const component of design.components) {
      const task = this.generateComponentTask(
        component.name,
        taskCounter,
        design,
        requirements
      );
      tasks.push(task);
      taskCounter++;
    }

    // Add final checkpoint
    tasks.push(this.createCheckpointTask(taskCounter));

    // Validate task hierarchy
    this.validateTaskHierarchy(tasks);

    return { tasks };
  }

  /**
   * Generate a task for implementing a component
   */
  private generateComponentTask(
    componentName: string,
    taskId: number,
    design: DesignDocument,
    requirements: RequirementsDocument
  ): Task {
    const subtasks: Task[] = [];
    let subtaskCounter = 1;

    // Implementation subtask
    subtasks.push({
      id: `${taskId}.${subtaskCounter}`,
      description: `Implement ${componentName} core functionality`,
      optional: false,
      completed: false,
      subtasks: [],
      requirementRefs: this.extractRelevantRequirements(
        componentName,
        requirements
      ),
    });
    subtaskCounter++;

    // Property test subtasks for related properties
    const relatedProperties = this.findRelatedProperties(
      componentName,
      design.correctnessProperties
    );
    for (const property of relatedProperties) {
      subtasks.push({
        id: `${taskId}.${subtaskCounter}`,
        description: `Write property test for ${property.id}`,
        optional: false, // Will be marked optional later if it's a test task
        completed: false,
        subtasks: [],
        requirementRefs: property.validatesRequirements,
        propertyRef: property.id,
      });
      subtaskCounter++;
    }

    // Unit test subtask
    subtasks.push({
      id: `${taskId}.${subtaskCounter}`,
      description: `Write unit tests for ${componentName}`,
      optional: false, // Will be marked optional later
      completed: false,
      subtasks: [],
      requirementRefs: this.extractRelevantRequirements(
        componentName,
        requirements
      ),
    });

    return {
      id: String(taskId),
      description: `Implement ${componentName}`,
      optional: false,
      completed: false,
      subtasks,
      requirementRefs: [],
    };
  }

  /**
   * Extract relevant requirement IDs for a component
   */
  private extractRelevantRequirements(
    componentName: string,
    requirements: RequirementsDocument
  ): string[] {
    const refs: string[] = [];
    const componentLower = componentName.toLowerCase();

    for (const requirement of requirements.requirements) {
      const storyText = requirement.userStory.feature.toLowerCase();
      if (storyText.includes(componentLower.replace("component", ""))) {
        refs.push(requirement.id);
      }
    }

    return refs;
  }

  /**
   * Find properties related to a component
   */
  private findRelatedProperties(
    componentName: string,
    properties: CorrectnessProperty[]
  ): CorrectnessProperty[] {
    const componentLower = componentName.toLowerCase();
    return properties.filter((prop) => {
      const descLower = prop.description.toLowerCase();
      return descLower.includes(componentLower.replace("component", ""));
    });
  }

  /**
   * Create a checkpoint task
   */
  private createCheckpointTask(taskId: number): Task {
    return {
      id: String(taskId),
      description: "Checkpoint - Ensure all tests pass",
      optional: false,
      completed: false,
      subtasks: [],
      requirementRefs: [],
    };
  }

  /**
   * Validate task hierarchy (max 2 levels)
   */
  validateTaskHierarchy(tasks: Task[]): void {
    for (const task of tasks) {
      // Check top-level task ID format (should be just a number)
      if (!/^\d+$/.test(task.id)) {
        throw new Error(
          `Invalid top-level task ID: ${task.id}. Must be a number.`
        );
      }

      // Check subtasks
      for (const subtask of task.subtasks) {
        // Subtask ID should be in format "N.M"
        if (!/^\d+\.\d+$/.test(subtask.id)) {
          throw new Error(
            `Invalid subtask ID: ${subtask.id}. Must be in format "N.M".`
          );
        }

        // Subtasks should not have their own subtasks (max 2 levels)
        if (subtask.subtasks.length > 0) {
          throw new Error(
            `Task ${subtask.id} has subtasks, but maximum hierarchy depth is 2 levels.`
          );
        }
      }
    }
  }

  /**
   * Mark test-related subtasks as optional
   * @param strictMode - If true, no tasks will be marked as optional
   */
  markOptionalTasks(tasks: Task[], strictMode: boolean = false): Task[] {
    const markedTasks = this.deepCloneTasks(tasks);

    // In strict mode, all tasks are required - don't mark any as optional
    if (strictMode) {
      // Ensure all tasks are marked as non-optional
      for (const task of markedTasks) {
        task.optional = false;
        for (const subtask of task.subtasks) {
          subtask.optional = false;
        }
      }
      return markedTasks;
    }

    // In normal mode, mark test-related subtasks as optional
    for (const task of markedTasks) {
      for (const subtask of task.subtasks) {
        if (this.isTestTask(subtask)) {
          subtask.optional = true;
        }
      }
    }

    return markedTasks;
  }

  /**
   * Check if a task is test-related
   */
  private isTestTask(task: Task): boolean {
    const desc = task.description.toLowerCase();
    return (
      desc.includes("test") ||
      desc.includes("property test") ||
      desc.includes("unit test") ||
      desc.includes("integration test") ||
      desc.includes("write test")
    );
  }

  /**
   * Insert checkpoint tasks at appropriate intervals
   */
  insertCheckpoints(tasks: Task[]): Task[] {
    const tasksWithCheckpoints: Task[] = [];
    const checkpointInterval = 5; // Add checkpoint every 5 tasks

    for (let i = 0; i < tasks.length; i++) {
      tasksWithCheckpoints.push(tasks[i]);

      // Add checkpoint after every N tasks (but not after the last task)
      if (
        (i + 1) % checkpointInterval === 0 &&
        i < tasks.length - 1 &&
        !this.isCheckpointTask(tasks[i])
      ) {
        const checkpointId = String(tasksWithCheckpoints.length + 1);
        tasksWithCheckpoints.push(
          this.createCheckpointTask(Number(checkpointId))
        );
      }
    }

    // Ensure there's a final checkpoint if the last task isn't one
    const lastTask = tasksWithCheckpoints[tasksWithCheckpoints.length - 1];
    if (!this.isCheckpointTask(lastTask)) {
      const checkpointId = String(tasksWithCheckpoints.length + 1);
      tasksWithCheckpoints.push(
        this.createCheckpointTask(Number(checkpointId))
      );
    }

    // Re-number tasks to maintain sequential IDs
    return this.renumberTasks(tasksWithCheckpoints);
  }

  /**
   * Check if a task is a checkpoint task
   */
  private isCheckpointTask(task: Task): boolean {
    return (
      task.description.toLowerCase().includes("checkpoint") ||
      task.description.includes("Ensure all tests pass")
    );
  }

  /**
   * Renumber tasks to maintain sequential IDs
   */
  private renumberTasks(tasks: Task[]): Task[] {
    const renumbered: Task[] = [];
    let taskCounter = 1;

    for (const task of tasks) {
      const newTask = { ...task, id: String(taskCounter) };

      // Renumber subtasks
      if (newTask.subtasks.length > 0) {
        newTask.subtasks = newTask.subtasks.map((subtask, index) => ({
          ...subtask,
          id: `${taskCounter}.${index + 1}`,
        }));
      }

      renumbered.push(newTask);
      taskCounter++;
    }

    return renumbered;
  }

  /**
   * Deep clone tasks array
   */
  private deepCloneTasks(tasks: Task[]): Task[] {
    return tasks.map((task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    }));
  }

  /**
   * Format task document as markdown
   */
  formatAsMarkdown(taskDoc: TaskDocument): string {
    let markdown = "# Implementation Plan\n\n";

    for (const task of taskDoc.tasks) {
      markdown += this.formatTask(task, 0);
    }

    return markdown;
  }

  /**
   * Format a single task as markdown
   */
  private formatTask(task: Task, indentLevel: number): string {
    const indent = "  ".repeat(indentLevel);
    const checkbox = task.completed ? "[x]" : "[ ]";
    const optionalMarker = task.optional ? "*" : "";

    let markdown = `${indent}- ${checkbox}${optionalMarker} ${task.id}. ${task.description}\n`;

    // Add requirement references
    if (task.requirementRefs.length > 0 && task.subtasks.length === 0) {
      markdown += `${indent}  - _Requirements: ${task.requirementRefs.join(
        ", "
      )}_\n`;
    }

    // Add property reference for property test tasks
    if (task.propertyRef) {
      markdown += `${indent}  - **${task.propertyRef}**\n`;
      markdown += `${indent}  - **Validates: Requirements ${task.requirementRefs.join(
        ", "
      )}**\n`;
    }

    // Add subtasks
    for (const subtask of task.subtasks) {
      markdown += this.formatTask(subtask, indentLevel + 1);
    }

    return markdown;
  }
}
