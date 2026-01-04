/**
 * Tests for Git Integrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GitIntegrator } from "./git-integrator";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

vi.mock("child_process");
vi.mock("fs");

describe("GitIntegrator", () => {
  let gitIntegrator: GitIntegrator;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    gitIntegrator = new GitIntegrator(workspaceRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("canRollbackWithGit", () => {
    it("should return true when .git exists and git is available", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => event === "data" && cb("git version 2.0")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.canRollbackWithGit();
      expect(result).toBe(true);
    });

    it("should return false when .git does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await gitIntegrator.canRollbackWithGit();
      expect(result).toBe(false);
    });

    it("should cache the result", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => event === "data" && cb("git version 2.0")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      await gitIntegrator.canRollbackWithGit();
      await gitIntegrator.canRollbackWithGit();

      // Should only check once (cached)
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCurrentCommit", () => {
    it("should return the current commit hash", async () => {
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => event === "data" && cb("abc123def456\n")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getCurrentCommit();
      expect(result).toBe("abc123def456");
    });

    it("should return null on error", async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(1)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getCurrentCommit();
      expect(result).toBeNull();
    });
  });

  describe("revertToHead", () => {
    it("should revert files to HEAD", async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.revertToHead(["file1.ts", "file2.ts"]);
      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        "git",
        ["checkout", "HEAD", "--", "file1.ts", "file2.ts"],
        expect.anything()
      );
    });

    it("should return true for empty file list", async () => {
      const result = await gitIntegrator.revertToHead([]);
      expect(result).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("getModifiedFiles", () => {
    it("should return list of modified files", async () => {
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => event === "data" && cb("file1.ts\nfile2.ts\n")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getModifiedFiles();
      expect(result).toEqual(["file1.ts", "file2.ts"]);
    });

    it("should return empty array on error", async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(1)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getModifiedFiles();
      expect(result).toEqual([]);
    });
  });

  describe("getStatus", () => {
    it("should return Git status summary", async () => {
      const mockProc = {
        stdout: {
          on: vi.fn((event, cb) =>
            event === "data" && cb(" M file1.ts\nA  file2.ts\n?? file3.ts\n")
          ),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getStatus();
      expect(result.clean).toBe(false);
      expect(result.modified).toBe(1);
      expect(result.staged).toBe(1);
      expect(result.untracked).toBe(1);
    });

    it("should indicate clean working directory", async () => {
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => event === "data" && cb("")) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && cb(0)),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await gitIntegrator.getStatus();
      expect(result.clean).toBe(true);
      expect(result.modified).toBe(0);
      expect(result.staged).toBe(0);
      expect(result.untracked).toBe(0);
    });
  });
});
