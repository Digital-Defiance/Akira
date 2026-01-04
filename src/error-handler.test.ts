/**
 * Tests for ErrorHandler
 */

import { describe, it, expect } from "vitest";
import { ErrorHandler } from "./error-handler";

describe("ErrorHandler", () => {
  const handler = new ErrorHandler();

  describe("error categorization", () => {
    it("should categorize file system errors", () => {
      const error = new Error("ENOENT: no such file or directory");
      const context = { operation: "read_spec", featureName: "test-feature" };

      const response = handler.handleError(error, context);

      expect(response.category).toBe("file-system");
      expect(response.recoverable).toBe(true);
      expect(response.retryable).toBe(false);
    });

    it("should categorize validation errors", () => {
      const error = new Error("Invalid EARS pattern");
      const context = { operation: "validate_requirements" };

      const response = handler.handleError(error, context);

      expect(response.category).toBe("validation");
      expect(response.recoverable).toBe(true);
      expect(response.retryable).toBe(false);
    });

    it("should categorize MCP communication errors", () => {
      const error = new Error("MCP server timeout");
      const context = { operation: "mcp_call" };

      const response = handler.handleError(error, context);

      expect(response.category).toBe("mcp-communication");
      expect(response.recoverable).toBe(true);
      expect(response.retryable).toBe(true);
    });

    it("should categorize workflow state errors", () => {
      const error = new Error("Spec already exists");
      const context = { operation: "create_spec", featureName: "test" };

      const response = handler.handleError(error, context);

      expect(response.category).toBe("workflow-state");
      expect(response.recoverable).toBe(true);
      expect(response.retryable).toBe(false);
    });

    it("should categorize user input errors", () => {
      const error = new Error("featureName is required");
      const context = { operation: "create_spec" };

      const response = handler.handleError(error, context);

      expect(response.category).toBe("user-input");
      expect(response.recoverable).toBe(true);
      expect(response.retryable).toBe(false);
    });
  });

  describe("recovery suggestions", () => {
    it("should provide suggestions for file system errors", () => {
      const error = new Error("ENOENT: no such file");
      const context = { operation: "read_spec", featureName: "test" };

      const response = handler.handleError(error, context);

      expect(response.suggestions.length).toBeGreaterThan(0);
      expect(
        response.suggestions.some(
          (s) => s.includes("file") || s.includes("directory")
        )
      ).toBe(true);
    });

    it("should provide suggestions for validation errors", () => {
      const error = new Error("Invalid EARS pattern");
      const context = { operation: "validate" };

      const response = handler.handleError(error, context);

      expect(response.suggestions.length).toBeGreaterThan(0);
      expect(
        response.suggestions.some(
          (s) => s.includes("EARS") || s.includes("INCOSE")
        )
      ).toBe(true);
    });

    it("should provide suggestions for MCP errors", () => {
      const error = new Error("MCP server not running");
      const context = { operation: "mcp_call" };

      const response = handler.handleError(error, context);

      expect(response.suggestions.length).toBeGreaterThan(0);
      expect(response.suggestions.some((s) => s.includes("server"))).toBe(true);
    });
  });

  describe("recovery actions", () => {
    it("should suggest recovery actions for file system errors", () => {
      const error = new Error("ENOENT: no such file");
      const context = { operation: "read_spec", featureName: "test" };

      const response = handler.handleError(error, context);

      expect(response.recoveryActions.length).toBeGreaterThan(0);
    });

    it("should suggest automatic recovery for MCP errors", () => {
      const error = new Error("MCP server timeout");
      const context = { operation: "mcp_call" };

      const response = handler.handleError(error, context);

      const automaticActions = response.recoveryActions.filter(
        (a) => a.automatic
      );
      expect(automaticActions.length).toBeGreaterThan(0);
    });

    it("should suggest manual recovery for validation errors", () => {
      const error = new Error("Invalid EARS pattern");
      const context = { operation: "validate" };

      const response = handler.handleError(error, context);

      const manualActions = response.recoveryActions.filter(
        (a) => !a.automatic
      );
      expect(manualActions.length).toBeGreaterThan(0);
    });
  });

  describe("error message formatting", () => {
    it("should include operation in error message", () => {
      const error = new Error("Test error");
      const context = { operation: "test_operation" };

      const response = handler.handleError(error, context);

      expect(response.message).toContain("test_operation");
    });

    it("should include feature name when provided", () => {
      const error = new Error("Test error");
      const context = { operation: "test", featureName: "my-feature" };

      const response = handler.handleError(error, context);

      expect(response.message).toContain("my-feature");
    });

    it("should include phase when provided", () => {
      const error = new Error("Test error");
      const context = { operation: "test", phase: "requirements" };

      const response = handler.handleError(error, context);

      expect(response.message).toContain("requirements");
    });
  });

  describe("error logging", () => {
    it("should log error without throwing", () => {
      const error = new Error("Test error");
      const context = { operation: "test" };

      expect(() => handler.logError(error, context)).not.toThrow();
    });
  });
});
