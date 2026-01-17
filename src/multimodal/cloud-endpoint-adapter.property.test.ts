/**
 * Property-Based Tests for Cloud Endpoint Adapter
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the CloudEndpointAdapter component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as https from "https";
import { EventEmitter } from "events";
import { CloudEndpointAdapter } from "./cloud-endpoint-adapter";

// Mock https module
vi.mock("https", () => ({
  request: vi.fn(),
}));

/**
 * Helper to create a mock HTTPS request object
 */
function createMockRequest() {
  const request = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  request.write = vi.fn();
  request.end = vi.fn();
  request.destroy = vi.fn();
  return request;
}

/**
 * Helper to create a mock HTTPS response
 */
function createMockResponse(statusCode: number, body: string) {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = statusCode;
  
  return {
    response,
    emitData: () => {
      response.emit("data", Buffer.from(body));
      response.emit("end");
    },
  };
}

describe("CloudEndpointAdapter Property Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Feature: multimodal-input, Property 9: Cloud Endpoint Retry Behavior", () => {
    /**
     * **Validates: Requirements REQ-3.3**
     * 
     * For any cloud endpoint request that receives HTTP 5xx responses, the system 
     * SHALL retry exactly 2 times with backoff delays of 1 second then 2 seconds 
     * before reporting a persistent error.
     */
    it("should retry exactly 2 times on 5xx errors with correct backoff delays", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random 5xx status codes
          fc.integer({ min: 500, max: 599 }),
          // Generate random base64 image data
          fc.base64String({ minLength: 10, maxLength: 100 }),
          // Generate random model IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          async (statusCode, imageData, modelId) => {
            const mockRequest = createMockRequest();
            let callCount = 0;
            const callTimestamps: number[] = [];

            // Use short backoff times for testing (10ms, 20ms)
            const adapter = new CloudEndpointAdapter({
              endpointUrl: "https://api.example.com/analyze",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 3, // Initial + 2 retries
                backoffMs: [10, 20], // Short delays for testing
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options, callback) => {
              callCount++;
              callTimestamps.push(Date.now());
              
              const { response, emitData } = createMockResponse(statusCode, "Server Error");
              if (callback) callback(response as never);
              setTimeout(emitData, 1);
              return mockRequest as never;
            });

            try {
              await adapter.analyze(imageData, modelId);
              // Should not reach here - all attempts should fail
              expect.fail("Expected analyze to throw after retries");
            } catch (error) {
              // Property 1: Should make exactly 3 attempts (initial + 2 retries)
              expect(callCount).toBe(3);
              
              // Property 2: Error message should indicate all attempts exhausted
              expect((error as Error).message).toContain("after 3 attempts");
              
              // Property 3: Verify backoff delays occurred (with tolerance)
              if (callTimestamps.length >= 3) {
                const delay1 = callTimestamps[1] - callTimestamps[0];
                const delay2 = callTimestamps[2] - callTimestamps[1];
                
                // Allow some tolerance for timing (5ms)
                expect(delay1).toBeGreaterThanOrEqual(8);
                expect(delay2).toBeGreaterThanOrEqual(18);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });


    it("should succeed without retry on successful response after failures", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Number of failures before success (0-2)
          fc.integer({ min: 0, max: 2 }),
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (failuresBeforeSuccess, imageData, modelId) => {
            const mockRequest = createMockRequest();
            let callCount = 0;

            const adapter = new CloudEndpointAdapter({
              endpointUrl: "https://api.example.com/analyze",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 3,
                backoffMs: [10, 20],
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options, callback) => {
              callCount++;
              
              // Return 500 for first N calls, then 200
              const statusCode = callCount <= failuresBeforeSuccess ? 500 : 200;
              const body = statusCode === 200 
                ? JSON.stringify({ labels: [{ label: "test", confidence: 0.9 }] })
                : "Server Error";
              
              const { response, emitData } = createMockResponse(statusCode, body);
              if (callback) callback(response as never);
              setTimeout(emitData, 1);
              return mockRequest as never;
            });

            const result = await adapter.analyze(imageData, modelId);

            // Property: Should succeed after failuresBeforeSuccess + 1 attempts
            expect(callCount).toBe(failuresBeforeSuccess + 1);
            expect(result.labels).toHaveLength(1);
            expect(result.inferenceMode).toBe("cloud");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not retry on 4xx client errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random 4xx status codes
          fc.integer({ min: 400, max: 499 }),
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (statusCode, imageData, modelId) => {
            const mockRequest = createMockRequest();
            let callCount = 0;

            const adapter = new CloudEndpointAdapter({
              endpointUrl: "https://api.example.com/analyze",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 3,
                backoffMs: [10, 20],
                retryableErrors: ["ENDPOINT_ERROR_5XX", "ENDPOINT_UNREACHABLE"],
              },
            });

            vi.mocked(https.request).mockImplementation((_options, callback) => {
              callCount++;
              const { response, emitData } = createMockResponse(statusCode, "Client Error");
              if (callback) callback(response as never);
              setTimeout(emitData, 1);
              return mockRequest as never;
            });

            try {
              await adapter.analyze(imageData, modelId);
              expect.fail("Expected analyze to throw on 4xx error");
            } catch (error) {
              // Property: Should only make 1 attempt (no retries for 4xx)
              expect(callCount).toBe(1);
              expect((error as Error).message).toContain("client error");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe("Feature: multimodal-input, Property 25: Transport Security", () => {
    /**
     * **Validates: Requirements REQ-9.4**
     * 
     * For any request to external endpoints, the system SHALL use HTTPS (TLS 1.2+) 
     * and SHALL NOT include authentication tokens in query parameters.
     */
    it("should reject non-HTTPS URLs", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random hostnames
          fc.webUrl({ validSchemes: ["http"] }),
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (httpUrl, imageData, modelId) => {
            const adapter = new CloudEndpointAdapter({
              endpointUrl: httpUrl,
              timeout: 5000,
            });

            try {
              await adapter.analyze(imageData, modelId);
              expect.fail("Expected analyze to throw for HTTP URL");
            } catch (error) {
              // Property: HTTP URLs should be rejected with appropriate error
              expect((error as Error).message).toContain("HTTPS");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject URLs with authentication tokens in query parameters", async () => {
      const sensitiveParams = ["token", "api_key", "apikey", "key", "secret", "auth", "password", "access_token"];
      
      await fc.assert(
        fc.asyncProperty(
          // Generate random sensitive parameter name
          fc.constantFrom(...sensitiveParams),
          // Generate random token value
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (paramName, tokenValue, imageData, modelId) => {
            const urlWithToken = `https://api.example.com/analyze?${paramName}=${encodeURIComponent(tokenValue)}`;
            
            const adapter = new CloudEndpointAdapter({
              endpointUrl: urlWithToken,
              timeout: 5000,
            });

            try {
              await adapter.analyze(imageData, modelId);
              expect.fail("Expected analyze to throw for URL with token in query params");
            } catch (error) {
              // Property: URLs with tokens in query params should be rejected
              expect((error as Error).message).toContain("query parameters");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept HTTPS URLs without sensitive query parameters", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random non-sensitive query parameter names
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => 
            !["token", "api_key", "apikey", "key", "secret", "auth", "password", "access_token"].includes(s.toLowerCase())
          ),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (paramName, paramValue) => {
            const safeUrl = `https://api.example.com/analyze?${paramName}=${encodeURIComponent(paramValue)}`;
            
            const adapter = new CloudEndpointAdapter({
              endpointUrl: safeUrl,
              timeout: 5000,
            });

            // Property: URL validation should pass (not throw)
            expect(() => adapter.validateEndpointUrl(safeUrl)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should enforce TLS 1.2 minimum version in request options", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (imageData, modelId) => {
            const mockRequest = createMockRequest();
            let capturedOptions: https.RequestOptions | null = null;

            const adapter = new CloudEndpointAdapter({
              endpointUrl: "https://api.example.com/analyze",
              timeout: 5000,
              retryConfig: {
                maxAttempts: 1,
                backoffMs: [],
                retryableErrors: [],
              },
            });

            vi.mocked(https.request).mockImplementation((options, callback) => {
              capturedOptions = options as https.RequestOptions;
              const { response, emitData } = createMockResponse(200, JSON.stringify({ labels: [] }));
              if (callback) callback(response as never);
              setTimeout(emitData, 1);
              return mockRequest as never;
            });

            await adapter.analyze(imageData, modelId);

            // Property: Request should specify TLS 1.2 minimum
            expect(capturedOptions).not.toBeNull();
            expect(capturedOptions!.minVersion).toBe("TLSv1.2");
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
