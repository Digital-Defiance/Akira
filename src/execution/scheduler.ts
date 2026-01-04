/**
 * Task Scheduler for Autonomous Execution
 * Manages task queue and concurrency control
 */

import { getEventBus } from "./event-bus";
import { TaskRecord, SessionConfig } from "./types";

/**
 * Queued task with execution context
 */
interface QueuedTask {
  task: TaskRecord;
  sessionId: string;
  priority: number;
  addedAt: number;
}

/**
 * Worker status
 */
interface WorkerStatus {
  id: number;
  busy: boolean;
  currentTaskId?: string;
  startedAt?: number;
}

/**
 * Task executor function type
 */
export type TaskExecutor = (
  task: TaskRecord,
  sessionId: string
) => Promise<{ success: boolean; error?: string }>;

/**
 * Scheduler for managing task execution with concurrency control
 */
export class Scheduler {
  private queue: QueuedTask[] = [];
  private workers: WorkerStatus[] = [];
  private maxConcurrency: number;
  private isRunning: boolean = false;
  private executor: TaskExecutor | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    this.maxConcurrency = config.maxConcurrentTasks || 3;
    
    // Initialize workers
    for (let i = 0; i < this.maxConcurrency; i++) {
      this.workers.push({ id: i, busy: false });
    }
  }

  /**
   * Set the task executor function
   */
  setExecutor(executor: TaskExecutor): void {
    this.executor = executor;
  }

  /**
   * Set concurrency level
   */
  setConcurrency(n: number): void {
    if (n < 1 || n > 10) {
      throw new Error("Concurrency must be between 1 and 10");
    }

    this.maxConcurrency = n;

    // Adjust workers array
    while (this.workers.length < n) {
      this.workers.push({ id: this.workers.length, busy: false });
    }
  }

  /**
   * Enqueue a task for execution
   */
  enqueueTask(
    task: TaskRecord,
    sessionId: string,
    priority: number = 0
  ): void {
    const queuedTask: QueuedTask = {
      task,
      sessionId,
      priority,
      addedAt: Date.now(),
    };

    // Insert in priority order (higher priority first)
    const insertIndex = this.queue.findIndex((q) => q.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(queuedTask);
    } else {
      this.queue.splice(insertIndex, 0, queuedTask);
    }

    getEventBus().emit("taskQueued", sessionId, {
      taskId: task.id,
      queueLength: this.queue.length,
    });

    // Try to process if running
    if (this.isRunning) {
      this.tryProcessNext();
    }
  }

  /**
   * Enqueue multiple tasks
   */
  enqueueTasks(
    tasks: TaskRecord[],
    sessionId: string,
    basePriority: number = 0
  ): void {
    // Subtasks get slightly higher priority than their parent
    tasks.forEach((task, index) => {
      const priority = basePriority - index * 0.1;
      this.enqueueTask(task, sessionId, priority);
    });
  }

  /**
   * Start processing the queue (non-blocking)
   */
  startProcessing(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    // Don't await - let it run in background
    this.processLoop().catch((error) => {
      console.error("Error in scheduler process loop:", error);
      this.isRunning = false;
    });
  }

  /**
   * Stop processing (waits for current tasks to complete)
   */
  async stopProcessing(): Promise<void> {
    this.isRunning = false;

    // Wait for all workers to finish
    while (this.workers.some((w) => w.busy)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Shutdown immediately (cancels pending tasks)
   */
  shutdown(): void {
    this.isRunning = false;
    this.queue = [];
    this.workers.forEach((w) => {
      w.busy = false;
      w.currentTaskId = undefined;
    });
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    activeWorkers: number;
    isRunning: boolean;
  } {
    return {
      queueLength: this.queue.length,
      activeWorkers: this.workers.filter((w) => w.busy).length,
      isRunning: this.isRunning,
    };
  }

  /**
   * Get current queue
   */
  getQueue(): QueuedTask[] {
    return [...this.queue];
  }

  /**
   * Remove a task from the queue
   */
  dequeueTask(taskId: string): boolean {
    const index = this.queue.findIndex((q) => q.task.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      const processed = await this.tryProcessNext();
      if (!processed && this.queue.length === 0) {
        // Nothing to process, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Try to process the next task if a worker is available
   */
  private async tryProcessNext(): Promise<boolean> {
    if (!this.executor) {
      console.warn("No executor set for scheduler");
      return false;
    }

    // Find an available worker
    const worker = this.workers.find((w) => !w.busy);
    if (!worker) {
      return false;
    }

    // Get next task from queue
    const queuedTask = this.queue.shift();
    if (!queuedTask) {
      return false;
    }

    // Mark worker as busy
    worker.busy = true;
    worker.currentTaskId = queuedTask.task.id;
    worker.startedAt = Date.now();

    // Execute task asynchronously
    this.executeTask(worker, queuedTask);

    return true;
  }

  /**
   * Execute a task with a worker
   */
  private async executeTask(
    worker: WorkerStatus,
    queuedTask: QueuedTask
  ): Promise<void> {
    const { task, sessionId } = queuedTask;

    try {
      await getEventBus().emit("taskStarted", sessionId, {
        taskId: task.id,
        workerId: worker.id,
      });

      const result = await this.executor!(task, sessionId);

      if (result.success) {
        await getEventBus().emit("taskCompleted", sessionId, {
          taskId: task.id,
          duration: Date.now() - (worker.startedAt || 0),
        });
      } else {
        await getEventBus().emit("taskFailed", sessionId, {
          taskId: task.id,
          error: result.error,
          duration: Date.now() - (worker.startedAt || 0),
        });
      }
    } catch (error) {
      await getEventBus().emit("taskFailed", sessionId, {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Release worker
      worker.busy = false;
      worker.currentTaskId = undefined;
      worker.startedAt = undefined;

      // Try to process next task
      if (this.isRunning && this.queue.length > 0) {
        this.tryProcessNext();
      }
    }
  }
}
