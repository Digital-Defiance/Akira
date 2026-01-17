/**
 * Property-Based Tests for Error Handler
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the ErrorHandler component.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ErrorHandler, ModelValidationErrorResponse } from "./error-handler";

describe("ErrorHandler Property Tests", () => {
  const errorHandler = new ErrorHandler();

  describe("Feature: multimodal-input, Property 17: Model Validation Error Propagation", () => {
    /**
     * **Validates: Requirements REQ-6.2**
     * 
     * For any model validation error from the inference endpoint, the displayed error 
     * SHALL include the endpoint's error code and the model identifier from the request.
     */
    it("should include endpoint error code and model id in error message", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random error codes
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          // Generate random error messages
          fc.string({ minLength: 1, maxLength: 200 }),
          // Generate random model IDs
          fc.string({ minLength: 1, maxLength: 50 }),
          // Generate optional endpoint URLs
          fc.option(fc.webUrl({ validSchemes: ["https"] })),
          async (errorCode, errorMessage, modelId, endpointUrl) => {
            const response: ModelValidationErrorResponse = {
              errorCode,
              message: errorMessage,
              modelId: undefined, // Test that request model ID is used when response doesn't include it
            };

            const error = errorHandler.createModelValidationError(
              response,
              modelId,
              endpointUrl ?? undefined
            );

            // Property: error message SHALL include the endpoint's error code
            expect(error.message).toContain(errorCode);

            // Property: error message SHALL include the model identifier
            expect(error.message).toContain(modelId);

            // Property: error details SHALL include the model ID
            expect(error.details?.modelId).toBe(modelId);

            // Property: error should have appropriate code
            expect(error.code).toBe("ENDPOINT_ERROR_4XX");

            // Property: error should have a recovery action
            expect(error.recoveryAction).toBeDefined();
            expect(typeof error.recoveryAction).toBe("string");
            expect(error.recoveryAction!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should use response model ID when provided", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorCode, errorMessage, requestModelId, responseModelId) => {
            // Ensure they're different to test the preference
            fc.pre(requestModelId !== responseModelId);

            const response: ModelValidationErrorResponse = {
              errorCode,
              message: errorMessage,
              modelId: responseModelId, // Response includes model ID
            };

            const error = errorHandler.createModelValidationError(
              response,
              requestModelId,
              "https://api.example.com/analyze"
            );

            // Property: when response includes model ID, it should be used
            expect(error.details?.modelId).toBe(responseModelId);
            expect(error.message).toContain(responseModelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include endpoint URL in error details when provided", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.webUrl({ validSchemes: ["https"] }),
          async (errorCode, errorMessage, modelId, endpointUrl) => {
            const response: ModelValidationErrorResponse = {
              errorCode,
              message: errorMessage,
            };

            const error = errorHandler.createModelValidationError(
              response,
              modelId,
              endpointUrl
            );

            // Property: endpoint URL should be included in details
            expect(error.details?.endpointUrl).toBe(endpointUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should format errors consistently for display", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorCode, errorMessage, modelId) => {
            const response: ModelValidationErrorResponse = {
              errorCode,
              message: errorMessage,
            };

            const error = errorHandler.createModelValidationError(
              response,
              modelId,
              "https://api.example.com/analyze"
            );

            const formatted = errorHandler.formatError(error);

            // Property: formatted error should have all required fields
            expect(formatted.title).toBeDefined();
            expect(typeof formatted.title).toBe("string");
            expect(formatted.title.length).toBeGreaterThan(0);

            expect(formatted.message).toBeDefined();
            expect(formatted.message).toContain(errorCode);
            expect(formatted.message).toContain(modelId);

            expect(formatted.recoveryAction).toBeDefined();
            expect(typeof formatted.recoveryAction).toBe("string");

            expect(formatted.originalError).toBe(error);

            // Property: details should include model ID
            expect(formatted.details).toContain(`Model ID: ${modelId}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should parse model validation errors from JSON response body", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorCode, errorMessage, modelId) => {
            // Test nested error format
            const responseBody = JSON.stringify({
              error: {
                code: errorCode,
                message: errorMessage,
              },
            });

            const error = errorHandler.parseModelValidationError(
              responseBody,
              modelId,
              "https://api.example.com/analyze"
            );

            // Property: parsed error should include error code and model ID
            expect(error).not.toBeNull();
            expect(error!.message).toContain(errorCode);
            expect(error!.message).toContain(modelId);
            expect(error!.details?.modelId).toBe(modelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should parse alternative error format from JSON response body", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), { minLength: 3, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorCode, errorMessage, modelId) => {
            // Test top-level error format
            const responseBody = JSON.stringify({
              errorCode,
              message: errorMessage,
              modelId,
            });

            const error = errorHandler.parseModelValidationError(
              responseBody,
              "different-model-id",
              "https://api.example.com/analyze"
            );

            // Property: parsed error should use model ID from response when available
            expect(error).not.toBeNull();
            expect(error!.message).toContain(errorCode);
            expect(error!.message).toContain(modelId);
            expect(error!.details?.modelId).toBe(modelId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return null for non-error JSON responses", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.record({
            label: fc.string({ minLength: 1, maxLength: 20 }),
            confidence: fc.float({ min: 0, max: 1 }),
          }), { minLength: 0, maxLength: 5 }),
          async (modelId, labels) => {
            // Test successful response format (no error)
            const responseBody = JSON.stringify({
              labels,
              modelId,
            });

            const error = errorHandler.parseModelValidationError(
              responseBody,
              modelId,
              "https://api.example.com/analyze"
            );

            // Property: non-error responses should return null
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return null for invalid JSON responses", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate strings that are not valid JSON
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
            try {
              JSON.parse(s);
              return false;
            } catch {
              return true;
            }
          }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (invalidJson, modelId) => {
            const error = errorHandler.parseModelValidationError(
              invalidJson,
              modelId,
              "https://api.example.com/analyze"
            );

            // Property: invalid JSON should return null
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
