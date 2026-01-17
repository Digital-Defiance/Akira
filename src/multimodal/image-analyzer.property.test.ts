/**
 * Property-Based Tests for Image Analyzer Orchestrator
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the ImageAnalyzer component.
 * 
 * Property 3: Analysis Initiation Latency (REQ-1.2)
 * Property 4: Progress Update Frequency (REQ-1.3)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  ImageAnalyzer,
  MAX_ANALYSIS_START_LATENCY_MS,
  PROGRESS_UPDATE_INTERVAL_MS,
  AnalysisStartEvent,
  ProgressUpdateEvent,
} from "./image-analyzer";
import { SupportedMimeType, AnalysisResult, AnalysisRequest } from "./types";
import { IImageValidator } from "./image-validator";
import { ImageValidationResult } from "./types";
import { IAnalysisRouter } from "./analysis-router";
import { IResultsManager } from "./results-manager";
import { IConcurrencyManager, AnalysisExecutor } from "./concurrency-manager";
import { IOfflineQueueManager, CloudRequestExecutor } from "./offline-queue-manager";
import { MultimodalConfigManager } from "./config-manager";
import { ConsentManager } from "./consent-manager";
import { PluginLoader } from "./plugin-loader";
import { PresetManager } from "./preset-manager";
import { TelemetryService } from "./telemetry-service";
import { MultimodalEventBus } from "./event-bus";

// Test directory for temporary files
let testDir: string;

// Magic bytes for creating test files
const MAGIC_BYTES: Record<SupportedMimeType, Buffer> = {
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  "image/gif": Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  "image/webp": Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]),
};

// Mock VS Code module
vi.mock("vscode", () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: "",
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  EventEmitter: class MockEventEmitter {
    private listeners: Array<(e: unknown) => void> = [];
    event = (listener: (e: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data: unknown) {
      this.listeners.forEach(l => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  },
}));

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-analyzer-test-"));
});

afterAll(() => {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

/**
 * Creates a test image file with the specified MIME type and size
 */
function createTestImage(
  mimeType: SupportedMimeType,
  sizeBytes: number,
  filename: string
): string {
  const filePath = path.join(testDir, filename);
  const magicBytes = MAGIC_BYTES[mimeType];
  const paddingSize = Math.max(0, sizeBytes - magicBytes.length);
  const padding = Buffer.alloc(paddingSize, 0);
  const content = Buffer.concat([magicBytes, padding]);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a mock image validator that always returns valid
 */
function createMockValidator(mimeType: SupportedMimeType, fileSize: number): IImageValidator {
  return {
    validate: vi.fn().mockResolvedValue({
      valid: true,
      mimeType,
      fileSize,
    } as ImageValidationResult),
  };
}

/**
 * Create a mock analysis router with configurable delay
 */
function createMockRouter(delayMs: number = 0): IAnalysisRouter {
  return {
    route: vi.fn().mockImplementation(async (request: AnalysisRequest): Promise<AnalysisResult> => {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      return {
        id: `result-${Date.now()}`,
        imagePath: request.imagePath,
        timestamp: new Date().toISOString(),
        modelId: request.modelId,
        inferenceMode: request.inferenceMode,
        duration: delayMs,
        labels: [],
      };
    }),
    isBackendAvailable: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Create a mock results manager
 */
function createMockResultsManager(): IResultsManager {
  return {
    processResult: vi.fn().mockResolvedValue({}),
    getHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock concurrency manager that executes immediately
 */
function createMockConcurrencyManager(): IConcurrencyManager {
  return {
    submit: vi.fn().mockImplementation(
      async (request: AnalysisRequest, executor: AnalysisExecutor) => {
        return executor(request);
      }
    ),
    getActiveCount: vi.fn().mockReturnValue(0),
    getQueuedCount: vi.fn().mockReturnValue(0),
    canAccept: vi.fn().mockReturnValue(true),
    cancelAll: vi.fn(),
  };
}

/**
 * Create a mock offline queue manager
 */
function createMockOfflineQueueManager(): IOfflineQueueManager {
  return {
    submitCloudRequest: vi.fn().mockImplementation(
      async (request: AnalysisRequest, executor: CloudRequestExecutor) => {
        return executor(request);
      }
    ),
    getNetworkState: vi.fn().mockReturnValue("online"),
    getQueuedCount: vi.fn().mockReturnValue(0),
    isOnline: vi.fn().mockReturnValue(true),
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    setStatusBarCallback: vi.fn(),
    clearQueue: vi.fn(),
    dispose: vi.fn(),
  };
}

/**
 * Create a mock config manager with valid settings
 */
function createMockConfigManager(): MultimodalConfigManager {
  const manager = new MultimodalConfigManager();
  vi.spyOn(manager, "getConfig").mockReturnValue({
    inferenceMode: "local",
    cloudEndpointUrl: "",
    localEnginePath: "/usr/bin/analyzer",
    modelId: "test-model",
    maxImageSizeMB: 25,
    confidenceThreshold: 50,
    localOnlyMode: false,
    encryptAnalysisStorage: false,
    userConsentGiven: true,
    telemetryEnabled: false,
    telemetryEndpoint: "",
    maxConcurrentAnalyses: 10,
    queueLimit: 5,
  });
  vi.spyOn(manager, "canInitiateAnalysis").mockReturnValue(true);
  vi.spyOn(manager, "getBlockingErrors").mockReturnValue([]);
  return manager;
}

/**
 * Create a mock consent manager that allows all requests
 */
function createMockConsentManager(): ConsentManager {
  const manager = new ConsentManager();
  vi.spyOn(manager, "checkExternalRequestAllowed").mockReturnValue({ allowed: true });
  return manager;
}

/**
 * Create a mock event bus
 */
function createMockEventBus(): MultimodalEventBus {
  const bus = new MultimodalEventBus();
  vi.spyOn(bus, "emitAnalysisStarted").mockResolvedValue(undefined);
  vi.spyOn(bus, "emitAnalysisProgress").mockResolvedValue(undefined);
  vi.spyOn(bus, "emitAnalysisCompleted").mockResolvedValue(undefined);
  vi.spyOn(bus, "emitAnalysisFailed").mockResolvedValue(undefined);
  return bus;
}

describe("ImageAnalyzer Property Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Feature: multimodal-input, Property 3: Analysis Initiation Latency", () => {
    /**
     * **Validates: Requirements REQ-1.2**
     * 
     * For any valid image file, when the "Analyze Image" command is invoked,
     * the system SHALL begin analysis (emit start event) within 500 milliseconds.
     */
    it("should emit analysis start event within 500ms of command invocation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<SupportedMimeType>("image/png", "image/jpeg", "image/webp", "image/gif"),
          fc.integer({ min: 100, max: 10000 }),
          fc.uuid(),
          async (mimeType, fileSize, uniqueId) => {
            const ext = mimeType.split("/")[1];
            const filename = `latency-test-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, fileSize, filename);

            // Track when start event is emitted
            let startEventTime: number | null = null;
            const startEvents: AnalysisStartEvent[] = [];

            // Create analyzer with mocks
            const analyzer = new ImageAnalyzer({
              workspaceRoot: testDir,
              imageValidator: createMockValidator(mimeType, fileSize),
              analysisRouter: createMockRouter(100), // 100ms analysis time
              resultsManager: createMockResultsManager(),
              configManager: createMockConfigManager(),
              consentManager: createMockConsentManager(),
              concurrencyManager: createMockConcurrencyManager(),
              offlineQueueManager: createMockOfflineQueueManager(),
              pluginLoader: new PluginLoader(),
              presetManager: new PresetManager(testDir),
              telemetryService: new TelemetryService(),
              eventBus: createMockEventBus(),
            });

            // Subscribe to start event
            analyzer.onAnalysisStart((event) => {
              startEventTime = Date.now();
              startEvents.push(event);
            });

            try {
              // Record command invocation time
              const commandInvocationTime = Date.now();

              // Start analysis (don't await yet)
              const analysisPromise = analyzer.analyzeImage(filePath);

              // Advance timers to allow async operations
              await vi.advanceTimersByTimeAsync(50);

              // Property: Start event should be emitted within 500ms
              expect(startEventTime).not.toBeNull();
              const latency = startEventTime! - commandInvocationTime;
              expect(latency).toBeLessThanOrEqual(MAX_ANALYSIS_START_LATENCY_MS);

              // Property: Start event should contain correct data
              expect(startEvents.length).toBeGreaterThanOrEqual(1);
              expect(startEvents[0].imagePath).toBe(filePath);
              expect(startEvents[0].modelId).toBeDefined();
              expect(startEvents[0].timestamp).toBeGreaterThan(0);

              // Complete the analysis
              await vi.advanceTimersByTimeAsync(200);
              await analysisPromise;
            } finally {
              analyzer.dispose();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should record analysis start time accessible via getLastAnalysisStartTime", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<SupportedMimeType>("image/png", "image/jpeg"),
          fc.integer({ min: 100, max: 5000 }),
          fc.uuid(),
          async (mimeType, fileSize, uniqueId) => {
            const ext = mimeType.split("/")[1];
            const filename = `start-time-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, fileSize, filename);

            const analyzer = new ImageAnalyzer({
              workspaceRoot: testDir,
              imageValidator: createMockValidator(mimeType, fileSize),
              analysisRouter: createMockRouter(50),
              resultsManager: createMockResultsManager(),
              configManager: createMockConfigManager(),
              consentManager: createMockConsentManager(),
              concurrencyManager: createMockConcurrencyManager(),
              offlineQueueManager: createMockOfflineQueueManager(),
              pluginLoader: new PluginLoader(),
              presetManager: new PresetManager(testDir),
              telemetryService: new TelemetryService(),
              eventBus: createMockEventBus(),
            });

            try {
              // Before analysis, start time should be null
              expect(analyzer.getLastAnalysisStartTime()).toBeNull();

              const beforeTime = Date.now();
              const analysisPromise = analyzer.analyzeImage(filePath);
              
              await vi.advanceTimersByTimeAsync(10);
              
              // Property: Start time should be recorded and within expected range
              const startTime = analyzer.getLastAnalysisStartTime();
              expect(startTime).not.toBeNull();
              expect(startTime).toBeGreaterThanOrEqual(beforeTime);
              expect(startTime! - beforeTime).toBeLessThanOrEqual(MAX_ANALYSIS_START_LATENCY_MS);

              await vi.advanceTimersByTimeAsync(100);
              await analysisPromise;
            } finally {
              analyzer.dispose();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Feature: multimodal-input, Property 4: Progress Update Frequency", () => {
    /**
     * **Validates: Requirements REQ-1.3**
     * 
     * For any analysis execution lasting longer than 500 milliseconds,
     * the system SHALL emit progress updates at intervals no greater than 500 milliseconds.
     */
    it("should emit progress updates at intervals no greater than 500ms during long analysis", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<SupportedMimeType>("image/png", "image/jpeg", "image/webp", "image/gif"),
          fc.integer({ min: 100, max: 5000 }),
          // Analysis duration between 1-3 seconds to ensure multiple progress updates
          fc.integer({ min: 1000, max: 3000 }),
          fc.uuid(),
          async (mimeType, fileSize, analysisDuration, uniqueId) => {
            const ext = mimeType.split("/")[1];
            const filename = `progress-test-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, fileSize, filename);

            const progressEvents: ProgressUpdateEvent[] = [];

            const analyzer = new ImageAnalyzer({
              workspaceRoot: testDir,
              imageValidator: createMockValidator(mimeType, fileSize),
              analysisRouter: createMockRouter(analysisDuration),
              resultsManager: createMockResultsManager(),
              configManager: createMockConfigManager(),
              consentManager: createMockConsentManager(),
              concurrencyManager: createMockConcurrencyManager(),
              offlineQueueManager: createMockOfflineQueueManager(),
              pluginLoader: new PluginLoader(),
              presetManager: new PresetManager(testDir),
              telemetryService: new TelemetryService(),
              eventBus: createMockEventBus(),
            });

            // Subscribe to progress events
            analyzer.onProgressUpdate((event) => {
              progressEvents.push(event);
            });

            try {
              const analysisPromise = analyzer.analyzeImage(filePath);

              // Advance time in small increments to capture progress events
              const totalTime = analysisDuration + 500; // Extra buffer
              for (let elapsed = 0; elapsed < totalTime; elapsed += 100) {
                await vi.advanceTimersByTimeAsync(100);
              }

              await analysisPromise;

              // Property: For analysis > 500ms, should have at least one progress update
              if (analysisDuration > PROGRESS_UPDATE_INTERVAL_MS) {
                expect(progressEvents.length).toBeGreaterThan(0);

                // Property: Progress updates should occur at intervals <= 500ms
                for (let i = 1; i < progressEvents.length; i++) {
                  const interval = progressEvents[i].timestamp - progressEvents[i - 1].timestamp;
                  // Allow some tolerance for timing variations
                  expect(interval).toBeLessThanOrEqual(PROGRESS_UPDATE_INTERVAL_MS + 100);
                }

                // Property: Progress events should contain valid data
                for (const event of progressEvents) {
                  expect(event.imagePath).toBe(filePath);
                  expect(event.progress).toBeGreaterThanOrEqual(0);
                  expect(event.progress).toBeLessThanOrEqual(100);
                  expect(event.timestamp).toBeGreaterThan(0);
                }
              }
            } finally {
              analyzer.dispose();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should track progress update timestamps accessible via getProgressUpdateTimestamps", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<SupportedMimeType>("image/png", "image/jpeg"),
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 1500, max: 2500 }), // 1.5-2.5 seconds
          fc.uuid(),
          async (mimeType, fileSize, analysisDuration, uniqueId) => {
            const ext = mimeType.split("/")[1];
            const filename = `timestamps-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, fileSize, filename);

            const analyzer = new ImageAnalyzer({
              workspaceRoot: testDir,
              imageValidator: createMockValidator(mimeType, fileSize),
              analysisRouter: createMockRouter(analysisDuration),
              resultsManager: createMockResultsManager(),
              configManager: createMockConfigManager(),
              consentManager: createMockConsentManager(),
              concurrencyManager: createMockConcurrencyManager(),
              offlineQueueManager: createMockOfflineQueueManager(),
              pluginLoader: new PluginLoader(),
              presetManager: new PresetManager(testDir),
              telemetryService: new TelemetryService(),
              eventBus: createMockEventBus(),
            });

            try {
              // Before analysis, timestamps should be empty
              expect(analyzer.getProgressUpdateTimestamps()).toHaveLength(0);

              const analysisPromise = analyzer.analyzeImage(filePath);

              // Advance time to allow progress updates
              for (let elapsed = 0; elapsed < analysisDuration + 500; elapsed += 100) {
                await vi.advanceTimersByTimeAsync(100);
              }

              await analysisPromise;

              const timestamps = analyzer.getProgressUpdateTimestamps();

              // Property: Should have recorded timestamps for progress updates
              expect(timestamps.length).toBeGreaterThan(0);

              // Property: Timestamps should be in ascending order
              for (let i = 1; i < timestamps.length; i++) {
                expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
              }

              // Property: Intervals between timestamps should be approximately 500ms
              for (let i = 1; i < timestamps.length; i++) {
                const interval = timestamps[i] - timestamps[i - 1];
                // Allow tolerance for timing variations
                expect(interval).toBeLessThanOrEqual(PROGRESS_UPDATE_INTERVAL_MS + 100);
              }
            } finally {
              analyzer.dispose();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should update status bar progress indicator every 500ms", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<SupportedMimeType>("image/png"),
          fc.integer({ min: 100, max: 1000 }),
          fc.integer({ min: 2000, max: 3000 }),
          fc.uuid(),
          async (mimeType, fileSize, analysisDuration, uniqueId) => {
            const filename = `statusbar-${uniqueId}.png`;
            const filePath = createTestImage(mimeType, fileSize, filename);

            const progressEvents: ProgressUpdateEvent[] = [];

            const analyzer = new ImageAnalyzer({
              workspaceRoot: testDir,
              imageValidator: createMockValidator(mimeType, fileSize),
              analysisRouter: createMockRouter(analysisDuration),
              resultsManager: createMockResultsManager(),
              configManager: createMockConfigManager(),
              consentManager: createMockConsentManager(),
              concurrencyManager: createMockConcurrencyManager(),
              offlineQueueManager: createMockOfflineQueueManager(),
              pluginLoader: new PluginLoader(),
              presetManager: new PresetManager(testDir),
              telemetryService: new TelemetryService(),
              eventBus: createMockEventBus(),
            });

            analyzer.onProgressUpdate((event) => {
              progressEvents.push(event);
            });

            try {
              const analysisPromise = analyzer.analyzeImage(filePath);

              // Advance time
              for (let elapsed = 0; elapsed < analysisDuration + 500; elapsed += 100) {
                await vi.advanceTimersByTimeAsync(100);
              }

              await analysisPromise;

              // Property: Progress should increase over time
              if (progressEvents.length > 1) {
                for (let i = 1; i < progressEvents.length; i++) {
                  expect(progressEvents[i].progress).toBeGreaterThanOrEqual(
                    progressEvents[i - 1].progress
                  );
                }
              }

              // Property: Expected number of progress updates based on duration
              const expectedMinUpdates = Math.floor(analysisDuration / PROGRESS_UPDATE_INTERVAL_MS);
              // Allow some tolerance
              expect(progressEvents.length).toBeGreaterThanOrEqual(expectedMinUpdates - 1);
            } finally {
              analyzer.dispose();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
