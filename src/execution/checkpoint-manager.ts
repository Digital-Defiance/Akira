/**
 * Checkpoint Manager for Autonomous Execution
 * Creates and restores phase-level checkpoints for safe rollback
 */

import * as path from "path";
import * as fs from "fs";
import { StorageLayer } from "./storage-layer";
import { getEventBus } from "./event-bus";
import { GitIntegrator } from "./git-integrator";
import { CheckpointMetadata, CheckpointFile, RollbackResult } from "./types";

/**
 * Get the base directory for execution files (.akira or .akira for backwards compatibility)
 */
function getExecutionBaseDirectory(workspaceRoot: string): string {
  const akiraDir = path.join(workspaceRoot, ".akira");
  const kiroDir = path.join(workspaceRoot, ".akira");
  
  // If .akira exists, use it
  if (fs.existsSync(akiraDir)) {
    return ".akira";
  }
  
  // If .akira exists (backwards compatibility), use it
  if (fs.existsSync(kiroDir)) {
    return ".akira";
  }
  
  // Neither exists, use preferred (.akira)
  return ".akira";
}

/**
 * Checkpoint Manager handles creating and restoring checkpoints
 */
export class CheckpointManager {
  private storage: StorageLayer;
  private gitIntegrator: GitIntegrator;
  private checkpointsDir: string;

  constructor(workspaceRoot: string, specDirectory?: string) {
    this.storage = new StorageLayer(workspaceRoot);
    this.gitIntegrator = new GitIntegrator(workspaceRoot);
    
    // Use provided directory or auto-detect
    const baseDir = specDirectory || getExecutionBaseDirectory(workspaceRoot);
    this.checkpointsDir = path.join(baseDir, "checkpoints");
  }

  /**
   * Create a checkpoint for a session
   */
  async createCheckpoint(
    sessionId: string,
    phase: number,
    files: string[]
  ): Promise<string> {
    const checkpointId = `phase-${phase}-${Date.now()}`;
    const checkpointDir = path.join(this.checkpointsDir, sessionId);
    const checkpointPath = path.join(checkpointDir, `${checkpointId}.md`);

    // Try to create Git commit if available
    let gitCommit: string | null = null;
    const canUseGit = await this.gitIntegrator.canRollbackWithGit();
    
    if (canUseGit) {
      const status = await this.gitIntegrator.getStatus();
      if (!status.clean) {
        // Stage and commit changes
        await this.gitIntegrator.stageFiles(files);
        gitCommit = await this.gitIntegrator.createCommit(
          `Checkpoint: ${sessionId} - Phase ${phase}`
        );
      } else {
        // Clean working directory, get current commit
        gitCommit = await this.gitIntegrator.getCurrentCommit();
      }
    }

    // Snapshot files
    const snapshots: CheckpointFile[] = [];
    for (const filePath of files) {
      try {
        const content = await this.storage.readFile(filePath);
        const hash = this.storage.calculateHash(content);
        snapshots.push({
          path: filePath,
          hash,
          content,
        });
      } catch {
        // File doesn't exist or can't be read, skip
      }
    }

    // Create metadata
    const metadata: CheckpointMetadata = {
      checkpointId,
      sessionId,
      phase,
      createdAt: new Date().toISOString(),
      files: snapshots,
      gitCommit: gitCommit || undefined,
    };

    // Write checkpoint file
    const content = this.formatCheckpoint(metadata);
    await this.storage.ensureDir(checkpointDir);
    await this.storage.writeFileAtomic(checkpointPath, content);

    // Emit event
    await getEventBus().emit("checkpointCreated", sessionId, {
      checkpointId,
      phase,
      fileCount: snapshots.length,
      gitCommit,
    });

    return checkpointId;
  }

  /**
   * Restore from a checkpoint
   */
  async restoreCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<RollbackResult> {
    const checkpointPath = path.join(
      this.checkpointsDir,
      sessionId,
      `${checkpointId}.md`
    );

    try {
      const content = await this.storage.readFile(checkpointPath);
      const metadata = this.parseCheckpoint(content);

      const filesRestored: string[] = [];

      // Try Git rollback first if available
      if (metadata.gitCommit) {
        const canUseGit = await this.gitIntegrator.canRollbackWithGit();
        if (canUseGit) {
          const success = await this.gitIntegrator.revertToCommit(
            metadata.gitCommit
          );
          if (success) {
            // Git rollback successful
            filesRestored.push(...metadata.files.map((f) => f.path));
            
            await getEventBus().emit("rollbackPerformed", sessionId, {
              checkpointId,
              filesRestored: filesRestored.length,
              method: "git",
            });

            return {
              success: true,
              filesRestored,
            };
          }
        }
      }

      // Fallback to file-based rollback
      for (const file of metadata.files) {
        if (file.content) {
          await this.storage.writeFileAtomic(file.path, file.content);
          filesRestored.push(file.path);
        }
      }

      // Emit event
      await getEventBus().emit("rollbackPerformed", sessionId, {
        checkpointId,
        filesRestored: filesRestored.length,
        method: "file",
      });

      return {
        success: true,
        filesRestored,
      };
    } catch (error) {
      return {
        success: false,
        filesRestored: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<CheckpointMetadata[]> {
    const checkpointDir = path.join(this.checkpointsDir, sessionId);

    try {
      const files = await this.storage.listDir(checkpointDir);
      const checkpoints: CheckpointMetadata[] = [];

      for (const file of files) {
        if (file.endsWith(".md")) {
          const filePath = path.join(checkpointDir, file);
          const content = await this.storage.readFile(filePath);
          const metadata = this.parseCheckpoint(content);
          checkpoints.push(metadata);
        }
      }

      // Sort by creation time (newest first)
      checkpoints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return checkpoints;
    } catch {
      return [];
    }
  }

  /**
   * Delete old checkpoints
   */
  async deleteCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const checkpointPath = path.join(
      this.checkpointsDir,
      sessionId,
      `${checkpointId}.md`
    );
    await this.storage.deleteFile(checkpointPath);
  }

  /**
   * Compact checkpoints for a session
   * Keeps only phase boundaries and recent checkpoints
   */
  async compactCheckpoints(
    sessionId: string,
    keepRecent: number = 10
  ): Promise<number> {
    const checkpoints = await this.listCheckpoints(sessionId);

    if (checkpoints.length <= keepRecent) {
      return 0;
    }

    // Keep phase boundaries (phase-1, phase-2, etc.) and recent ones
    const toKeep = new Set<string>();

    // Keep phase boundaries
    const phaseBoundaries = checkpoints.filter((c) =>
      c.checkpointId.match(/^phase-\d+-/)
    );
    phaseBoundaries.forEach((c) => toKeep.add(c.checkpointId));

    // Keep most recent
    checkpoints.slice(0, keepRecent).forEach((c) => toKeep.add(c.checkpointId));

    // Delete others
    let deletedCount = 0;
    for (const checkpoint of checkpoints) {
      if (!toKeep.has(checkpoint.checkpointId)) {
        await this.deleteCheckpoint(sessionId, checkpoint.checkpointId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Format checkpoint as markdown
   */
  private formatCheckpoint(metadata: CheckpointMetadata): string {
    const fileList = metadata.files
      .map((f) => `- ${f.path} (${f.hash})`)
      .join("\n");

    let content = `---
checkpointId: ${metadata.checkpointId}
sessionId: ${metadata.sessionId}
phase: ${metadata.phase}
createdAt: ${metadata.createdAt}
fileCount: ${metadata.files.length}
${metadata.gitCommit ? `gitCommit: ${metadata.gitCommit}\n` : ""}---

# Checkpoint: ${metadata.checkpointId}

**Phase:** ${metadata.phase}  
**Created:** ${metadata.createdAt}

## Files Snapshot

${fileList || "No files captured"}

## File Contents

`;

    // Add file contents
    for (const file of metadata.files) {
      if (file.content) {
        const extension = path.extname(file.path).substring(1) || "text";
        content += `\n### ${file.path}\n\n\`\`\`${extension}\n${file.content}\n\`\`\`\n`;
      }
    }

    return content;
  }

  /**
   * Parse checkpoint from markdown
   */
  private parseCheckpoint(content: string): CheckpointMetadata {
    // Extract YAML front matter
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
      throw new Error("Invalid checkpoint format");
    }

    const frontMatter = frontMatterMatch[1];
    const lines = frontMatter.split("\n");
    const data: Record<string, string> = {};

    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        data[key.trim()] = valueParts.join(":").trim();
      }
    }

    // Parse file list from body
    const files: CheckpointFile[] = [];
    const fileListMatch = content.match(/## Files Snapshot\n\n([\s\S]*?)\n\n/);
    if (fileListMatch) {
      const fileLines = fileListMatch[1].split("\n");
      for (const line of fileLines) {
        const match = line.match(/- (.+) \(([^)]+)\)/);
        if (match) {
          files.push({
            path: match[1],
            hash: match[2],
          });
        }
      }
    }

    // Extract file contents from code blocks
    const fileContentRegex = /### (.+)\n\n```[\w]*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = fileContentRegex.exec(content)) !== null) {
      const filePath = match[1];
      const fileContent = match[2];
      const file = files.find((f) => f.path === filePath);
      if (file) {
        file.content = fileContent;
      }
    }

    return {
      checkpointId: data.checkpointId,
      sessionId: data.sessionId,
      phase: parseInt(data.phase),
      createdAt: data.createdAt,
      files,
      gitCommit: data.gitCommit,
    };
  }
}
