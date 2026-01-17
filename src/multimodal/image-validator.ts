/**
 * Image Validator for Multimodal Input Support
 * Requirements: REQ-1.1, REQ-1.4, REQ-6.1
 */

import * as fs from "fs";
import * as path from "path";
import {
  ImageValidationResult,
  SupportedMimeType,
  SUPPORTED_MIME_TYPES,
} from "./types";

/**
 * Interface for Image Validator
 */
export interface IImageValidator {
  /**
   * Validate an image file for analysis
   * @param imagePath - Path to the image file
   * @param maxSizeMB - Maximum allowed file size in megabytes (default: 25)
   * @returns Validation result with MIME type and size if valid
   */
  validate(
    imagePath: string,
    maxSizeMB?: number
  ): Promise<ImageValidationResult>;
}

/**
 * Detects MIME type from file magic bytes
 * @param filePath - Path to the file
 * @returns Detected MIME type or undefined if not recognized
 */
async function detectMimeType(filePath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { start: 0, end: 11 });
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const hex = buffer.toString("hex").toLowerCase();

      // Check PNG (8 bytes signature)
      if (hex.startsWith("89504e47")) {
        resolve("image/png");
        return;
      }

      // Check JPEG (starts with FFD8FF)
      if (hex.startsWith("ffd8ff")) {
        resolve("image/jpeg");
        return;
      }

      // Check GIF (GIF87a or GIF89a)
      if (hex.startsWith("47494638")) {
        resolve("image/gif");
        return;
      }

      // Check WebP (RIFF....WEBP)
      if (hex.startsWith("52494646") && hex.substring(16, 24) === "57454250") {
        resolve("image/webp");
        return;
      }

      // Unknown format - try to infer from extension as fallback
      const ext = path.extname(filePath).toLowerCase();
      const extMimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      };

      resolve(extMimeMap[ext] || `unknown/${ext.slice(1) || "binary"}`);
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * ImageValidator class for validating image files before analysis
 * Implements REQ-1.1 (MIME type validation), REQ-1.4 (size validation), REQ-6.1 (error messages)
 */
export class ImageValidator implements IImageValidator {
  /**
   * Validate an image file for analysis
   * @param imagePath - Path to the image file
   * @param maxSizeMB - Maximum allowed file size in megabytes (default: 25)
   * @returns Validation result with MIME type and size if valid
   */
  async validate(
    imagePath: string,
    maxSizeMB: number = 25
  ): Promise<ImageValidationResult> {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return {
        valid: false,
        error: {
          code: "FILE_NOT_FOUND",
          message: `Image file not found: ${imagePath}`,
        },
      };
    }

    // Get file stats for size
    let stats: fs.Stats;
    try {
      stats = fs.statSync(imagePath);
    } catch {
      return {
        valid: false,
        error: {
          code: "FILE_NOT_FOUND",
          message: `Unable to read image file: ${imagePath}`,
        },
      };
    }

    const fileSize = stats.size;

    // Check file size (REQ-1.4)
    if (fileSize > maxSizeBytes) {
      return {
        valid: false,
        fileSize,
        error: {
          code: "FILE_TOO_LARGE",
          message: `Image file size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed size of ${maxSizeMB} MB`,
          maxSizeBytes,
          actualSizeBytes: fileSize,
        },
      };
    }

    // Detect MIME type from magic bytes
    let detectedMimeType: string | undefined;
    try {
      detectedMimeType = await detectMimeType(imagePath);
    } catch {
      return {
        valid: false,
        fileSize,
        error: {
          code: "FILE_NOT_FOUND",
          message: `Unable to read image file for MIME type detection: ${imagePath}`,
        },
      };
    }

    // Check if MIME type is supported (REQ-1.1, REQ-6.1)
    if (
      !detectedMimeType ||
      !SUPPORTED_MIME_TYPES.includes(detectedMimeType as SupportedMimeType)
    ) {
      return {
        valid: false,
        fileSize,
        error: {
          code: "INVALID_MIME_TYPE",
          message: `Unsupported image format. Detected MIME type: ${detectedMimeType || "unknown"}. Accepted formats: ${SUPPORTED_MIME_TYPES.join(", ")}`,
          detectedMimeType: detectedMimeType || "unknown",
          acceptedMimeTypes: [...SUPPORTED_MIME_TYPES],
        },
      };
    }

    // Valid image
    return {
      valid: true,
      mimeType: detectedMimeType as SupportedMimeType,
      fileSize,
    };
  }
}

/**
 * Default singleton instance
 */
export const imageValidator = new ImageValidator();
