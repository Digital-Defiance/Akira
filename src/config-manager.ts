/**
 * Configuration Manager
 * Handles reading and managing extension configuration settings
 */

// Conditionally import vscode only when available
let vscode: typeof import("vscode") | undefined;

// Allow tests to inject vscode mock
export function __setVSCodeForTesting(vscodeMock: any) {
  vscode = vscodeMock;
}

try {
  // Try static import first (for tests and extension)
  vscode = require("vscode");
} catch {
  // Fall back to dynamic require (for standalone)
  try {
    const requireFunc = eval("require");
    vscode = requireFunc("vscode");
  } catch {
    vscode = undefined;
  }
}

export interface ExtensionConfig {
  specDirectory: string;
  strictMode: boolean;
  propertyTestIterations: number;
}

/**
 * Check if vscode is available
 */
function isVSCodeAvailable(): boolean {
  return !!(vscode && vscode.workspace);
}

/**
 * Configuration Manager class
 * Provides access to extension configuration settings
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = "copilotSpec";

  /**
   * Get the current extension configuration
   */
  public static getConfig(): ExtensionConfig {
    if (isVSCodeAvailable() && vscode) {
      const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
      return {
        specDirectory: config.get<string>("specDirectory", ".akira/specs"),
        strictMode: config.get<boolean>("strictMode", false),
        propertyTestIterations: config.get<number>("propertyTestIterations", 100),
      };
    }
    
    // Fallback to environment variables when vscode is not available
    return {
      specDirectory: process.env.SPEC_DIRECTORY || ".akira/specs",
      strictMode: process.env.STRICT_MODE === "true",
      propertyTestIterations: parseInt(process.env.PROPERTY_TEST_ITERATIONS || "100", 10),
    };
  }

  /**
   * Get the spec directory path
   */
  public static getSpecDirectory(): string {
    return this.getConfig().specDirectory;
  }

  /**
   * Get strict mode setting
   */
  public static getStrictMode(): boolean {
    return this.getConfig().strictMode;
  }

  /**
   * Get property test iterations setting
   */
  public static getPropertyTestIterations(): number {
    return this.getConfig().propertyTestIterations;
  }

  /**
   * Register configuration change listener
   * @param callback Function to call when configuration changes
   * @returns Disposable to unregister the listener
   */
  public static onConfigurationChanged(
    callback: (config: ExtensionConfig) => void
  ): { dispose: () => void } {
    if (!isVSCodeAvailable() || !vscode) {
      // Return a no-op disposable when vscode is not available
      return { dispose: () => {} };
    }
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(this.CONFIG_SECTION)) {
        callback(this.getConfig());
      }
    });
  }
}
