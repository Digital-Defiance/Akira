/**
 * Spec directory management utilities
 * Handles creation, existence checking, and listing of spec directories
 */

import * as fs from "fs";
import * as path from "path";

// Conditionally import vscode only when available
// Use eval to prevent bundler from processing the require
let vscode: typeof import("vscode") | undefined;
try {
  // Use a dynamic require that bundlers won't process
  const requireFunc = eval("require");
  vscode = requireFunc("vscode");
} catch {
  // vscode is not available in standalone mode
  vscode = undefined;
}

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
 * Get the base directory for Akira files (.akira or .akira for backwards compatibility)
 * @param workspaceRoot - The workspace root path
 * @param preferredDir - Preferred directory name (default: ".akira")
 * @returns The base directory path (.akira if it exists or for new, .akira if it exists for backwards compat)
 */
export function getAkiraBaseDirectory(
  workspaceRoot: string
): string {
  const akiraDir = path.join(workspaceRoot, ".akira");
  const kiroDir = path.join(workspaceRoot, ".akira");
  
  // If .akira exists, use it
  if (fs.existsSync(akiraDir)) {
    return akiraDir;
  }
  
  // If .akira exists (backwards compatibility), use it
  if (fs.existsSync(kiroDir)) {
    return kiroDir;
  }
  
  // Neither exists, default to .akira
  return akiraDir;
}

/**
 * Get the spec directory path for a feature
 * @param featureName - The feature name
 * @param workspaceRoot - The workspace root path (optional, uses first workspace folder if not provided)
 * @returns The full path to the spec directory
 */
export function getSpecDirectoryPath(
  featureName: string,
  workspaceRoot?: string,
  specBaseDir?: string
): string {
  // Get workspace root from parameter, environment variable, or vscode
  const root =
    workspaceRoot ||
    process.env.WORKSPACE_ROOT ||
    vscode?.workspace.workspaceFolders?.[0]?.uri.fsPath ||
    "";

  // Use provided specBaseDir or get from config or environment
  let baseDir: string;
  
  if (specBaseDir) {
    baseDir = specBaseDir;
  } else {
    // Check for custom config
    const customDir = process.env.SPEC_DIRECTORY ||
      vscode?.workspace
        .getConfiguration("copilotSpec")
        .get<string>("specDirectory");
    
    if (customDir) {
      baseDir = customDir;
    } else {
      // Use .akira/specs or .akira/specs for backwards compatibility
      const akiraBase = getAkiraBaseDirectory(root);
      baseDir = path.join(path.basename(akiraBase), "specs");
    }
  }

  const kebabName = toKebabCase(featureName);
  return path.join(root, baseDir, kebabName);
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
      workspaceRoot ||
      process.env.WORKSPACE_ROOT ||
      vscode?.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      "";
    
    // Check for custom config
    const customDir = process.env.SPEC_DIRECTORY ||
      vscode?.workspace.getConfiguration("copilotSpec").get<string>("specDirectory");
    
    let specBaseDir: string;
    if (customDir) {
      specBaseDir = customDir;
    } else {
      // Use .akira/specs or .akira/specs for backwards compatibility
      const akiraBase = getAkiraBaseDirectory(root);
      specBaseDir = path.join(path.basename(akiraBase), "specs");
    }
    
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
          hasState: fs.existsSync(path.join(specDir, "state.json")),
        });
      }
    }

    return specs;
  } catch (error) {
    console.error("Error listing specs:", error);
    return [];
  }
}
