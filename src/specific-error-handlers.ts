/**
 * Specific Error Handlers
 * Provides specialized error handling for different error categories
 */

import {
  ErrorResponse,
  RecoveryAction,
  OperationContext,
} from "./error-handler";

/**
 * Handle file system errors
 */
export function handleFileSystemError(
  error: Error,
  context: OperationContext
): ErrorResponse {
  const errorMessage = error.message.toLowerCase();
  const suggestions: string[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // Missing file or directory
  if (
    errorMessage.includes("enoent") ||
    errorMessage.includes("no such file")
  ) {
    suggestions.push("The file or directory does not exist");
    suggestions.push("Check the path and ensure it was created correctly");

    if (context.featureName) {
      suggestions.push(
        `Create the spec directory for ${context.featureName} first`
      );
      recoveryActions.push({
        description: `Create spec for ${context.featureName}`,
        command: "create_spec",
        automatic: false,
      });
    }
  }

  // Permission errors
  if (errorMessage.includes("eacces") || errorMessage.includes("permission")) {
    suggestions.push(
      "You don't have permission to access this file or directory"
    );
    suggestions.push("Check file permissions and ownership");
    suggestions.push("Try running with appropriate permissions");

    recoveryActions.push({
      description: "Check and fix file permissions",
      automatic: false,
    });
  }

  // Directory not empty
  if (
    errorMessage.includes("enotempty") ||
    errorMessage.includes("directory not empty")
  ) {
    suggestions.push("The directory is not empty");
    suggestions.push("Remove contents or use a different directory");

    recoveryActions.push({
      description: "Choose a different feature name",
      automatic: false,
    });
  }

  // Disk space errors
  if (errorMessage.includes("enospc") || errorMessage.includes("no space")) {
    suggestions.push("Not enough disk space available");
    suggestions.push("Free up disk space and try again");

    recoveryActions.push({
      description: "Free up disk space",
      automatic: false,
    });
  }

  return {
    message: `File system error: ${error.message}`,
    suggestions,
    recoverable: true,
    retryable: false,
    category: "file-system",
    recoveryActions,
  };
}

/**
 * Handle validation errors
 */
export function handleValidationError(
  error: Error,
  _context: OperationContext
): ErrorResponse {
  const errorMessage = error.message.toLowerCase();
  const suggestions: string[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // EARS pattern violations
  if (errorMessage.includes("ears")) {
    suggestions.push("Requirements must follow one of the six EARS patterns:");
    suggestions.push("  - Ubiquitous: THE <system> SHALL <response>");
    suggestions.push(
      "  - Event-driven: WHEN <trigger>, THE <system> SHALL <response>"
    );
    suggestions.push(
      "  - State-driven: WHILE <condition>, THE <system> SHALL <response>"
    );
    suggestions.push(
      "  - Unwanted event: IF <condition>, THEN THE <system> SHALL <response>"
    );
    suggestions.push(
      "  - Optional: WHERE <option>, THE <system> SHALL <response>"
    );
    suggestions.push("  - Complex: Combination of the above in correct order");

    recoveryActions.push({
      description: "Rewrite requirement using correct EARS pattern",
      automatic: false,
    });
  }

  // INCOSE rule violations
  if (errorMessage.includes("incose")) {
    suggestions.push("Requirements must comply with INCOSE quality rules:");
    suggestions.push("  - Use active voice (who does what)");
    suggestions.push("  - Avoid vague terms (quickly, adequate)");
    suggestions.push("  - No escape clauses (where possible)");
    suggestions.push("  - No negative statements (SHALL not)");
    suggestions.push("  - One thought per requirement");
    suggestions.push("  - Explicit and measurable conditions");

    recoveryActions.push({
      description: "Fix INCOSE rule violations in requirements",
      automatic: false,
    });
  }

  // Invalid task hierarchy
  if (errorMessage.includes("hierarchy") || errorMessage.includes("depth")) {
    suggestions.push("Tasks must have maximum 2 levels of hierarchy");
    suggestions.push("Use format: 1, 1.1, 1.2 (not 1.1.1)");

    recoveryActions.push({
      description: "Flatten task hierarchy to 2 levels maximum",
      automatic: false,
    });
  }

  // General validation
  recoveryActions.push({
    description: "Use validate_requirements tool to check compliance",
    command: "validate_requirements",
    automatic: false,
  });

  return {
    message: `Validation error: ${error.message}`,
    suggestions,
    recoverable: true,
    retryable: false,
    category: "validation",
    recoveryActions,
  };
}

/**
 * Handle MCP communication errors
 */
export function handleMCPCommunicationError(
  error: Error,
  _context: OperationContext
): ErrorResponse {
  const errorMessage = error.message.toLowerCase();
  const suggestions: string[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // Server not running
  if (
    errorMessage.includes("not running") ||
    errorMessage.includes("not started")
  ) {
    suggestions.push("The MCP server is not running");
    suggestions.push("Start the MCP server before making requests");

    recoveryActions.push({
      description: "Start the MCP server",
      automatic: true,
    });
  }

  // Connection timeout
  if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
    suggestions.push("The MCP server did not respond in time");
    suggestions.push("The server may be overloaded or unresponsive");

    recoveryActions.push({
      description: "Restart the MCP server",
      automatic: true,
    });
    recoveryActions.push({
      description: "Retry the operation",
      automatic: false,
    });
  }

  // Unknown tool
  if (
    errorMessage.includes("unknown tool") ||
    errorMessage.includes("tool not found")
  ) {
    suggestions.push("The requested MCP tool does not exist");
    suggestions.push("Check the tool name spelling");
    suggestions.push(
      "Available tools: create_spec, read_spec, update_spec, list_specs, validate_requirements, update_task_status"
    );

    recoveryActions.push({
      description: "Use correct tool name",
      automatic: false,
    });
  }

  // Schema validation
  if (
    errorMessage.includes("schema") ||
    errorMessage.includes("invalid arguments")
  ) {
    suggestions.push("The tool arguments don't match the expected schema");
    suggestions.push("Check required parameters and their types");

    recoveryActions.push({
      description: "Provide correct arguments matching tool schema",
      automatic: false,
    });
  }

  // General MCP error
  if (recoveryActions.length === 0) {
    recoveryActions.push({
      description: "Restart the MCP server",
      automatic: true,
    });
    recoveryActions.push({
      description: "Retry the operation after restart",
      automatic: false,
    });
  }

  return {
    message: `MCP communication error: ${error.message}`,
    suggestions,
    recoverable: true,
    retryable: true,
    category: "mcp-communication",
    recoveryActions,
  };
}

/**
 * Handle workflow state errors
 */
export function handleWorkflowStateError(
  error: Error,
  context: OperationContext
): ErrorResponse {
  const errorMessage = error.message.toLowerCase();
  const suggestions: string[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // Spec already exists
  if (errorMessage.includes("already exists")) {
    suggestions.push(
      `A spec already exists for ${context.featureName || "this feature"}`
    );
    suggestions.push("Use update_spec to modify the existing spec");
    suggestions.push("Or choose a different feature name");

    recoveryActions.push({
      description: "Update existing spec instead of creating new one",
      command: "update_spec",
      automatic: false,
    });
    recoveryActions.push({
      description: "Choose a different feature name",
      automatic: false,
    });
  }

  // Missing approval
  if (
    errorMessage.includes("approval") ||
    errorMessage.includes("not approved")
  ) {
    suggestions.push("The current phase must be approved before proceeding");
    suggestions.push("Review the document and approve it to continue");

    recoveryActions.push({
      description: "Approve the current phase",
      automatic: false,
    });
  }

  // Phase order violation
  if (errorMessage.includes("phase") || errorMessage.includes("order")) {
    suggestions.push("Workflow phases must be completed in order:");
    suggestions.push("  1. Requirements");
    suggestions.push("  2. Design");
    suggestions.push("  3. Tasks");
    suggestions.push("  4. Execution");

    recoveryActions.push({
      description: "Complete previous phases first",
      automatic: false,
    });
  }

  // Corrupted state
  if (
    errorMessage.includes("corrupt") ||
    errorMessage.includes("invalid state")
  ) {
    suggestions.push("The workflow state file may be corrupted");
    suggestions.push("Try resetting the state or recreating the spec");

    recoveryActions.push({
      description: "Reset workflow state",
      automatic: false,
    });
  }

  return {
    message: `Workflow state error: ${error.message}`,
    suggestions,
    recoverable: true,
    retryable: false,
    category: "workflow-state",
    recoveryActions,
  };
}

/**
 * Handle user input errors
 */
export function handleUserInputError(
  error: Error,
  context: OperationContext
): ErrorResponse {
  const errorMessage = error.message.toLowerCase();
  const suggestions: string[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // Missing required parameter
  if (errorMessage.includes("required")) {
    suggestions.push("A required parameter is missing");
    suggestions.push(
      "Check the command syntax and provide all required parameters"
    );

    const missingParam = error.message.match(/(\w+) is required/)?.[1];
    if (missingParam) {
      suggestions.push(`Missing parameter: ${missingParam}`);
    }

    recoveryActions.push({
      description: "Provide all required parameters",
      automatic: false,
    });
  }

  // Invalid parameter type
  if (errorMessage.includes("must be") || errorMessage.includes("type")) {
    suggestions.push("A parameter has the wrong type");
    suggestions.push(
      "Check that strings are strings, numbers are numbers, etc."
    );

    recoveryActions.push({
      description: "Use correct parameter types",
      automatic: false,
    });
  }

  // Invalid parameter value
  if (errorMessage.includes("invalid") && !errorMessage.includes("pattern")) {
    suggestions.push("A parameter has an invalid value");
    suggestions.push("Check allowed values and formats");

    recoveryActions.push({
      description: "Provide valid parameter values",
      automatic: false,
    });
  }

  // Malformed feature name
  if (
    errorMessage.includes("feature name") ||
    errorMessage.includes("kebab-case")
  ) {
    suggestions.push("Feature names should be descriptive and use kebab-case");
    suggestions.push(
      "Examples: user-authentication, task-management, api-integration"
    );

    recoveryActions.push({
      description: "Use a valid feature name",
      automatic: false,
    });
  }

  // Command examples
  if (context.operation.includes("create")) {
    suggestions.push(
      'Example: create_spec("user-auth", "Add user authentication")'
    );
  } else if (context.operation.includes("read")) {
    suggestions.push('Example: read_spec("user-auth", "requirements")');
  } else if (context.operation.includes("update")) {
    suggestions.push(
      'Example: update_spec("user-auth", "design", "# Design\\n...")'
    );
  }

  return {
    message: `User input error: ${error.message}`,
    suggestions,
    recoverable: true,
    retryable: false,
    category: "user-input",
    recoveryActions,
  };
}
