/**
 * Property-Based Tests for Telemetry Service
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the TelemetryService component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as https from "https";
import { EventEmitter } from "events";
import { TelemetryService, TelemetryEvent } from "./telemetry-service";
import { AnalysisResult, InferenceMode, BoundingBox } from "./types";

// Mock https module
vi.mock("https", () => ({
  request: vi.fn(),
}));

/**
 * Helper to create a mock HTTPS request object
 */
function createMockRequest() {
  const request = new EventEmitter() as EventEmitter & {
    write: (data: string) => void;
    end: () => void;
    destroy: () => void;
  };
  request.write = vi.fn();
  request.end = vi.fn();
  request.destroy = vi.fn();
  return request;
}

/**
 * Helper to create a mock HTTPS response
 */
function createMockResponse(statusCode: number) {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = statusCode;
  
  return {
    response,
    emitEnd: () => {
      response.emit("end");
    },
  };
}

/**
 * Generator for optional bounding box that returns undefined instead of null
 */
const boundingBoxArb: fc.Arbitrary<BoundingBox | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({
    x: fc.integer({ min: 0, max: 10000 }),
    y: fc.integer({ min: 0, max: 10000 }),
    width: fc.integer({ min: 1, max: 10000 }),
    height: fc.integer({ min: 1, max: 10000 }),
  })
);

/**
 * Generator for valid AnalysisResult objects
 */
const analysisResultArb: fc.Arbitrary<AnalysisResult> = fc.record({
  id: fc.uuid(),
  imagePath: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: fc.date().map((d) => d.toISOString()),
  modelId: fc.string({ minLength: 1, maxLength: 50 }),
  inferenceMode: fc.constantFrom("local", "cloud") as fc.Arbitrary<InferenceMode>,
  duration: fc.integer({ min: 0, max: 60000 }),
  labels: fc.array(
    fc.record({
      label: fc.string({ minLength: 1, maxLength: 50 }),
      confidence: fc.float({ min: 0, max: 1 }),
      boundingBox: boundingBoxArb,
    }),
    { minLength: 0, maxLength: 10 }
  ),
  ocrText: fc.oneof(fc.constant(undefined), fc.string({ maxLength: 1000 })),
});

/**
 * Generator for payload sizes in bytes
 */
const payloadSizeArb = fc.integer({ min: 0, max: 100 * 1024 * 1024 }); // 0 to 100MB

describe("TelemetryService Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Feature: multimodal-input, Property 20: Telemetry Event Content", () => {
    /**
     * **Validates: Requirements REQ-8.1**
     * 
     * For any completed analysis when telemetry is enabled, the emitted telemetry 
     * event SHALL contain anonymized payload size, model id, inference mode, and duration.
     */
    it("should include all required fields in telemetry event", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          async (result, payloadSize) => {
            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 1,
                backoffMs: [],
                retryableErrors: [],
              },
            });

            // Create the telemetry event
            const event = service.createTelemetryEvent(result, payloadSize);

            // Property 1: Event must have eventId
            expect(event.eventId).toBeDefined();
            expect(typeof event.eventId).toBe("string");
            expect(event.eventId.length).toBeGreaterThan(0);

            // Property 2: Event must have eventType
            expect(event.eventType).toBe("analysis_completed");

            // Property 3: Event must have timestamp
            expect(event.timestamp).toBeDefined();
            expect(typeof event.timestamp).toBe("string");
            // Verify it's a valid ISO timestamp
            expect(() => new Date(event.timestamp)).not.toThrow();

            // Property 4: Event must have anonymized payload size
            expect(event.payloadSizeBytes).toBeDefined();
            expect(typeof event.payloadSizeBytes).toBe("number");
            expect(event.payloadSizeBytes).toBeGreaterThanOrEqual(0);

            // Property 5: Event must have model id from result
            expect(event.modelId).toBe(result.modelId);

            // Property 6: Event must have inference mode from result
            expect(event.inferenceMode).toBe(result.inferenceMode);

            // Property 7: Event must have duration from result
            expect(event.durationMs).toBe(result.duration);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should anonymize payload size by rounding to nearest KB", async () => {
      await fc.assert(
        fc.asyncProperty(
          payloadSizeArb,
          async (payloadSize) => {
            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
            });

            const anonymized = service.anonymizePayloadSize(payloadSize);

            // Property: Anonymized size should be a multiple of 1024 (1 KB)
            expect(anonymized % 1024).toBe(0);

            // Property: Anonymized size should be within 512 bytes of original
            // (since we round to nearest KB)
            const difference = Math.abs(anonymized - payloadSize);
            expect(difference).toBeLessThanOrEqual(512);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should send telemetry event via HTTPS when enabled", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          async (result, payloadSize) => {
            const mockRequest = createMockRequest();
            let capturedBody: string | null = null;

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 1,
                backoffMs: [],
                retryableErrors: [],
              },
            });

            vi.mocked(https.request).mockImplementation((_options: unknown, callback: unknown) => {
              const { response, emitEnd } = createMockResponse(200);
              if (callback && typeof callback === "function") {
                (callback as (res: unknown) => void)(response);
              }
              setTimeout(emitEnd, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            mockRequest.write = (body: string) => {
              capturedBody = body;
            };

            await service.emitAnalysisCompleted(result, payloadSize);

            // Property: Request should have been made
            expect(https.request).toHaveBeenCalled();

            // Property: Body should be valid JSON with required fields
            expect(capturedBody).not.toBeNull();
            const parsedEvent = JSON.parse(capturedBody!) as TelemetryEvent;
            
            expect(parsedEvent.modelId).toBe(result.modelId);
            expect(parsedEvent.inferenceMode).toBe(result.inferenceMode);
            expect(parsedEvent.durationMs).toBe(result.duration);
            expect(parsedEvent.eventType).toBe("analysis_completed");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not send telemetry when disabled", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          async (result, payloadSize) => {
            const service = new TelemetryService({
              enabled: false,
              endpointUrl: "https://telemetry.example.com/events",
            });

            const submissionResult = await service.emitAnalysisCompleted(result, payloadSize);

            // Property: No request should be made when disabled
            expect(https.request).not.toHaveBeenCalled();
            
            // Property: Result should indicate telemetry was not sent
            expect(submissionResult.success).toBe(false);
            expect(submissionResult.attempts).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Feature: multimodal-input, Property 22: Telemetry Retry Non-Blocking", () => {
    /**
     * **Validates: Requirements REQ-8.3**
     * 
     * For any telemetry submission that fails, the system SHALL retry up to 3 times 
     * asynchronously without blocking the display of analysis results.
     */
    it("should retry up to 3 times on failure and then drop the record", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          // Generate random 5xx status codes
          fc.integer({ min: 500, max: 599 }),
          async (result, payloadSize, statusCode) => {
            const mockRequest = createMockRequest();
            let callCount = 0;

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 4, // Initial + 3 retries
                backoffMs: [10, 20, 40], // Short delays for testing
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options: unknown, callback: unknown) => {
              callCount++;
              const { response, emitEnd } = createMockResponse(statusCode);
              if (callback && typeof callback === "function") {
                (callback as (res: unknown) => void)(response);
              }
              setTimeout(emitEnd, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            const submissionResult = await service.emitAnalysisCompleted(result, payloadSize);

            // Property 1: Should make exactly 4 attempts (initial + 3 retries)
            expect(callCount).toBe(4);

            // Property 2: Should indicate failure
            expect(submissionResult.success).toBe(false);

            // Property 3: Should indicate record was dropped
            expect(submissionResult.dropped).toBe(true);

            // Property 4: Should report correct number of attempts
            expect(submissionResult.attempts).toBe(4);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should succeed without exhausting retries when server recovers", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          // Number of failures before success (0-3)
          fc.integer({ min: 0, max: 3 }),
          async (result, payloadSize, failuresBeforeSuccess) => {
            const mockRequest = createMockRequest();
            let callCount = 0;

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 4,
                backoffMs: [10, 20, 40],
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options: unknown, callback: unknown) => {
              callCount++;
              // Return 500 for first N calls, then 200
              const statusCode = callCount <= failuresBeforeSuccess ? 500 : 200;
              const { response, emitEnd } = createMockResponse(statusCode);
              if (callback && typeof callback === "function") {
                (callback as (res: unknown) => void)(response);
              }
              setTimeout(emitEnd, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            const submissionResult = await service.emitAnalysisCompleted(result, payloadSize);

            // Property: Should succeed after failuresBeforeSuccess + 1 attempts
            expect(callCount).toBe(failuresBeforeSuccess + 1);
            expect(submissionResult.success).toBe(true);
            expect(submissionResult.dropped).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not block and return quickly even during retries", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          async (result, payloadSize) => {
            const mockRequest = createMockRequest();

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 4,
                backoffMs: [10, 20, 40], // Total max wait: 70ms
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options: unknown, callback: unknown) => {
              const { response, emitEnd } = createMockResponse(500);
              if (callback && typeof callback === "function") {
                (callback as (res: unknown) => void)(response);
              }
              setTimeout(emitEnd, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            const startTime = Date.now();
            await service.emitAnalysisCompleted(result, payloadSize);
            const elapsed = Date.now() - startTime;

            // Property: Total time should be reasonable (backoffs + small overhead)
            // With backoffs of 10+20+40=70ms, allow up to 200ms for overhead
            expect(elapsed).toBeLessThan(500);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should drop record on 4xx client errors without retry", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          // Generate random 4xx status codes
          fc.integer({ min: 400, max: 499 }),
          async (result, payloadSize, statusCode) => {
            const mockRequest = createMockRequest();
            let callCount = 0;

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 4,
                backoffMs: [10, 20, 40],
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options: unknown, callback: unknown) => {
              callCount++;
              const { response, emitEnd } = createMockResponse(statusCode);
              if (callback && typeof callback === "function") {
                (callback as (res: unknown) => void)(response);
              }
              setTimeout(emitEnd, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            const submissionResult = await service.emitAnalysisCompleted(result, payloadSize);

            // Property 1: Should only make 1 attempt (no retries for 4xx)
            expect(callCount).toBe(1);

            // Property 2: Should indicate failure and drop
            expect(submissionResult.success).toBe(false);
            expect(submissionResult.dropped).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should never throw exceptions to caller", async () => {
      await fc.assert(
        fc.asyncProperty(
          analysisResultArb,
          payloadSizeArb,
          async (result, payloadSize) => {
            const mockRequest = createMockRequest();

            const service = new TelemetryService({
              enabled: true,
              endpointUrl: "https://telemetry.example.com/events",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 1,
                backoffMs: [],
                retryableErrors: [],
              },
            });

            // Simulate network error
            vi.mocked(https.request).mockImplementation(() => {
              setTimeout(() => {
                mockRequest.emit("error", new Error("Network failure"));
              }, 1);
              return mockRequest as ReturnType<typeof https.request>;
            });

            // Property: Should never throw, always return a result
            let threwException = false;
            try {
              const submissionResult = await service.emitAnalysisCompleted(result, payloadSize);
              // Should get a result indicating failure
              expect(submissionResult.success).toBe(false);
            } catch {
              threwException = true;
            }

            expect(threwException).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
