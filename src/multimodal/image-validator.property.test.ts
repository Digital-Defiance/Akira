/**
 * Property-Based Tests for Image Validator
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the ImageValidator component.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ImageValidator } from "./image-validator";
import { SUPPORTED_MIME_TYPES, SupportedMimeType } from "./types";

// Test directory for temporary files
let testDir: string;

// Magic bytes for creating test files
const MAGIC_BYTES: Record<SupportedMimeType, Buffer> = {
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  "image/gif": Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
  "image/webp": Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // file size placeholder
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]),
};

// Invalid MIME types for testing
const INVALID_MIME_TYPES = [
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "application/octet-stream",
];

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-validator-test-"));
});

afterAll(() => {
  // Clean up test directory
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
  
  // Create buffer with magic bytes + padding to reach desired size
  const paddingSize = Math.max(0, sizeBytes - magicBytes.length);
  const padding = Buffer.alloc(paddingSize, 0);
  const content = Buffer.concat([magicBytes, padding]);
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Creates a test file with invalid magic bytes
 */
function createInvalidImage(
  invalidMimeType: string,
  sizeBytes: number,
  filename: string
): string {
  const filePath = path.join(testDir, filename);
  
  // Create file with invalid magic bytes based on type
  let magicBytes: Buffer;
  switch (invalidMimeType) {
    case "image/bmp":
      magicBytes = Buffer.from([0x42, 0x4d]); // BM
      break;
    case "image/tiff":
      magicBytes = Buffer.from([0x49, 0x49, 0x2a, 0x00]); // II*\0 (little-endian TIFF)
      break;
    case "application/pdf":
      magicBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      break;
    default:
      magicBytes = Buffer.from([0x00, 0x00, 0x00, 0x00]); // Unknown
  }
  
  const paddingSize = Math.max(0, sizeBytes - magicBytes.length);
  const padding = Buffer.alloc(paddingSize, 0);
  const content = Buffer.concat([magicBytes, padding]);
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("ImageValidator Property Tests", () => {
  const validator = new ImageValidator();

  describe("Feature: multimodal-input, Property 1: MIME Type Validation", () => {
    /**
     * **Validates: Requirements REQ-1.1**
     * 
     * For any image file input, the Image Validator SHALL accept the file 
     * if and only if its MIME type is one of image/png, image/jpeg, image/webp, or image/gif.
     */
    it("should accept files with supported MIME types (png, jpeg, webp, gif)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SUPPORTED_MIME_TYPES),
          fc.integer({ min: 100, max: 1024 * 1024 }), // 100 bytes to 1MB
          fc.uuid(),
          async (mimeType, size, uniqueId) => {
            const ext = mimeType.split("/")[1];
            const filename = `valid-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, size, filename);
            
            try {
              const result = await validator.validate(filePath);
              
              // Property: valid MIME types should be accepted
              expect(result.valid).toBe(true);
              expect(result.mimeType).toBe(mimeType);
              expect(result.fileSize).toBe(size);
              expect(result.error).toBeUndefined();
            } finally {
              // Cleanup
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject files with unsupported MIME types", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...INVALID_MIME_TYPES),
          fc.integer({ min: 100, max: 1024 * 1024 }),
          fc.uuid(),
          async (invalidMimeType, size, uniqueId) => {
            const filename = `invalid-${uniqueId}.bin`;
            const filePath = createInvalidImage(invalidMimeType, size, filename);
            
            try {
              const result = await validator.validate(filePath);
              
              // Property: invalid MIME types should be rejected
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
              expect(result.error?.code).toBe("INVALID_MIME_TYPE");
            } finally {
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

  describe("Feature: multimodal-input, Property 2: File Size Validation", () => {
    /**
     * **Validates: Requirements REQ-1.4**
     * 
     * For any image file with size greater than 25 megabytes, the Image Validator 
     * SHALL reject the file and return an error containing the size limit.
     */
    it("should reject files exceeding the size limit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SUPPORTED_MIME_TYPES),
          // Generate sizes above the limit
          fc.integer({ min: 1, max: 10 }), // 1-10 KB over limit
          fc.uuid(),
          async (mimeType, kbOverLimit, uniqueId) => {
            const maxSizeMB = 0.01; // 10KB limit for testing (cleaner number)
            const maxSizeBytes = maxSizeMB * 1024 * 1024; // 10240 bytes
            const actualSize = Math.floor(maxSizeBytes) + kbOverLimit * 100;
            
            const ext = mimeType.split("/")[1];
            const filename = `large-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, actualSize, filename);
            
            try {
              const result = await validator.validate(filePath, maxSizeMB);
              
              // Property: files exceeding size limit should be rejected
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
              expect(result.error?.code).toBe("FILE_TOO_LARGE");
              expect(result.error?.maxSizeBytes).toBe(maxSizeBytes);
              expect(result.error?.actualSizeBytes).toBe(actualSize);
            } finally {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept files within the size limit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SUPPORTED_MIME_TYPES),
          fc.integer({ min: 100, max: 10000 }), // 100 bytes to 10KB
          fc.uuid(),
          async (mimeType, size, uniqueId) => {
            const maxSizeMB = 1; // 1MB limit
            
            const ext = mimeType.split("/")[1];
            const filename = `small-${uniqueId}.${ext}`;
            const filePath = createTestImage(mimeType, size, filename);
            
            try {
              const result = await validator.validate(filePath, maxSizeMB);
              
              // Property: files within size limit should be accepted
              expect(result.valid).toBe(true);
              expect(result.fileSize).toBe(size);
            } finally {
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

  describe("Feature: multimodal-input, Property 16: Invalid Format Error Message Content", () => {
    /**
     * **Validates: Requirements REQ-6.1**
     * 
     * For any image file with unsupported MIME type, the error message SHALL include 
     * the detected MIME type and the list of accepted MIME types.
     */
    it("should include detected MIME type and accepted types in error message", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...INVALID_MIME_TYPES),
          fc.integer({ min: 100, max: 10000 }),
          fc.uuid(),
          async (invalidMimeType, size, uniqueId) => {
            const filename = `error-msg-${uniqueId}.bin`;
            const filePath = createInvalidImage(invalidMimeType, size, filename);
            
            try {
              const result = await validator.validate(filePath);
              
              // Property: error must contain detected MIME type
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
              expect(result.error?.detectedMimeType).toBeDefined();
              expect(typeof result.error?.detectedMimeType).toBe("string");
              
              // Property: error must contain list of accepted MIME types
              expect(result.error?.acceptedMimeTypes).toBeDefined();
              expect(Array.isArray(result.error?.acceptedMimeTypes)).toBe(true);
              expect(result.error?.acceptedMimeTypes).toEqual(
                expect.arrayContaining([...SUPPORTED_MIME_TYPES])
              );
              
              // Property: error message should mention both detected and accepted types
              const detectedType = result.error?.detectedMimeType ?? "";
              expect(result.error?.message).toContain(detectedType);
              for (const acceptedType of SUPPORTED_MIME_TYPES) {
                expect(result.error?.message).toContain(acceptedType);
              }
            } finally {
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
