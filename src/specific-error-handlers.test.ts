/**
 * Tests for specific error handlers
 */

import { describe, it, expect } from "vitest";
import {
  handleFileSystemError,
  handleValidationError,
  handleMCPCommunicationError,
  handleWorkflowStateError,
  handleUserInputError,
} from "./specific-error-handlers";

describe("Specific Error Handlers", () => {
  describe("handleFileSystemError", () => {
    it("should handle missing file errors", () => {
      const error = new Error("ENOENT: no such file or directory");
      const context = { operation: "read_spec", featureName: "test" };

      const response = handleFileSystemError(error, context);

      expect(response.category).toBe("file-system");
      expect(response.suggestions.length).toBeGreaterThan(0);
      expect(response.recoverable).toBe(true);
    });

    it("should handle permission errors", () => {
      const error = new Error("EACCES: permission denied");
      const context = { operation: "write_spec" };

      const response = handleFileSystemError(error, context);

      expect(response.suggestions.some((s) => s.includes("permission"))).toBe(
        true
      );
      expect(response.recoveryActions.length).toBeGreaterThan(0);
    });

    it("should suggest creating spec for missing directories", () => {
      const error = new Error("ENOENT: no such file");
      const context = { operation: "read", featureName: "my-feature" };

      const response = handleFileSystemError(error, context);

      expect(
        response.recoveryActions.some((a) => a.command === "create_spec")
      ).toBe(true);
    });
  });

  describe("handleValidationError", () => {
    it("should handle EARS pattern violations", () => {
      const error = new Error("Invalid EARS pattern");
      const context = { operation: "validate_requirements" };

      const response = handleValidationError(error, context);

      expect(response.category).toBe("validation");
      expect(response.suggestions.some((s) => s.includes("EARS"))).toBe(true);
    });

    it("should handle INCOSE rule violations", () => {
      const error = new Error("INCOSE rule violation: vague terms");
      const context = { operation: "validate" };

      const response = handleValidationError(error, context);

      expect(response.suggestions.some((s) => s.includes("INCOSE"))).toBe(true);
    });

    it("should suggest using validate_requirements tool", () => {
      const error = new Error("Validation failed");
      const context = { operation: "validate" };

      const response = handleValidationError(error, context);

      expect(
        response.recoveryActions.some(
          (a) => a.command === "validate_requirements"
        )
      ).toBe(true);
    });
  });

  describe("handleMCPCommunicationError", () => {
    it("should handle server not running errors", () => {
      const error = new Error("MCP server not running");
      const context = { operation: "mcp_call" };

      const response = handleMCPCommunicationError(error, context);

      expect(response.category).toBe("mcp-communication");
      expect(response.retryable).toBe(true);
      expect(response.recoveryActions.some((a) => a.automatic)).toBe(true);
    });

    it("should handle timeout errors", () => {
      const error = new Error("Request timed out");
      const context = { operation: "mcp_call" };

      const response = handleMCPCommunicationError(error, context);

      expect(
        response.suggestions.some(
          (s) => s.includes("timeout") || s.includes("respond")
        )
      ).toBe(true);
    });

    it("should handle unknown tool errors", () => {
      const error = new Error("Unknown tool: invalid_tool");
      const context = { operation: "mcp_call" };

      const response = handleMCPCommunicationError(error, context);

      expect(response.suggestions.some((s) => s.includes("tool"))).toBe(true);
    });
  });

  describe("handleWorkflowStateError", () => {
    it("should handle spec already exists errors", () => {
      const error = new Error("Spec already exists");
      const context = { operation: "create_spec", featureName: "test" };

      const response = handleWorkflowStateError(error, context);

      expect(response.category).toBe("workflow-state");
      expect(
        response.recoveryActions.some((a) => a.command === "update_spec")
      ).toBe(true);
    });

    it("should handle missing approval errors", () => {
      const error = new Error("Phase not approved");
      const context = { operation: "proceed_to_design" };

      const response = handleWorkflowStateError(error, context);

      expect(
        response.suggestions.some(
          (s) => s.includes("approval") || s.includes("approve")
        )
      ).toBe(true);
    });

    it("should handle phase order violations", () => {
      const error = new Error("Invalid phase order");
      const context = { operation: "skip_phase" };

      const response = handleWorkflowStateError(error, context);

      expect(
        response.suggestions.some(
          (s) => s.includes("order") || s.includes("phases")
        )
      ).toBe(true);
    });
  });

  describe("handleUserInputError", () => {
    it("should handle missing required parameters", () => {
      const error = new Error("featureName is required");
      const context = { operation: "create_spec" };

      const response = handleUserInputError(error, context);

      expect(response.category).toBe("user-input");
      expect(
        response.suggestions.some(
          (s) => s.includes("required") || s.includes("parameter")
        )
      ).toBe(true);
    });

    it("should handle invalid parameter types", () => {
      const error = new Error("Parameter must be a string");
      const context = { operation: "update_spec" };

      const response = handleUserInputError(error, context);

      expect(response.suggestions.some((s) => s.includes("type"))).toBe(true);
    });

    it("should provide command examples for create operations", () => {
      const error = new Error("Invalid parameters");
      const context = { operation: "create_spec" };

      const response = handleUserInputError(error, context);

      expect(response.suggestions.some((s) => s.includes("Example"))).toBe(
        true
      );
    });
  });
});
