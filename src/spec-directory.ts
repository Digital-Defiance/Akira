/**
 * Spec directory management utilities
 * Handles creation, existence checking, and listing of spec directories
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Convert a feature name to kebab-case
 * @param featureName - The feature name to convert
 * @returns The kebab-case version of the feature name
 */
export function toKebabCase(featureName: string): string {
  return featureName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Get the spec directory path for a feature
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional, uses first workspace folder if not provided)
 * @returns The full path to the spec directory
 */
export function getSpecDirectoryPath(
  featureName: string,
  workspaceRoot?: string
): string {
  const root =
    workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const config = vscode.workspace.getConfiguration("copilotSpec");
  const specBaseDir = config.get<string>("specDirectory") || ".kiro/specs";
  const kebabName = toKebabCase(featureName);
  return path.join(root, specBaseDir, kebabName);
}

/**
 * Create a spec directory structure for a feature
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns Object containing success status, directory path, and any error
 */
export function createSpecDirectory(
  featureName: string,
  workspaceRoot?: string
): { success: boolean; directory: string; error?: string } {
  try {
    const specDir = getSpecDirectoryPath(featureName, workspaceRoot);

    // Check if directory already exists
    if (fs.existsSync(specDir)) {
      return {
        success: false,
        directory: specDir,
        error: `Spec directory already exists: ${specDir}`,
      };
    }

    // Create directory structure
    fs.mkdirSync(specDir, { recursive: true });

    // Create empty requirements.md file
    const requirementsPath = path.join(specDir, "requirements.md");
    fs.writeFileSync(requirementsPath, "# Requirements Document\n\n");

    return {
      success: true,
      directory: specDir,
    };
  } catch (error) {
    return {
      success: false,
      directory: "",
      error: `Failed to create spec directory: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Check if a spec exists for a feature
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional)
 * @returns True if the spec directory exists, false otherwise
 */
export function specExists(
  featureName: string,
  workspaceRoot?: string
): boolean {
  const specDir = getSpecDirectoryPath(featureName, workspaceRoot);
  return fs.existsSync(specDir);
}

/**
 * Information about a spec
 */
export interface SpecInfo {
  featureName: string;
  directory: string;
  hasRequirements: boolean;
  hasDesign: boolean;
  hasTasks: boolean;
  hasState: boolean;
}

/**
 * List all specs in the workspace
 * @param workspaceRoot - The workspace root path (optional)
 * @returns Array of spec information objects
 */
export function listSpecs(workspaceRoot?: string): SpecInfo[] {
  try {
    const root =
      workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const config = vscode.workspace.getConfiguration("copilotSpec");
    const specBaseDir = config.get<string>("specDirectory") || ".kiro/specs";
    const specsPath = path.join(root, specBaseDir);

    // Check if specs directory exists
    if (!fs.existsSync(specsPath)) {
      return [];
    }

    // Read all directories in specs folder
    const entries = fs.readdirSync(specsPath, { withFileTypes: true });
    const specs: SpecInfo[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specDir = path.join(specsPath, entry.name);
        specs.push({
          featureName: entry.name,
          directory: specDir,
          hasRequirements: fs.existsSync(path.join(specDir, "requirements.md")),
          hasDesign: fs.existsSync(path.join(specDir, "design.md")),
          hasTasks: fs.existsSync(path.join(specDir, "tasks.md")),
          hasState: fs.existsSync(path.join(specDir, ".state.json")),
        });
      }
    }

    return specs;
  } catch (error) {
    console.error("Error listing specs:", error);
    return [];
  }
}
