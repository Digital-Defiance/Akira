/**
 * Git Integrator for Autonomous Execution
 * Provides Git-based rollback capabilities
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Git command result
 */
interface GitResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Git Integrator handles Git operations for rollback
 */
export class GitIntegrator {
  private workspaceRoot: string;
  private gitAvailable: boolean | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Check if Git is available and workspace is a Git repo
   */
  async canRollbackWithGit(): Promise<boolean> {
    if (this.gitAvailable !== null) {
      return this.gitAvailable;
    }

    try {
      // Check if .git directory exists
      const gitDir = path.join(this.workspaceRoot, ".git");
      const hasGitDir = fs.existsSync(gitDir);

      if (!hasGitDir) {
        this.gitAvailable = false;
        return false;
      }

      // Check if git command is available
      const result = await this.runGitCommand(["--version"]);
      this.gitAvailable = result.success;
      return result.success;
    } catch {
      this.gitAvailable = false;
      return false;
    }
  }

  /**
   * Get current Git commit hash
   */
  async getCurrentCommit(): Promise<string | null> {
    const result = await this.runGitCommand(["rev-parse", "HEAD"]);
    return result.success ? result.output.trim() : null;
  }

  /**
   * Create a Git stash for current changes
   */
  async createStash(message: string): Promise<string | null> {
    const result = await this.runGitCommand(["stash", "push", "-u", "-m", message]);
    if (!result.success) {
      return null;
    }

    // Get the stash ref
    const stashResult = await this.runGitCommand(["stash", "list"]);
    if (stashResult.success) {
      const match = stashResult.output.match(/stash@\{0\}/);
      return match ? match[0] : null;
    }

    return null;
  }

  /**
   * Apply a Git stash
   */
  async applyStash(stashRef: string): Promise<boolean> {
    const result = await this.runGitCommand(["stash", "apply", stashRef]);
    return result.success;
  }

  /**
   * Create a rollback patch for specific files
   */
  async createRollbackPatch(files: string[]): Promise<string | null> {
    if (files.length === 0) {
      return null;
    }

    const result = await this.runGitCommand([
      "diff",
      "HEAD",
      "--",
      ...files,
    ]);

    if (result.success && result.output.trim()) {
      return result.output;
    }

    return null;
  }

  /**
   * Revert files to HEAD state
   */
  async revertToHead(files: string[]): Promise<boolean> {
    if (files.length === 0) {
      return true;
    }

    const result = await this.runGitCommand([
      "checkout",
      "HEAD",
      "--",
      ...files,
    ]);

    return result.success;
  }

  /**
   * Revert to a specific commit
   */
  async revertToCommit(commitHash: string): Promise<boolean> {
    const result = await this.runGitCommand([
      "reset",
      "--hard",
      commitHash,
    ]);

    return result.success;
  }

  /**
   * Get file content at specific commit
   */
  async getFileAtCommit(
    filePath: string,
    commitHash: string
  ): Promise<string | null> {
    const result = await this.runGitCommand([
      "show",
      `${commitHash}:${filePath}`,
    ]);

    return result.success ? result.output : null;
  }

  /**
   * Get list of modified files
   */
  async getModifiedFiles(): Promise<string[]> {
    const result = await this.runGitCommand([
      "diff",
      "--name-only",
      "HEAD",
    ]);

    if (!result.success) {
      return [];
    }

    return result.output
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  /**
   * Get list of staged files
   */
  async getStagedFiles(): Promise<string[]> {
    const result = await this.runGitCommand([
      "diff",
      "--name-only",
      "--cached",
    ]);

    if (!result.success) {
      return [];
    }

    return result.output
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  /**
   * Stage files for commit
   */
  async stageFiles(files: string[]): Promise<boolean> {
    if (files.length === 0) {
      return true;
    }

    const result = await this.runGitCommand(["add", ...files]);
    return result.success;
  }

  /**
   * Create a Git commit
   */
  async createCommit(message: string): Promise<string | null> {
    const result = await this.runGitCommand(["commit", "-m", message]);

    if (!result.success) {
      return null;
    }

    return await this.getCurrentCommit();
  }

  /**
   * Check if working directory is clean
   */
  async isWorkingDirectoryClean(): Promise<boolean> {
    const result = await this.runGitCommand(["status", "--porcelain"]);
    return result.success && result.output.trim().length === 0;
  }

  /**
   * Get Git status
   */
  async getStatus(): Promise<{
    clean: boolean;
    modified: number;
    staged: number;
    untracked: number;
  }> {
    const result = await this.runGitCommand(["status", "--porcelain"]);

    if (!result.success) {
      return { clean: false, modified: 0, staged: 0, untracked: 0 };
    }

    const lines = result.output.split("\n").filter((l) => l.trim());
    let modified = 0;
    let staged = 0;
    let untracked = 0;

    for (const line of lines) {
      const status = line.substring(0, 2);
      if (status.includes("M")) modified++;
      if (status.includes("A") || status.includes("D")) staged++;
      if (status.includes("?")) untracked++;
    }

    return {
      clean: lines.length === 0,
      modified,
      staged,
      untracked,
    };
  }

  /**
   * Run a Git command
   */
  private runGitCommand(args: string[]): Promise<GitResult> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, {
        cwd: this.workspaceRoot,
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr || undefined,
        });
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: error.message,
        });
      });
    });
  }
}
