/**
 * Example Usage of Task Validator in Autonomous Execution
 *
 * This demonstrates how to integrate task validation into the autonomous
 * execution flow to detect and skip tasks that are already complete.
 */

import { checkTaskAlreadyComplete, findNextTask } from "./autonomous-executor";
import { updateTaskStatus } from "./state-manager";

/**
 * Example: Execute next task with automatic completion detection
 *
 * This function demonstrates the recommended flow:
 * 1. Find the next incomplete task
 * 2. Check if its success criteria are already met
 * 3. If complete, mark as done and move to next task
 * 4. If not complete, proceed with execution
 */
export async function executeNextTaskWithValidation(
  featureName: string,
  workspaceRoot: string,
  specDirectory: string = ".kiro/specs"
): Promise<{
  taskId: string;
  action: "already-complete" | "needs-execution" | "no-task";
  message: string;
}> {
  // Step 1: Find next incomplete task
  const task = findNextTask(featureName, workspaceRoot, specDirectory);

  if (!task) {
    return {
      taskId: "",
      action: "no-task",
      message: "No more incomplete tasks found",
    };
  }

  // Step 2: Check if task is already complete
  console.log(`Checking if task ${task.id} is already complete...`);
  const validation = await checkTaskAlreadyComplete(
    featureName,
    task,
    workspaceRoot,
    specDirectory
  );

  // Step 3: Handle result
  if (validation.alreadyComplete) {
    console.log(`✓ Task ${task.id} is already complete!`);
    console.log(`  Reason: ${validation.reason}`);
    console.log(`  Detected conditions:`);
    validation.detectedConditions.forEach((cond) => {
      console.log(`    - ${cond}`);
    });

    // Auto-complete the task
    updateTaskStatus(featureName, task.id, "completed", workspaceRoot);

    return {
      taskId: task.id,
      action: "already-complete",
      message: `Task ${task.id} was automatically marked complete because all success criteria are met: ${validation.reason}`,
    };
  } else {
    console.log(`→ Task ${task.id} needs execution`);
    console.log(`  Reason: ${validation.reason}`);

    if (validation.missingConditions.length > 0) {
      console.log(`  Missing conditions:`);
      validation.missingConditions.forEach((cond) => {
        console.log(`    - ${cond}`);
      });
    }

    return {
      taskId: task.id,
      action: "needs-execution",
      message: `Task ${task.id} requires execution: ${validation.reason}`,
    };
  }
}

/**
 * Example: Batch validate all incomplete tasks
 *
 * This can be useful to get an overview of which tasks are actually
 * already complete before starting autonomous execution.
 */
export async function validateAllIncompleteTasks(
  featureName: string,
  workspaceRoot: string,
  specDirectory: string = ".kiro/specs"
): Promise<{
  alreadyComplete: string[];
  needsWork: string[];
  cannotValidate: string[];
}> {
  const result = {
    alreadyComplete: [] as string[],
    needsWork: [] as string[],
    cannotValidate: [] as string[],
  };

  // This would need to be implemented to get all tasks
  // For now, just checking the next task as an example
  const task = findNextTask(featureName, workspaceRoot, specDirectory);

  if (task) {
    const validation = await checkTaskAlreadyComplete(
      featureName,
      task,
      workspaceRoot,
      specDirectory
    );

    if (validation.alreadyComplete) {
      result.alreadyComplete.push(task.id);
    } else if (validation.reason?.includes("No success criteria")) {
      result.cannotValidate.push(task.id);
    } else {
      result.needsWork.push(task.id);
    }
  }

  return result;
}

/**
 * Example usage in a loop
 */
export async function autonomousExecutionLoop(
  featureName: string,
  workspaceRoot: string,
  specDirectory: string = ".kiro/specs"
): Promise<void> {
  console.log(`Starting autonomous execution for ${featureName}...`);

  let continueLoop = true;
  let iteration = 0;
  const maxIterations = 100; // Safety limit

  while (continueLoop && iteration < maxIterations) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);

    const result = await executeNextTaskWithValidation(
      featureName,
      workspaceRoot,
      specDirectory
    );

    switch (result.action) {
      case "no-task":
        console.log("✓ All tasks completed!");
        continueLoop = false;
        break;

      case "already-complete":
        console.log(`✓ Auto-completed: ${result.message}`);
        // Continue to next task
        break;

      case "needs-execution":
        console.log(`→ Executing: ${result.message}`);
        // Here you would call the actual execution logic
        // For now, we'll just stop to demonstrate
        continueLoop = false;
        break;
    }
  }
}
