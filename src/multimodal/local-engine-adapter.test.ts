/**
 * Unit Tests for LocalEngineAdapter
 * Feature: multimodal-input
 * Requirements: REQ-3.2
 * 
 * Tests CLI argument construction, result parsing, and error handling
 * for the local analysis engine adapter.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as childProcess from "child_process";
import { EventEmitter, Readable } from "stream";
import {
  LocalEngineAdapter,
  DEFAULT_LOCAL_ENGINE_CONFIG,
} from "./local-engine-adapter";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

/**
 * Helper to create a mock ChildProcess with proper stream types
 */
function createMockProcess(): childProcess.ChildProcess & { kill: ReturnType<typeof vi.fn> } {
  const mockProcess = new EventEmitter() as childProcess.ChildProcess & { kill: ReturnType<typeof vi.fn> };
  
  // Create proper Readable streams that extend EventEmitter
  const stdoutStream = new Readable({ read() {} });
  const stderrStream = new Readable({ read() {} });
  
  mockProcess.stdout = stdoutStream;
  mockProcess.stderr = stderrStream;
  mockProcess.kill = vi.fn().mockReturnValue(true);
  
  return mockProcess;
}

describe("LocalEngineAdapter Unit Tests", () => {
  let adapter: LocalEngineAdapter;

  beforeEach(() => {
    adapter = new LocalEngineAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("CLI Argument Construction", () => {
    /**
     * **Validates: Requirements REQ-3.2**
     * Test that CLI arguments are constructed correctly for the local binary
     */
    it("should build correct CLI arguments with image path and model id", () => {
      const imagePath = "/path/to/image.png";
      const modelId = "test-model-v1";

      const args = adapter.buildCliArguments(imagePath, modelId);

      expect(args).toEqual([
        "--image", imagePath,
        "--model", modelId,
        "--output", "json"
      ]);
    });

    it("should handle paths with spaces", () => {
      const imagePath = "/path/to/my image file.png";
      const modelId = "model-with-spaces";

      const args = adapter.buildCliArguments(imagePath, modelId);

      expect(args).toContain(imagePath);
      expect(args).toContain(modelId);
    });

    it("should handle special characters in paths", () => {
      const imagePath = "/path/to/image-with_special.chars!@#.png";
      const modelId = "model_v1.2.3";

      const args = adapter.buildCliArguments(imagePath, modelId);

      expect(args[1]).toBe(imagePath);
      expect(args[3]).toBe(modelId);
    });
  });

  describe("Result Parsing", () => {
    /**
     * **Validates: Requirements REQ-3.2**
     * Test that JSON output from the local engine is parsed correctly
     */
    it("should parse valid JSON result with labels", () => {
      const stdout = JSON.stringify({
        labels: [
          { label: "cat", confidence: 0.95, boundingBox: { x: 10, y: 20, width: 100, height: 80 } },
          { label: "dog", confidence: 0.85 }
        ],
        ocrText: "Hello World",
        modelId: "test-model"
      });

      const result = adapter.parseResult(stdout, "/test/image.png", "test-model", 1500);

      expect(result.imagePath).toBe("/test/image.png");
      expect(result.modelId).toBe("test-model");
      expect(result.inferenceMode).toBe("local");
      expect(result.duration).toBe(1500);
      expect(result.labels).toHaveLength(2);
      expect(result.labels[0].label).toBe("cat");
      expect(result.labels[0].confidence).toBe(0.95);
      expect(result.labels[0].boundingBox).toEqual({ x: 10, y: 20, width: 100, height: 80 });
      expect(result.ocrText).toBe("Hello World");
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it("should parse result with empty labels array", () => {
      const stdout = JSON.stringify({
        labels: [],
        modelId: "empty-model"
      });

      const result = adapter.parseResult(stdout, "/test/empty.png", "empty-model", 500);

      expect(result.labels).toEqual([]);
      expect(result.ocrText).toBeUndefined();
    });

    it("should parse result without optional fields", () => {
      const stdout = JSON.stringify({
        labels: [{ label: "object", confidence: 0.7 }]
      });

      const result = adapter.parseResult(stdout, "/test/minimal.png", "default-model", 1000);

      expect(result.labels).toHaveLength(1);
      expect(result.ocrText).toBeUndefined();
      expect(result.modelId).toBe("default-model"); // Falls back to provided modelId
    });

    it("should throw error for invalid JSON", () => {
      const invalidStdout = "not valid json {";

      expect(() => {
        adapter.parseResult(invalidStdout, "/test/image.png", "model", 100);
      }).toThrow();
    });

    it("should throw error when engine returns error field", () => {
      const errorStdout = JSON.stringify({
        error: "Model not found"
      });

      expect(() => {
        adapter.parseResult(errorStdout, "/test/image.png", "model", 100);
      }).toThrow(/Model not found/);
    });

    it("should include raw response in result", () => {
      const rawData = {
        labels: [{ label: "test", confidence: 0.5 }],
        extraField: "extra data"
      };
      const stdout = JSON.stringify(rawData);

      const result = adapter.parseResult(stdout, "/test/image.png", "model", 100);

      expect(result.rawResponse).toEqual(rawData);
    });
  });

  describe("Error Handling for Missing Binary", () => {
    /**
     * **Validates: Requirements REQ-3.2**
     * Test error handling when the local binary is not found
     */
    it("should return error when binary is not found (ENOENT)", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const analyzePromise = adapter.analyze("/test/image.png", "model");

      // Simulate ENOENT error
      const error = new Error("spawn image-analyzer ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockProcess.emit("error", error);

      await expect(analyzePromise).rejects.toMatchObject({
        code: "LOCAL_ENGINE_NOT_FOUND",
        message: expect.stringContaining("not found"),
        recoveryAction: expect.stringContaining("installed"),
      });
    });

    it("should return error when image file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(adapter.analyze("/nonexistent/image.png", "model")).rejects.toMatchObject({
        code: "LOCAL_ENGINE_NOT_FOUND",
        message: expect.stringContaining("Image file not found"),
      });
    });

    it("should return error on non-zero exit code", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const analyzePromise = adapter.analyze("/test/image.png", "model");

      // Simulate stderr output and non-zero exit
      mockProcess.stderr!.emit("data", Buffer.from("Error: Invalid model"));
      mockProcess.emit("close", 1);

      await expect(analyzePromise).rejects.toMatchObject({
        code: "LOCAL_ENGINE_NOT_FOUND",
        message: expect.stringContaining("exited with code 1"),
      });
    });

    it("should return timeout error when process exceeds timeout", async () => {
      vi.useFakeTimers();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      // Create adapter with short timeout
      const shortTimeoutAdapter = new LocalEngineAdapter({ timeout: 1000 });
      const analyzePromise = shortTimeoutAdapter.analyze("/test/image.png", "model");

      // Advance time past timeout
      vi.advanceTimersByTime(1001);

      // Simulate process close after kill
      mockProcess.emit("close", null);

      await expect(analyzePromise).rejects.toMatchObject({
        code: "LOCAL_ENGINE_TIMEOUT",
        message: expect.stringContaining("timed out"),
        retryable: true,
      });

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
      vi.useRealTimers();
    });
  });

  describe("Configuration", () => {
    it("should use default configuration", () => {
      const config = adapter.getConfig();

      expect(config).toEqual(DEFAULT_LOCAL_ENGINE_CONFIG);
    });

    it("should allow custom configuration", () => {
      const customAdapter = new LocalEngineAdapter({
        binaryPath: "/custom/path/analyzer",
        timeout: 60000,
      });

      const config = customAdapter.getConfig();

      expect(config.binaryPath).toBe("/custom/path/analyzer");
      expect(config.timeout).toBe(60000);
    });

    it("should allow updating configuration", () => {
      adapter.updateConfig({ timeout: 45000 });

      const config = adapter.getConfig();

      expect(config.timeout).toBe(45000);
      expect(config.binaryPath).toBe(DEFAULT_LOCAL_ENGINE_CONFIG.binaryPath);
    });
  });

  describe("isAvailable", () => {
    it("should return true when binary responds to --version", async () => {
      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const availablePromise = adapter.isAvailable();

      mockProcess.emit("close", 0);

      const result = await availablePromise;
      expect(result).toBe(true);
    });

    it("should return false when binary is not found", async () => {
      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const availablePromise = adapter.isAvailable();

      const error = new Error("spawn ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockProcess.emit("error", error);

      const result = await availablePromise;
      expect(result).toBe(false);
    });

    it("should return false when binary exits with non-zero code", async () => {
      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const availablePromise = adapter.isAvailable();

      mockProcess.emit("close", 1);

      const result = await availablePromise;
      expect(result).toBe(false);
    });
  });

  describe("Successful Analysis Flow", () => {
    it("should complete analysis successfully with valid response", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const analyzePromise = adapter.analyze("/test/image.png", "test-model");

      // Simulate successful response
      const response = JSON.stringify({
        labels: [{ label: "cat", confidence: 0.9 }],
        ocrText: "Test text"
      });
      mockProcess.stdout!.emit("data", Buffer.from(response));
      mockProcess.emit("close", 0);

      const result = await analyzePromise;

      expect(result.imagePath).toBe("/test/image.png");
      expect(result.modelId).toBe("test-model");
      expect(result.labels).toHaveLength(1);
      expect(result.labels[0].label).toBe("cat");
      expect(result.ocrText).toBe("Test text");
      expect(result.inferenceMode).toBe("local");
    });

    it("should call spawn with correct arguments", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const mockProcess = createMockProcess();
      vi.mocked(childProcess.spawn).mockReturnValue(mockProcess);

      const analyzePromise = adapter.analyze("/test/image.png", "my-model");

      // Complete the process
      mockProcess.stdout!.emit("data", Buffer.from('{"labels":[]}'));
      mockProcess.emit("close", 0);

      await analyzePromise;

      expect(childProcess.spawn).toHaveBeenCalledWith(
        "image-analyzer",
        ["--image", "/test/image.png", "--model", "my-model", "--output", "json"],
        expect.any(Object)
      );
    });
  });
});
