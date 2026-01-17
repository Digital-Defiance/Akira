/**
 * Persistence Service for Multimodal Input Support
 * Handles workspace storage with JSON persistence, rotation, and encryption
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-9.3
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  PersistedResult,
  ResultsFile,
  AnalysisResult,
  PersistenceConfig,
  MAX_RESULTS_FILE_SIZE_BYTES,
  RESULTS_FILE_VERSION,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Directory path for image analysis results within workspace
 */
export const RESULTS_DIRECTORY = ".vscode/image-analysis";

/**
 * Results file name
 */
export const RESULTS_FILENAME = "results.json";

/**
 * Encrypted results file name
 */
export const ENCRYPTED_RESULTS_FILENAME = "results.json.enc";

/**
 * Encryption algorithm
 */
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

/**
 * IV length for AES-GCM
 */
const IV_LENGTH = 16;

/**
 * Auth tag length for AES-GCM
 */
const AUTH_TAG_LENGTH = 16;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a summary from an analysis result
 */
export function createResultsSummary(result: AnalysisResult): PersistedResult["resultsSummary"] {
  const sortedLabels = [...result.labels].sort((a, b) => b.confidence - a.confidence);
  const topLabels = sortedLabels.slice(0, 5).map((l) => l.label);

  return {
    labelCount: result.labels.length,
    topLabels,
    hasOcrText: !!result.ocrText && result.ocrText.length > 0,
  };
}

/**
 * Create a persisted result from an analysis result
 */
export function createPersistedResult(result: AnalysisResult): PersistedResult {
  return {
    imagePath: result.imagePath,
    timestamp: result.timestamp,
    resultsSummary: createResultsSummary(result),
    modelId: result.modelId,
    fullResult: result,
  };
}

/**
 * Generate a timestamp suffix for rotated files
 */
function generateTimestampSuffix(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-");
}

// ============================================================================
// Persistence Service Interface
// ============================================================================

/**
 * Interface for persistence service operations
 */
export interface IPersistenceService {
  writeResult(workspaceRoot: string, result: PersistedResult): Promise<void>;
  readResults(workspaceRoot: string): Promise<ResultsFile>;
  rotateIfNeeded(workspaceRoot: string): Promise<boolean>;
}

// ============================================================================
// PersistenceService Class
// ============================================================================

/**
 * Persistence Service for storing analysis results
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-9.3
 */
export class PersistenceService implements IPersistenceService {
  private config: PersistenceConfig;

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = {
      maxFileSizeMB: config?.maxFileSizeMB ?? MAX_RESULTS_FILE_SIZE_BYTES / (1024 * 1024),
      encryptionEnabled: config?.encryptionEnabled ?? false,
      encryptionKey: config?.encryptionKey,
    };
  }

  /**
   * Get the results directory path for a workspace
   */
  public getResultsDirectory(workspaceRoot: string): string {
    return path.join(workspaceRoot, RESULTS_DIRECTORY);
  }

  /**
   * Get the results file path for a workspace
   */
  public getResultsFilePath(workspaceRoot: string): string {
    const filename = this.config.encryptionEnabled
      ? ENCRYPTED_RESULTS_FILENAME
      : RESULTS_FILENAME;
    return path.join(this.getResultsDirectory(workspaceRoot), filename);
  }

  /**
   * Get the maximum file size in bytes
   */
  private getMaxFileSizeBytes(): number {
    return this.config.maxFileSizeMB * 1024 * 1024;
  }

  /**
   * Ensure the results directory exists
   */
  private async ensureDirectoryExists(workspaceRoot: string): Promise<void> {
    const dir = this.getResultsDirectory(workspaceRoot);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  /**
   * Derive encryption key from workspace-scoped key
   * Requirement: REQ-9.3
   */
  private deriveKey(workspaceRoot: string): Buffer {
    const baseKey = this.config.encryptionKey || workspaceRoot;
    // Use PBKDF2 to derive a 256-bit key
    return crypto.pbkdf2Sync(baseKey, "multimodal-salt", 100000, 32, "sha256");
  }

  /**
   * Encrypt data using AES-256-GCM
   * Requirement: REQ-9.3
   */
  private encrypt(data: string, workspaceRoot: string): Buffer {
    const key = this.deriveKey(workspaceRoot);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: IV (16 bytes) + Auth Tag (16 bytes) + Encrypted Data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   * Requirement: REQ-9.3
   */
  private decrypt(encryptedData: Buffer, workspaceRoot: string): string {
    const key = this.deriveKey(workspaceRoot);

    // Extract IV, auth tag, and encrypted content
    const iv = encryptedData.subarray(0, IV_LENGTH);
    const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Read results file from disk
   * Requirement: REQ-5.1
   */
  public async readResults(workspaceRoot: string): Promise<ResultsFile> {
    const filePath = this.getResultsFilePath(workspaceRoot);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      // File doesn't exist, return empty results
      return {
        version: RESULTS_FILE_VERSION,
        results: [],
      };
    }

    const fileContent = await fs.promises.readFile(filePath);

    let jsonContent: string;
    if (this.config.encryptionEnabled) {
      jsonContent = this.decrypt(fileContent, workspaceRoot);
    } else {
      jsonContent = fileContent.toString("utf8");
    }

    const parsed = JSON.parse(jsonContent) as ResultsFile;

    // Ensure version compatibility
    if (!parsed.version) {
      parsed.version = RESULTS_FILE_VERSION;
    }

    return parsed;
  }

  /**
   * Write results file to disk
   */
  private async writeResultsFile(
    workspaceRoot: string,
    resultsFile: ResultsFile
  ): Promise<void> {
    await this.ensureDirectoryExists(workspaceRoot);
    const filePath = this.getResultsFilePath(workspaceRoot);
    const jsonContent = JSON.stringify(resultsFile, null, 2);

    if (this.config.encryptionEnabled) {
      const encrypted = this.encrypt(jsonContent, workspaceRoot);
      await fs.promises.writeFile(filePath, encrypted);
    } else {
      await fs.promises.writeFile(filePath, jsonContent, "utf8");
    }
  }

  /**
   * Check if file rotation is needed based on file size
   * Requirement: REQ-5.3
   */
  public async rotateIfNeeded(workspaceRoot: string): Promise<boolean> {
    const filePath = this.getResultsFilePath(workspaceRoot);

    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.size >= this.getMaxFileSizeBytes()) {
        await this.rotateFile(workspaceRoot);
        return true;
      }
    } catch {
      // File doesn't exist, no rotation needed
    }

    return false;
  }

  /**
   * Rotate the results file by renaming with timestamp suffix
   * Requirement: REQ-5.3
   */
  private async rotateFile(workspaceRoot: string): Promise<void> {
    const currentPath = this.getResultsFilePath(workspaceRoot);
    const timestamp = generateTimestampSuffix();
    const ext = this.config.encryptionEnabled ? ".json.enc" : ".json";
    const baseName = this.config.encryptionEnabled ? "results" : "results";
    const rotatedPath = path.join(
      this.getResultsDirectory(workspaceRoot),
      `${baseName}-${timestamp}${ext}`
    );

    await fs.promises.rename(currentPath, rotatedPath);
  }

  /**
   * Write a result to storage
   * Requirement: REQ-5.1, REQ-5.2
   */
  public async writeResult(
    workspaceRoot: string,
    result: PersistedResult
  ): Promise<void> {
    // Check if rotation is needed before writing
    await this.rotateIfNeeded(workspaceRoot);

    // Read existing results
    const resultsFile = await this.readResults(workspaceRoot);

    // Append new result
    resultsFile.results.push(result);

    // Write back to file
    await this.writeResultsFile(workspaceRoot, resultsFile);
  }

  /**
   * Write an analysis result to storage (convenience method)
   * Requirement: REQ-5.1
   */
  public async writeAnalysisResult(
    workspaceRoot: string,
    result: AnalysisResult
  ): Promise<PersistedResult> {
    const persistedResult = createPersistedResult(result);
    await this.writeResult(workspaceRoot, persistedResult);
    return persistedResult;
  }

  /**
   * Clear all results for a workspace
   */
  public async clearResults(workspaceRoot: string): Promise<void> {
    const emptyResults: ResultsFile = {
      version: RESULTS_FILE_VERSION,
      results: [],
    };
    await this.writeResultsFile(workspaceRoot, emptyResults);
  }

  /**
   * Get the current file size in bytes
   */
  public async getFileSize(workspaceRoot: string): Promise<number> {
    const filePath = this.getResultsFilePath(workspaceRoot);
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Check if the results file is encrypted
   * Requirement: REQ-9.3
   */
  public isEncryptionEnabled(): boolean {
    return this.config.encryptionEnabled;
  }

  /**
   * Update encryption configuration
   * Requirement: REQ-9.3
   */
  public setEncryptionEnabled(enabled: boolean, key?: string): void {
    this.config.encryptionEnabled = enabled;
    if (key !== undefined) {
      this.config.encryptionKey = key;
    }
  }
}
