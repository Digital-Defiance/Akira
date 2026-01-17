/**
 * Property-Based Tests for Analysis Router
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the AnalysisRouter component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { AnalysisRouter } from "./analysis-router";
import { ILocalEngineAdapter } from "./local-engine-adapter";
import { ICloudEndpointAdapter } from "./cloud-endpoint-adapter";
import { AnalysisRequest, AnalysisResult, InferenceMode, SupportedMimeType } from "./types";
import * as fs from "fs";

// Mock fs module
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFile: vi.fn(),
}));

describe("AnalysisRouter Property Tests", () => {
  let mockLocalAdapter: ILocalEngineAdapter;
  let mockCloudAdapter: ICloudEndpointAdapter;
  let router: AnalysisRouter;
  let localAnalyzeCalls: Array<{ imagePath: string; modelId: string }>;
  let cloudAnalyzeCalls: Array<{ imageData: string; modelId: string }>;

  const createMockResult = (mode: InferenceMode, imagePath: string, modelId: string): AnalysisResult => ({
    id: `test-${Date.now()}`,
    imagePath,
    timestamp: new Date().toISOString(),
    modelId,
    inferenceMode: mode,
    duration: 100,
    labels: [{ label: "test", confidence: 0.9 }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localAnalyzeCalls = [];
    cloudAnalyzeCalls = [];

    mockLocalAdapter = {
      analyze: vi.fn().mockImplementation((imagePath: string, modelId: string) => {
        localAnalyzeCalls.push({ imagePath, modelId });
        return Promise.resolve(createMockResult("local", imagePath, modelId));
      }),
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    mockCloudAdapter = {
      analyze: vi.fn().mockImplementation((imageData: string, modelId: string) => {
        cloudAnalyzeCalls.push({ imageData, modelId });
        return Promise.resolve(createMockResult("cloud", "", modelId));
      }),
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

  // Arbitrary generators
  const inferenceModeArb = fc.constantFrom<InferenceMode>("local", "cloud");
  const mimeTypeArb = fc.constantFrom<SupportedMimeType>("image/png", "image/jpeg", "image/webp", "image/gif");
  const imagePathArb = fc.string({ minLength: 1, maxLength: 100 }).map(s => `/test/${s.replace(/[^a-zA-Z0-9]/g, "_")}.png`);
  const modelIdArb = fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/[^a-zA-Z0-9-_]/g, ""));
  const fileSizeArb = fc.integer({ min: 100, max: 25 * 1024 * 1024 });
  const confidenceArb = fc.integer({ min: 0, max: 100 });
  const workspaceRootArb = fc.string({ minLength: 1, maxLength: 50 }).map(s => `/workspace/${s.replace(/[^a-zA-Z0-9]/g, "_")}`);

  const analysisRequestArb = (mode?: InferenceMode) => fc.record({
    imagePath: imagePathArb,
    mimeType: mimeTypeArb,
    fileSize: fileSizeArb,
    modelId: modelIdArb,
    confidenceThreshold: confidenceArb,
    inferenceMode: mode ? fc.constant(mode) : inferenceModeArb,
    workspaceRoot: workspaceRootArb,
  });

  describe("Feature: multimodal-input, Property 8: Analysis Routing by Mode", () => {
    /**
     * **Validates: Requirements REQ-3.1, REQ-3.2**
     * 
     * For any analysis request, the Analysis Router SHALL route to the cloud endpoint 
     * when inferenceMode is "cloud" and to the local engine when inferenceMode is "local".
     */
    it("should route to cloud endpoint when mode is cloud", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisRequestArb("cloud"),
          async (request) => {
            // Reset call tracking
            localAnalyzeCalls = [];
            cloudAnalyzeCalls = [];

            const result = await router.route(request);

            // Property: cloud mode routes to cloud endpoint
            expect(cloudAnalyzeCalls.length).toBe(1);
            expect(localAnalyzeCalls.length).toBe(0);
            expect(result.inferenceMode).toBe("cloud");
            expect(cloudAnalyzeCalls[0].modelId).toBe(request.modelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should route to local engine when mode is local", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisRequestArb("local"),
          async (request) => {
            // Reset call tracking
            localAnalyzeCalls = [];
            cloudAnalyzeCalls = [];

            const result = await router.route(request);

            // Property: local mode routes to local engine
            expect(localAnalyzeCalls.length).toBe(1);
            expect(cloudAnalyzeCalls.length).toBe(0);
            expect(result.inferenceMode).toBe("local");
            expect(localAnalyzeCalls[0].imagePath).toBe(request.imagePath);
            expect(localAnalyzeCalls[0].modelId).toBe(request.modelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should route to correct backend for any valid inference mode", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisRequestArb(),
          async (request) => {
            // Reset call tracking
            localAnalyzeCalls = [];
            cloudAnalyzeCalls = [];

            const result = await router.route(request);

            // Property: routing is deterministic based on mode
            if (request.inferenceMode === "cloud") {
              expect(cloudAnalyzeCalls.length).toBe(1);
              expect(localAnalyzeCalls.length).toBe(0);
              expect(result.inferenceMode).toBe("cloud");
            } else {
              expect(localAnalyzeCalls.length).toBe(1);
              expect(cloudAnalyzeCalls.length).toBe(0);
              expect(result.inferenceMode).toBe("local");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Feature: multimodal-input, Property 10: Settings Mode Persistence", () => {
    /**
     * **Validates: Requirements REQ-3.4**
     * 
     * For any inference mode change in settings, the new mode SHALL be persisted 
     * and applied to all subsequent analyses until changed again.
     */
    it("should persist and apply mode to subsequent analyses", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(inferenceModeArb, { minLength: 2, maxLength: 10 }),
          analysisRequestArb(),
          async (modeSequence, baseRequest) => {
            // Track the expected mode after each request
            for (const mode of modeSequence) {
              // Reset call tracking
              localAnalyzeCalls = [];
              cloudAnalyzeCalls = [];

              const request = { ...baseRequest, inferenceMode: mode };
              await router.route(request);

              // Property: last used mode should be persisted
              expect(router.getLastUsedMode()).toBe(mode);

              // Property: the correct backend was called
              if (mode === "cloud") {
                expect(cloudAnalyzeCalls.length).toBe(1);
                expect(localAnalyzeCalls.length).toBe(0);
              } else {
                expect(localAnalyzeCalls.length).toBe(1);
                expect(cloudAnalyzeCalls.length).toBe(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should apply mode immediately when changed", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisRequestArb("local"),
          analysisRequestArb("cloud"),
          async (localRequest, cloudRequest) => {
            // Reset call tracking
            localAnalyzeCalls = [];
            cloudAnalyzeCalls = [];

            // First request with local mode
            await router.route(localRequest);
            expect(router.getLastUsedMode()).toBe("local");
            expect(localAnalyzeCalls.length).toBe(1);
            expect(cloudAnalyzeCalls.length).toBe(0);

            // Reset tracking
            localAnalyzeCalls = [];
            cloudAnalyzeCalls = [];

            // Second request with cloud mode - should apply immediately
            await router.route(cloudRequest);
            expect(router.getLastUsedMode()).toBe("cloud");
            expect(cloudAnalyzeCalls.length).toBe(1);
            expect(localAnalyzeCalls.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain mode consistency across multiple requests with same mode", async () => {
      await fc.assert(
        fc.asyncProperty(
          inferenceModeArb,
          fc.array(analysisRequestArb(), { minLength: 2, maxLength: 5 }),
          async (mode, requests) => {
            // Apply the same mode to all requests
            const requestsWithMode = requests.map(r => ({ ...r, inferenceMode: mode }));

            for (const request of requestsWithMode) {
              // Reset call tracking
              localAnalyzeCalls = [];
              cloudAnalyzeCalls = [];

              await router.route(request);

              // Property: mode should be consistent
              expect(router.getLastUsedMode()).toBe(mode);

              // Property: same backend should be called each time
              if (mode === "cloud") {
                expect(cloudAnalyzeCalls.length).toBe(1);
                expect(localAnalyzeCalls.length).toBe(0);
              } else {
                expect(localAnalyzeCalls.length).toBe(1);
                expect(cloudAnalyzeCalls.length).toBe(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
