/**
 * Tests for status bar manager
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { StatusBarManager } from "./status-bar-manager";
import * as sharedStatusBar from "@ai-capabilities-suite/vscode-shared-status-bar";

// The shared status bar is already mocked in vitest.setup.ts

describe("Status Bar Manager", () => {
  let manager: StatusBarManager;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create manager
    manager = new StatusBarManager();
  });

  describe("Status Updates", () => {
    it("should update status with feature name and phase", async () => {
      await manager.updateStatus("test-feature", "requirements");

      expect(sharedStatusBar.registerExtension).toHaveBeenCalled();
      const calls = (sharedStatusBar.registerExtension as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].displayName).toContain("test-feature");
      expect(lastCall[1].displayName).toContain("Requirements");
    });

    it("should include percentage when provided", async () => {
      await manager.updateStatus("test-feature", "tasks", 75);

      expect(sharedStatusBar.registerExtension).toHaveBeenCalled();
      const calls = (sharedStatusBar.registerExtension as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].displayName).toContain("75%");
    });

    it("should set display name with detailed information", async () => {
      await manager.updateStatus("test-feature", "design", 50);

      expect(sharedStatusBar.registerExtension).toHaveBeenCalled();
      const calls = (sharedStatusBar.registerExtension as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].displayName).toContain("test-feature");
      expect(lastCall[1].displayName).toContain("Design");
      expect(lastCall[1].displayName).toContain("50%");
    });

    it("should register with correct extension ID", async () => {
      await manager.updateStatus("test-feature", "requirements");

      expect(sharedStatusBar.registerExtension).toHaveBeenCalledWith(
        "akira-spec-extension",
        expect.any(Object)
      );
    });
  });

  describe("Progress Indicator", () => {
    it("should show progress with message", async () => {
      await manager.showProgress("Creating spec...");

      expect(sharedStatusBar.registerExtension).toHaveBeenCalled();
      const calls = (sharedStatusBar.registerExtension as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].displayName).toBe("Creating spec...");
      expect(lastCall[1].status).toBe("warning");
    });
  });

  describe("Error Display", () => {
    it("should show error with message", async () => {
      await manager.showError("Failed to create spec");

      expect(sharedStatusBar.registerExtension).toHaveBeenCalled();
      const calls = (sharedStatusBar.registerExtension as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1].displayName).toBe("Failed to create spec");
      expect(lastCall[1].status).toBe("error");
    });
  });

  describe("Cleanup", () => {
    it("should unregister on dispose", async () => {
      await manager.updateStatus("test-feature", "requirements");
      await manager.dispose();

      expect(sharedStatusBar.unregisterExtension).toHaveBeenCalledWith(
        "akira-spec-extension"
      );
    });
  });
});
