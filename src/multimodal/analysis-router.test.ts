/**
 * Unit tests for AnalysisRouter
 * Tests routing logic, backend availability checks, and error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalysisRouter, createAnalysisRouter } from "./analysis-router";
import { ILocalEngineAdapter } from "./local-engine-adapter";
import { ICloudEndpointAdapter } from "./cloud-endpoint-adapter";
import { AnalysisRequest, AnalysisResult } from "./types";
import * as fs from "fs";

// Mock fs module
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFile: vi.fn(),
}));

describe("AnalysisRouter", () => {
  let mockLocalAdapter: ILocalEngineAdapter;
  let mockCloudAdapter: ICloudEndpointAdapter;
  let router: AnalysisRouter;

  const mockAnalysisResult: AnalysisResult = {
    id: "test-id",
    imagePath: "/test/image.png",
    timestamp: new Date().toISOString(),
    modelId: "test-model",
    inferenceMode: "local",
    duration: 100,
    labels: [{ label: "test", confidence: 0.9 }],
  };

  const createRequest = (mode: "local" | "cloud"): AnalysisRequest => ({
    imagePath: "/test/image.png",
    mimeType: "image/png",
    fileSize: 1024,
    modelId: "test-model",
    confidenceThreshold: 50,
    inferenceMode: mode,
    workspaceRoot: "/test/workspace",
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocalAdapter = {
      analyze: vi.fn().mockResolvedValue(mockAnalysisResult),
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    mockCloudAdapter = {
      analyze: vi.fn().mockResolvedValue({ ...mockAnalysisResult, inferenceMode: "cloud" }),
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    router = new AnalysisRouter({
      localEngineAdapter: mockLocalAdapter,
      cloudEndpointAdapter: mockCloudAdapter,
    });

    // Default: file exists
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockImplementation((_path, callback) => {
      (callback as (err: NodeJS.ErrnoException | null, data: Buffer) => void)(
        null,
        Buffer.from("test-image-data")
      );
    });
  });

  describe("route", () => {
    it("should route to local engine when mode is local", async () => {
      const request = createRequest("local");
      
      const result = await router.route(request);

      expect(mockLocalAdapter.analyze).toHaveBeenCalledWith(
        request.imagePath,
        request.modelId
      );
      expect(mockCloudAdapter.analyze).not.toHaveBeenCalled();
      expect(result.inferenceMode).toBe("local");
    });

    it("should route to cloud endpoint when mode is cloud", async () => {
      const request = createRequest("cloud");
      
      const result = await router.route(request);

      expect(mockCloudAdapter.analyze).toHaveBeenCalled();
      expect(mockLocalAdapter.analyze).not.toHaveBeenCalled();
      expect(result.inferenceMode).toBe("cloud");
    });

    it("should check backend availability before routing", async () => {
      const request = createRequest("local");
      
      await router.route(request);

      expect(mockLocalAdapter.isAvailable).toHaveBeenCalled();
    });

    it("should throw error when backend is not available", async () => {
      vi.mocked(mockLocalAdapter.isAvailable).mockResolvedValue(false);
      const request = createRequest("local");

      await expect(router.route(request)).rejects.toMatchObject({
        code: "LOCAL_ENGINE_NOT_FOUND",
        message: expect.stringContaining("not available"),
      });
    });

    it("should throw error when cloud endpoint is not available", async () => {
      vi.mocked(mockCloudAdapter.isAvailable).mockResolvedValue(false);
      const request = createRequest("cloud");

      await expect(router.route(request)).rejects.toMatchObject({
        code: "ENDPOINT_UNREACHABLE",
        message: expect.stringContaining("not available"),
      });
    });

    it("should throw error when image file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const request = createRequest("local");

      await expect(router.route(request)).rejects.toMatchObject({
        code: "FILE_NOT_FOUND",
        message: expect.stringContaining("not found"),
      });
    });

    it("should set image path on cloud result", async () => {
      const request = createRequest("cloud");
      
      const result = await router.route(request);

      expect(result.imagePath).toBe(request.imagePath);
    });

    it("should track last used mode", async () => {
      expect(router.getLastUsedMode()).toBeNull();

      await router.route(createRequest("local"));
      expect(router.getLastUsedMode()).toBe("local");

      await router.route(createRequest("cloud"));
      expect(router.getLastUsedMode()).toBe("cloud");
    });
  });

  describe("isBackendAvailable", () => {
    it("should check local engine availability for local mode", async () => {
      await router.isBackendAvailable("local");

      expect(mockLocalAdapter.isAvailable).toHaveBeenCalled();
      expect(mockCloudAdapter.isAvailable).not.toHaveBeenCalled();
    });

    it("should check cloud endpoint availability for cloud mode", async () => {
      await router.isBackendAvailable("cloud");

      expect(mockCloudAdapter.isAvailable).toHaveBeenCalled();
      expect(mockLocalAdapter.isAvailable).not.toHaveBeenCalled();
    });

    it("should return true when backend is available", async () => {
      vi.mocked(mockLocalAdapter.isAvailable).mockResolvedValue(true);

      const result = await router.isBackendAvailable("local");

      expect(result).toBe(true);
    });

    it("should return false when backend is not available", async () => {
      vi.mocked(mockLocalAdapter.isAvailable).mockResolvedValue(false);

      const result = await router.isBackendAvailable("local");

      expect(result).toBe(false);
    });
  });

  describe("createAnalysisRouter", () => {
    it("should create router with default adapters", () => {
      const router = createAnalysisRouter();

      expect(router).toBeInstanceOf(AnalysisRouter);
    });

    it("should create router with custom adapters", () => {
      const router = createAnalysisRouter({
        localEngineAdapter: mockLocalAdapter,
        cloudEndpointAdapter: mockCloudAdapter,
      });

      expect(router).toBeInstanceOf(AnalysisRouter);
    });
  });

  describe("adapter setters", () => {
    it("should allow updating local engine adapter", async () => {
      const newAdapter: ILocalEngineAdapter = {
        analyze: vi.fn().mockResolvedValue({ ...mockAnalysisResult, modelId: "new-model" }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      router.setLocalEngineAdapter(newAdapter);
      await router.route(createRequest("local"));

      expect(newAdapter.analyze).toHaveBeenCalled();
    });

    it("should allow updating cloud endpoint adapter", async () => {
      const newAdapter: ICloudEndpointAdapter = {
        analyze: vi.fn().mockResolvedValue({ ...mockAnalysisResult, modelId: "new-model" }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      router.setCloudEndpointAdapter(newAdapter);
      await router.route(createRequest("cloud"));

      expect(newAdapter.analyze).toHaveBeenCalled();
    });
  });
});
