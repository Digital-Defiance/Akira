/**
 * Property-Based Tests for Multimodal Configuration Manager
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the MultimodalConfigManager component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  MultimodalConfigManager,
  MIN_MAX_IMAGE_SIZE_MB,
  MAX_MAX_IMAGE_SIZE_MB,
  MIN_CONFIDENCE_THRESHOLD,
  MAX_CONFIDENCE_THRESHOLD,
  __setVSCodeForTesting,
} from "./config-manager";

describe("MultimodalConfigManager Property Tests", () => {
  let configManager: MultimodalConfigManager;

  beforeEach(() => {
    // Reset vscode mock to undefined for pure unit testing
    __setVSCodeForTesting(undefined);
    configManager = new MultimodalConfigManager();
  });

  afterEach(() => {
    configManager.dispose();
  });

  describe("Feature: multimodal-input, Property 11: Settings Validation Boundaries", () => {
    /**
     * **Validates: Requirements REQ-4.2**
     * 
     * For any maximum image size setting value, the system SHALL reject values 
     * below 0.5 MB or above 100 MB with a validation error.
     */
    describe("maxImageSizeMB validation", () => {
      it("should reject values below minimum (0.5 MB)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate values below the minimum (0 to just under 0.5)
            fc.double({ min: -1000, max: MIN_MAX_IMAGE_SIZE_MB - 0.001, noNaN: true }),
            async (invalidValue) => {
              const error = configManager.validateMaxImageSizeMB(invalidValue);
              
              // Property: values below 0.5 should be rejected
              expect(error).toBeDefined();
              expect(error?.setting).toBe("maxImageSizeMB");
              expect(error?.value).toBe(invalidValue);
              expect(error?.validRange).toEqual({
                min: MIN_MAX_IMAGE_SIZE_MB,
                max: MAX_MAX_IMAGE_SIZE_MB,
              });
              expect(error?.message).toContain(String(MIN_MAX_IMAGE_SIZE_MB));
              expect(error?.message).toContain(String(MAX_MAX_IMAGE_SIZE_MB));
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should reject values above maximum (100 MB)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate values above the maximum
            fc.double({ min: MAX_MAX_IMAGE_SIZE_MB + 0.001, max: 10000, noNaN: true }),
            async (invalidValue) => {
              const error = configManager.validateMaxImageSizeMB(invalidValue);
              
              // Property: values above 100 should be rejected
              expect(error).toBeDefined();
              expect(error?.setting).toBe("maxImageSizeMB");
              expect(error?.value).toBe(invalidValue);
              expect(error?.validRange).toEqual({
                min: MIN_MAX_IMAGE_SIZE_MB,
                max: MAX_MAX_IMAGE_SIZE_MB,
              });
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should accept values within valid range (0.5-100 MB)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate values within the valid range
            fc.double({ min: MIN_MAX_IMAGE_SIZE_MB, max: MAX_MAX_IMAGE_SIZE_MB, noNaN: true }),
            async (validValue) => {
              const error = configManager.validateMaxImageSizeMB(validValue);
              
              // Property: values within range should be accepted
              expect(error).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should accept boundary values exactly at 0.5 and 100 MB", () => {
        // Test exact boundary values
        expect(configManager.validateMaxImageSizeMB(MIN_MAX_IMAGE_SIZE_MB)).toBeUndefined();
        expect(configManager.validateMaxImageSizeMB(MAX_MAX_IMAGE_SIZE_MB)).toBeUndefined();
      });
    });

    describe("confidenceThreshold validation", () => {
      it("should reject values below minimum (0%)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate negative values
            fc.double({ min: -1000, max: MIN_CONFIDENCE_THRESHOLD - 0.001, noNaN: true }),
            async (invalidValue) => {
              const error = configManager.validateConfidenceThreshold(invalidValue);
              
              // Property: values below 0 should be rejected
              expect(error).toBeDefined();
              expect(error?.setting).toBe("confidenceThreshold");
              expect(error?.value).toBe(invalidValue);
              expect(error?.validRange).toEqual({
                min: MIN_CONFIDENCE_THRESHOLD,
                max: MAX_CONFIDENCE_THRESHOLD,
              });
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should reject values above maximum (100%)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate values above 100
            fc.double({ min: MAX_CONFIDENCE_THRESHOLD + 0.001, max: 10000, noNaN: true }),
            async (invalidValue) => {
              const error = configManager.validateConfidenceThreshold(invalidValue);
              
              // Property: values above 100 should be rejected
              expect(error).toBeDefined();
              expect(error?.setting).toBe("confidenceThreshold");
              expect(error?.value).toBe(invalidValue);
              expect(error?.validRange).toEqual({
                min: MIN_CONFIDENCE_THRESHOLD,
                max: MAX_CONFIDENCE_THRESHOLD,
              });
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should accept values within valid range (0-100%)", async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate values within the valid range
            fc.double({ min: MIN_CONFIDENCE_THRESHOLD, max: MAX_CONFIDENCE_THRESHOLD, noNaN: true }),
            async (validValue) => {
              const error = configManager.validateConfidenceThreshold(validValue);
              
              // Property: values within range should be accepted
              expect(error).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      });

      it("should accept boundary values exactly at 0 and 100%", () => {
        // Test exact boundary values
        expect(configManager.validateConfidenceThreshold(MIN_CONFIDENCE_THRESHOLD)).toBeUndefined();
        expect(configManager.validateConfidenceThreshold(MAX_CONFIDENCE_THRESHOLD)).toBeUndefined();
      });
    });

    describe("NaN and non-numeric validation", () => {
      it("should reject NaN values for maxImageSizeMB", () => {
        const error = configManager.validateMaxImageSizeMB(NaN);
        expect(error).toBeDefined();
        expect(error?.setting).toBe("maxImageSizeMB");
      });

      it("should reject NaN values for confidenceThreshold", () => {
        const error = configManager.validateConfidenceThreshold(NaN);
        expect(error).toBeDefined();
        expect(error?.setting).toBe("confidenceThreshold");
      });
    });
  });

  describe("Feature: multimodal-input, Property 12: Analysis Blocking on Invalid Settings", () => {
    /**
     * **Validates: Requirements REQ-4.3**
     * 
     * For any workspace with invalid settings values, the system SHALL prevent 
     * new analysis requests from being initiated until settings are corrected.
     */
    it("should block analysis when maxImageSizeMB is invalid", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Below minimum
            fc.double({ min: -1000, max: MIN_MAX_IMAGE_SIZE_MB - 0.001, noNaN: true }),
            // Above maximum
            fc.double({ min: MAX_MAX_IMAGE_SIZE_MB + 0.001, max: 10000, noNaN: true })
          ),
          async (invalidMaxSize) => {
            // Create a mock vscode configuration with invalid maxImageSizeMB
            const mockConfig = {
              get: <T>(key: string, defaultValue: T): T => {
                if (key === "maxImageSizeMB") {
                  return invalidMaxSize as T;
                }
                // Return valid defaults for other settings
                if (key === "confidenceThreshold") {
                  return 50 as T;
                }
                return defaultValue;
              },
            };

            const mockVscode = {
              workspace: {
                getConfiguration: () => mockConfig,
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
              },
            };

            __setVSCodeForTesting(mockVscode);
            const testManager = new MultimodalConfigManager();

            try {
              // Property: analysis should be blocked with invalid settings
              expect(testManager.canInitiateAnalysis()).toBe(false);
              expect(testManager.hasInvalidSettings()).toBe(true);
              
              const errors = testManager.getBlockingErrors();
              expect(errors.length).toBeGreaterThan(0);
              expect(errors.some(e => e.setting === "maxImageSizeMB")).toBe(true);
            } finally {
              testManager.dispose();
              __setVSCodeForTesting(undefined);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should block analysis when confidenceThreshold is invalid", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Below minimum
            fc.double({ min: -1000, max: MIN_CONFIDENCE_THRESHOLD - 0.001, noNaN: true }),
            // Above maximum
            fc.double({ min: MAX_CONFIDENCE_THRESHOLD + 0.001, max: 10000, noNaN: true })
          ),
          async (invalidThreshold) => {
            // Create a mock vscode configuration with invalid confidenceThreshold
            const mockConfig = {
              get: <T>(key: string, defaultValue: T): T => {
                if (key === "confidenceThreshold") {
                  return invalidThreshold as T;
                }
                // Return valid defaults for other settings
                if (key === "maxImageSizeMB") {
                  return 25 as T;
                }
                return defaultValue;
              },
            };

            const mockVscode = {
              workspace: {
                getConfiguration: () => mockConfig,
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
              },
            };

            __setVSCodeForTesting(mockVscode);
            const testManager = new MultimodalConfigManager();

            try {
              // Property: analysis should be blocked with invalid settings
              expect(testManager.canInitiateAnalysis()).toBe(false);
              expect(testManager.hasInvalidSettings()).toBe(true);
              
              const errors = testManager.getBlockingErrors();
              expect(errors.length).toBeGreaterThan(0);
              expect(errors.some(e => e.setting === "confidenceThreshold")).toBe(true);
            } finally {
              testManager.dispose();
              __setVSCodeForTesting(undefined);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should allow analysis when all settings are valid", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: MIN_MAX_IMAGE_SIZE_MB, max: MAX_MAX_IMAGE_SIZE_MB, noNaN: true }),
          fc.double({ min: MIN_CONFIDENCE_THRESHOLD, max: MAX_CONFIDENCE_THRESHOLD, noNaN: true }),
          async (validMaxSize, validThreshold) => {
            // Create a mock vscode configuration with valid settings
            const mockConfig = {
              get: <T>(key: string, defaultValue: T): T => {
                if (key === "maxImageSizeMB") {
                  return validMaxSize as T;
                }
                if (key === "confidenceThreshold") {
                  return validThreshold as T;
                }
                return defaultValue;
              },
            };

            const mockVscode = {
              workspace: {
                getConfiguration: () => mockConfig,
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
              },
            };

            __setVSCodeForTesting(mockVscode);
            const testManager = new MultimodalConfigManager();

            try {
              // Property: analysis should be allowed with valid settings
              expect(testManager.canInitiateAnalysis()).toBe(true);
              expect(testManager.hasInvalidSettings()).toBe(false);
              expect(testManager.getBlockingErrors()).toHaveLength(0);
            } finally {
              testManager.dispose();
              __setVSCodeForTesting(undefined);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should block analysis when multiple settings are invalid", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.double({ min: -1000, max: MIN_MAX_IMAGE_SIZE_MB - 0.001, noNaN: true }),
            fc.double({ min: MAX_MAX_IMAGE_SIZE_MB + 0.001, max: 10000, noNaN: true })
          ),
          fc.oneof(
            fc.double({ min: -1000, max: MIN_CONFIDENCE_THRESHOLD - 0.001, noNaN: true }),
            fc.double({ min: MAX_CONFIDENCE_THRESHOLD + 0.001, max: 10000, noNaN: true })
          ),
          async (invalidMaxSize, invalidThreshold) => {
            // Create a mock vscode configuration with multiple invalid settings
            const mockConfig = {
              get: <T>(key: string, defaultValue: T): T => {
                if (key === "maxImageSizeMB") {
                  return invalidMaxSize as T;
                }
                if (key === "confidenceThreshold") {
                  return invalidThreshold as T;
                }
                return defaultValue;
              },
            };

            const mockVscode = {
              workspace: {
                getConfiguration: () => mockConfig,
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
              },
            };

            __setVSCodeForTesting(mockVscode);
            const testManager = new MultimodalConfigManager();

            try {
              // Property: analysis should be blocked with multiple invalid settings
              expect(testManager.canInitiateAnalysis()).toBe(false);
              expect(testManager.hasInvalidSettings()).toBe(true);
              
              const errors = testManager.getBlockingErrors();
              expect(errors.length).toBe(2);
              expect(errors.some(e => e.setting === "maxImageSizeMB")).toBe(true);
              expect(errors.some(e => e.setting === "confidenceThreshold")).toBe(true);
            } finally {
              testManager.dispose();
              __setVSCodeForTesting(undefined);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
