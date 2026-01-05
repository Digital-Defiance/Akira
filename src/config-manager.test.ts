/**
 * Tests for Configuration Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { ConfigManager } from "./config-manager";
import * as vscode from "vscode";

// Mock vscode
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
  },
}));

describe("ConfigManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Property Tests", () => {
    it("Property 21: Custom directory configuration", () => {
      // **Feature: copilot-spec-extension, Property 21: Custom directory configuration**
      // For any custom spec directory configured in settings, all spec operations should use that directory instead of the default `.akira/specs`.

      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0 && !s.includes("\0")),
          (customDir) => {
            // Mock the configuration to return the custom directory
            const mockConfig = {
              get: vi.fn((key: string, defaultValue?: any) => {
                if (key === "specDirectory") {
                  return customDir;
                }
                if (key === "strictMode") {
                  return false;
                }
                if (key === "propertyTestIterations") {
                  return 100;
                }
                return defaultValue;
              }),
            };

            vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
              mockConfig as any
            );

            // Get the configuration
            const config = ConfigManager.getConfig();

            // Verify that the custom directory is used
            expect(config.specDirectory).toBe(customDir);

            // Verify that getSpecDirectory returns the custom directory
            const specDir = ConfigManager.getSpecDirectory();
            expect(specDir).toBe(customDir);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 22: Strict mode enforcement", () => {
      // **Feature: copilot-spec-extension, Property 22: Strict mode enforcement**
      // For any workflow with strict mode enabled, all tasks (including those normally marked optional) should be required for completion.

      fc.assert(
        fc.property(fc.boolean(), (strictModeEnabled) => {
          // Mock the configuration to return the strict mode setting
          const mockConfig = {
            get: vi.fn((key: string, defaultValue?: any) => {
              if (key === "specDirectory") {
                return ".akira/specs";
              }
              if (key === "strictMode") {
                return strictModeEnabled;
              }
              if (key === "propertyTestIterations") {
                return 100;
              }
              return defaultValue;
            }),
          };

          vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
            mockConfig as any
          );

          // Get the configuration
          const config = ConfigManager.getConfig();

          // Verify that strict mode is set correctly
          expect(config.strictMode).toBe(strictModeEnabled);

          // Verify that getStrictMode returns the correct value
          const strictMode = ConfigManager.getStrictMode();
          expect(strictMode).toBe(strictModeEnabled);
        }),
        { numRuns: 100 }
      );
    });

    it("Property 23: Configuration hot-reload", () => {
      // **Feature: copilot-spec-extension, Property 23: Configuration hot-reload**
      // For any configuration change, the new settings should take effect immediately without requiring extension restart.

      fc.assert(
        fc.property(
          fc.record({
            specDirectory: fc
              .string({ minLength: 1, maxLength: 50 })
              .filter((s) => s.trim().length > 0 && !s.includes("\0")),
            strictMode: fc.boolean(),
            propertyTestIterations: fc.integer({ min: 1, max: 10000 }),
          }),
          fc.record({
            specDirectory: fc
              .string({ minLength: 1, maxLength: 50 })
              .filter((s) => s.trim().length > 0 && !s.includes("\0")),
            strictMode: fc.boolean(),
            propertyTestIterations: fc.integer({ min: 1, max: 10000 }),
          }),
          (initialConfig, newConfig) => {
            // Track the current configuration state
            let currentConfig = { ...initialConfig };

            // Mock the configuration to return the current state
            const mockConfig = {
              get: vi.fn((key: string, defaultValue?: any) => {
                if (key === "specDirectory") {
                  return currentConfig.specDirectory;
                }
                if (key === "strictMode") {
                  return currentConfig.strictMode;
                }
                if (key === "propertyTestIterations") {
                  return currentConfig.propertyTestIterations;
                }
                return defaultValue;
              }),
            };

            vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
              mockConfig as any
            );

            // Get initial configuration
            const config1 = ConfigManager.getConfig();
            expect(config1.specDirectory).toBe(initialConfig.specDirectory);
            expect(config1.strictMode).toBe(initialConfig.strictMode);
            expect(config1.propertyTestIterations).toBe(
              initialConfig.propertyTestIterations
            );

            // Simulate configuration change by updating the current config
            currentConfig = { ...newConfig };

            // Set up the configuration change listener
            let listenerCallback: ((config: any) => void) | null = null;
            vi.mocked(
              vscode.workspace.onDidChangeConfiguration
            ).mockImplementation((callback: any) => {
              listenerCallback = callback;
              return { dispose: vi.fn() } as any;
            });

            // Register the listener
            let updatedConfig: any = null;
            ConfigManager.onConfigurationChanged((config) => {
              updatedConfig = config;
            });

            // Simulate the configuration change event
            if (listenerCallback) {
              listenerCallback({
                affectsConfiguration: (section: string) =>
                  section === "copilotSpec",
              });
            }

            // Verify that the new configuration is immediately available
            const config2 = ConfigManager.getConfig();
            expect(config2.specDirectory).toBe(newConfig.specDirectory);
            expect(config2.strictMode).toBe(newConfig.strictMode);
            expect(config2.propertyTestIterations).toBe(
              newConfig.propertyTestIterations
            );

            // Verify that the listener was called with the new configuration
            expect(updatedConfig).not.toBeNull();
            expect(updatedConfig.specDirectory).toBe(newConfig.specDirectory);
            expect(updatedConfig.strictMode).toBe(newConfig.strictMode);
            expect(updatedConfig.propertyTestIterations).toBe(
              newConfig.propertyTestIterations
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Unit Tests", () => {
    it("should return default configuration when no custom settings", () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => defaultValue),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any
      );

      const config = ConfigManager.getConfig();

      expect(config.specDirectory).toBe(".akira/specs");
      expect(config.strictMode).toBe(false);
      expect(config.propertyTestIterations).toBe(100);
    });

    it("should return custom configuration when settings are provided", () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === "specDirectory") return "custom/specs";
          if (key === "strictMode") return true;
          if (key === "propertyTestIterations") return 200;
          return defaultValue;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any
      );

      const config = ConfigManager.getConfig();

      expect(config.specDirectory).toBe("custom/specs");
      expect(config.strictMode).toBe(true);
      expect(config.propertyTestIterations).toBe(200);
    });

    it("should get spec directory", () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === "specDirectory") return "my/specs";
          return defaultValue;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any
      );

      const specDir = ConfigManager.getSpecDirectory();
      expect(specDir).toBe("my/specs");
    });

    it("should get strict mode", () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === "strictMode") return true;
          return defaultValue;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any
      );

      const strictMode = ConfigManager.getStrictMode();
      expect(strictMode).toBe(true);
    });

    it("should get property test iterations", () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === "propertyTestIterations") return 500;
          return defaultValue;
        }),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
        mockConfig as any
      );

      const iterations = ConfigManager.getPropertyTestIterations();
      expect(iterations).toBe(500);
    });

    it("should register configuration change listener", () => {
      const mockDisposable = { dispose: vi.fn() };
      const mockCallback = vi.fn();

      vi.mocked(vscode.workspace.onDidChangeConfiguration).mockReturnValue(
        mockDisposable as any
      );

      const disposable = ConfigManager.onConfigurationChanged(mockCallback);

      expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
      expect(disposable).toBe(mockDisposable);
    });
  });
});
