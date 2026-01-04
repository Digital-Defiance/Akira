/**
 * Storage Layer for Autonomous Execution
 * Handles atomic file operations and session/checkpoint persistence
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/**
 * Queue item for write operations
 */
interface WriteQueueItem {
  filePath: string;
  content: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Storage Layer for file operations
 */
export class StorageLayer {
  private writeQueue: WriteQueueItem[] = [];
  private isProcessing: boolean = false;
  private debounceMs: number = 100;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(private workspaceRoot: string) {}

  /**
   * Ensure a directory exists (creates recursively if needed)
   */
  async ensureDir(dirPath: string): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    await fs.promises.mkdir(fullPath, { recursive: true });
  }

  /**
   * Write a file atomically (write to temp, then rename)
   */
  async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const dir = path.dirname(fullPath);
    const tempPath = path.join(
      dir,
      `.${path.basename(fullPath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
    );

    try {
      // Ensure directory exists
      await this.ensureDir(dir);

      // Write to temp file
      await fs.promises.writeFile(tempPath, content, "utf-8");

      // Rename temp to target (atomic on most file systems)
      await fs.promises.rename(tempPath, fullPath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Queue a write operation (with debouncing for batched writes)
   */
  queueWrite(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ filePath, content, resolve, reject });
      this.scheduleProcessQueue();
    });
  }

  /**
   * Schedule queue processing with debounce
   */
  private scheduleProcessQueue(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.processQueue(), this.debounceMs);
  }

  /**
   * Process the write queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Group writes by file path (take latest content for each file)
    const writesByPath = new Map<string, WriteQueueItem[]>();
    for (const item of this.writeQueue) {
      if (!writesByPath.has(item.filePath)) {
        writesByPath.set(item.filePath, []);
      }
      writesByPath.get(item.filePath)!.push(item);
    }

    // Clear the queue
    this.writeQueue = [];

    // Process each unique file
    for (const [filePath, items] of writesByPath) {
      const lastItem = items[items.length - 1];
      try {
        await this.writeFileAtomic(filePath, lastItem.content);
        // Resolve all promises for this file
        items.forEach((item) => item.resolve());
      } catch (error) {
        // Reject all promises for this file
        items.forEach((item) => item.reject(error as Error));
      }
    }

    this.isProcessing = false;

    // Process any new items that were added while we were writing
    if (this.writeQueue.length > 0) {
      this.scheduleProcessQueue();
    }
  }

  /**
   * Read a file
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return fs.promises.readFile(fullPath, "utf-8");
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.promises.unlink(fullPath);
  }

  /**
   * Delete a directory recursively
   */
  async deleteDir(dirPath: string): Promise<void> {
    const fullPath = this.resolvePath(dirPath);
    await fs.promises.rm(fullPath, { recursive: true, force: true });
  }

  /**
   * List files in a directory
   */
  async listDir(dirPath: string): Promise<string[]> {
    const fullPath = this.resolvePath(dirPath);
    try {
      return await fs.promises.readdir(fullPath);
    } catch {
      return [];
    }
  }

  /**
   * Get file stats
   */
  async getStats(filePath: string): Promise<fs.Stats | null> {
    const fullPath = this.resolvePath(filePath);
    try {
      return await fs.promises.stat(fullPath);
    } catch {
      return null;
    }
  }

  /**
   * Calculate hash of file content
   */
  calculateHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").substring(0, 16);
  }

  /**
   * Clean up old checkpoint files based on retention days
   */
  async cleanupOldCheckpoints(
    checkpointsDir: string,
    retentionDays: number
  ): Promise<number> {
    let cleanedCount = 0;

    try {
      const sessions = await this.listDir(checkpointsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      for (const sessionId of sessions) {
        const stats = await this.getStats(path.join(checkpointsDir, sessionId));
        
        if (stats && stats.mtime < cutoffDate) {
          await this.deleteDir(path.join(checkpointsDir, sessionId));
          cleanedCount++;
        }
      }
    } catch (error) {
      console.error("Error cleaning up checkpoints:", error);
    }

    return cleanedCount;
  }

  /**
   * Resolve a path relative to workspace root
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceRoot, filePath);
  }

  /**
   * Flush any pending writes
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.processQueue();
  }
}
