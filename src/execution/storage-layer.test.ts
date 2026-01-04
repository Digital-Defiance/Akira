/**
 * Tests for Storage Layer
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { StorageLayer } from "./storage-layer";

describe("StorageLayer", () => {
  let storage: StorageLayer;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, "../../test-temp", `storage-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });
    storage = new StorageLayer(testDir);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("atomic writes", () => {
    it("should write file atomically", async () => {
      const filePath = "test/data.txt";
      const content = "Hello, World!";

      await storage.writeFileAtomic(filePath, content);

      const result = await storage.readFile(filePath);
      expect(result).toBe(content);
    });

    it("should create directories automatically", async () => {
      const filePath = "deeply/nested/path/file.txt";
      const content = "content";

      await storage.writeFileAtomic(filePath, content);

      const exists = await storage.exists(filePath);
      expect(exists).toBe(true);
    });

    it("should handle concurrent writes safely", async () => {
      const filePath = "concurrent.txt";

      // Write multiple times concurrently
      const writes = Array.from({ length: 10 }, (_, i) =>
        storage.writeFileAtomic(filePath, `content-${i}`)
      );

      await Promise.all(writes);

      // File should exist with one of the contents (last write wins)
      const exists = await storage.exists(filePath);
      expect(exists).toBe(true);

      // Verify content is valid (one of the expected values)
      const content = await storage.readFile(filePath);
      const isValidContent = /^content-\d+$/.test(content);
      expect(isValidContent).toBe(true);
    });
  });

  describe("queued writes", () => {
    it("should debounce writes to same file", async () => {
      const filePath = "debounced.txt";

      // Queue multiple writes
      const promises = [
        storage.queueWrite(filePath, "v1"),
        storage.queueWrite(filePath, "v2"),
        storage.queueWrite(filePath, "v3"),
      ];

      await Promise.all(promises);
      await storage.flush();

      // Should have last value
      const content = await storage.readFile(filePath);
      expect(content).toBe("v3");
    });
  });

  describe("file operations", () => {
    it("should check file existence", async () => {
      const filePath = "exists-test.txt";

      expect(await storage.exists(filePath)).toBe(false);

      await storage.writeFileAtomic(filePath, "content");

      expect(await storage.exists(filePath)).toBe(true);
    });

    it("should delete files", async () => {
      const filePath = "delete-me.txt";
      await storage.writeFileAtomic(filePath, "content");

      expect(await storage.exists(filePath)).toBe(true);

      await storage.deleteFile(filePath);

      expect(await storage.exists(filePath)).toBe(false);
    });

    it("should list directory contents", async () => {
      await storage.writeFileAtomic("dir/file1.txt", "1");
      await storage.writeFileAtomic("dir/file2.txt", "2");

      const files = await storage.listDir("dir");

      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
    });

    it("should get file stats", async () => {
      const filePath = "stats-test.txt";
      const content = "test content";
      await storage.writeFileAtomic(filePath, content);

      const stats = await storage.getStats(filePath);

      expect(stats).not.toBeNull();
      expect(stats!.size).toBeGreaterThan(0);
    });
  });

  describe("hash calculation", () => {
    it("should calculate consistent hash", () => {
      const content = "test content";
      const hash1 = storage.calculateHash(content);
      const hash2 = storage.calculateHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it("should produce different hashes for different content", () => {
      const hash1 = storage.calculateHash("content1");
      const hash2 = storage.calculateHash("content2");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("directory operations", () => {
    it("should delete directory recursively", async () => {
      await storage.writeFileAtomic("dir/sub/file.txt", "content");

      expect(await storage.exists("dir/sub/file.txt")).toBe(true);

      await storage.deleteDir("dir");

      expect(await storage.exists("dir")).toBe(false);
    });
  });
});
