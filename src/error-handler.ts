/**
 * Error Handler
 * Provides error categorization and recovery suggestions
 */

export type ErrorCategory =
  | "file-system"
  | "validation"
  | "mcp-communication"
  | "workflow-state"
  | "user-input";

export interface RecoveryAction {
  description: string;
  command?: string;
  automatic: boolean;
}

export interface ErrorResponse {
  message: string;
  suggestions: string[];
  recoverable: boolean;
  retryable: boolean;
  category: ErrorCategory;
  recoveryActions: RecoveryAction[];
}

export interface OperationContext {
  operation: string;
  featureName?: string;
  phase?: string;
  taskId?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * ErrorHandler provides centralized error handling with categorization and recovery suggestions
 */
export class ErrorHandler {
  /**
   * Handle an error with context-aware recovery
   */
  handleError(error: Error, context: OperationContext): ErrorResponse {
    const category = this.categorizeError(error, context);
    const suggestions = this.generateSuggestions(error, category, context);
    const recoveryActions = this.suggestRecovery(error, category, context);

    return {
      message: this.formatErrorMessage(error, context),
      suggestions,
      recoverable: this.isRecoverable(category),
      retryable: this.isRetryable(category),
      category,
      recoveryActions,
    };
  }

  /**
   * Categorize an error based on its type and context
   */
  private categorizeError(
    error: Error,
    context: OperationContext
  ): ErrorCategory {
    const errorMessage = error.message.toLowerCase();

    // File system errors
    if (
      errorMessage.includes("enoent") ||
      errorMessage.includes("no such file") ||
      errorMessage.includes("directory") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("eacces") ||
      errorMessage.includes("file not found")
    ) {
      return "file-system";
    }

    // Validation errors
    if (
      errorMessage.includes("ears") ||
      errorMessage.includes("incose") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("validation") ||
      errorMessage.includes("pattern") ||
      context.operation.includes("validate")
    ) {
      return "validation";
    }

    // MCP communication errors
    if (
      errorMessage.includes("mcp") ||
      errorMessage.includes("server") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("tool") ||
      context.operation.includes("mcp")
    ) {
      return "mcp-communication";
    }

    // Workflow state errors
    if (
      errorMessage.includes("phase") ||
      errorMessage.includes("approval") ||
      errorMessage.includes("workflow") ||
      errorMessage.includes("state") ||
      errorMessage.includes("already exists")
    ) {
      return "workflow-state";
    }

    // User input errors
    if (
      errorMessage.includes("required") ||
      errorMessage.includes("must be") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("missing")
    ) {
      return "user-input";
    }

    // Default to user input for unknown errors
    return "user-input";
  }

  /**
   * Generate helpful suggestions based on error category
   */
  private generateSuggestions(
    _error: Error,
    category: ErrorCategory,
    context: OperationContext
  ): string[] {
    const suggestions: string[] = [];

    switch (category) {
      case "file-system":
        suggestions.push("Check that the file or directory exists");
        suggestions.push("Verify you have the necessary permissions");
        if (context.featureName) {
          suggestions.push(
            `Ensure the spec directory exists for ${context.featureName}`
          );
        }
        break;

      case "validation":
        suggestions.push("Review the EARS patterns and INCOSE rules");
        suggestions.push(
          "Ensure requirements follow one of the six EARS patterns"
        );
        suggestions.push("Check for vague terms, escape clauses, or negatives");
        break;

      case "mcp-communication":
        suggestions.push("Check if the MCP server is running");
        suggestions.push("Try restarting the MCP server");
        suggestions.push("Verify the tool name and parameters are correct");
        break;

      case "workflow-state":
        suggestions.push("Check the current workflow phase");
        suggestions.push("Ensure previous phases are approved");
        if (context.featureName) {
          suggestions.push(`Review the state file for ${context.featureName}`);
        }
        break;

      case "user-input":
        suggestions.push("Check that all required parameters are provided");
        suggestions.push("Verify the parameter types and formats");
        suggestions.push("Review the command syntax and examples");
        break;
    }

    return suggestions;
  }

  /**
   * Suggest recovery actions for an error
   */
  suggestRecovery(
    error: Error,
    category: ErrorCategory,
    context: OperationContext
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (category) {
      case "file-system":
        if (
          (error.message.includes("not found") ||
            error.message.includes("ENOENT") ||
            error.message.includes("no such file")) &&
          context.featureName
        ) {
          actions.push({
            description: `Create spec directory for ${context.featureName}`,
            command: `create_spec`,
            automatic: false,
          });
        }
        if (
          error.message.includes("permission") ||
          error.message.includes("EACCES")
        ) {
          actions.push({
            description: "Check file permissions and ownership",
            automatic: false,
          });
        }
        // Always provide a general recovery action for file system errors
        if (actions.length === 0) {
          actions.push({
            description: "Check file paths and permissions",
            automatic: false,
          });
        }
        break;

      case "validation":
        actions.push({
          description: "Review and fix requirements to comply with EARS/INCOSE",
          automatic: false,
        });
        actions.push({
          description: "Use validate_requirements tool to check compliance",
          command: "validate_requirements",
          automatic: false,
        });
        break;

      case "mcp-communication":
        actions.push({
          description: "Restart the MCP server",
          automatic: true,
        });
        actions.push({
          description: "Retry the operation",
          automatic: false,
        });
        break;

      case "workflow-state":
        if (error.message.includes("already exists")) {
          actions.push({
            description: "Update the existing spec instead",
            command: "update_spec",
            automatic: false,
          });
        }
        if (error.message.includes("approval")) {
          actions.push({
            description: "Approve the current phase before proceeding",
            automatic: false,
          });
        }
        break;

      case "user-input":
        actions.push({
          description: "Provide all required parameters",
          automatic: false,
        });
        actions.push({
          description: "Check parameter types and formats",
          automatic: false,
        });
        break;
    }

    return actions;
  }

  /**
   * Format error message with context
   */
  private formatErrorMessage(error: Error, context: OperationContext): string {
    let message = `Error during ${context.operation}`;

    if (context.featureName) {
      message += ` for feature "${context.featureName}"`;
    }

    if (context.phase) {
      message += ` in ${context.phase} phase`;
    }

    message += `: ${error.message}`;

    return message;
  }

  /**
   * Check if an error is recoverable
   */
  private isRecoverable(category: ErrorCategory): boolean {
    switch (category) {
      case "file-system":
        return true; // Can create directories, fix permissions
      case "validation":
        return true; // Can fix requirements
      case "mcp-communication":
        return true; // Can restart server
      case "workflow-state":
        return true; // Can approve phases, update instead of create
      case "user-input":
        return true; // Can provide correct input
      default:
        return false;
    }
  }

  /**
   * Check if an operation should be retried
   */
  private isRetryable(category: ErrorCategory): boolean {
    switch (category) {
      case "mcp-communication":
        return true; // Network/server issues can be transient
      case "file-system":
        return false; // File issues usually need manual intervention
      case "validation":
        return false; // Validation errors need fixes, not retries
      case "workflow-state":
        return false; // State issues need resolution, not retries
      case "user-input":
        return false; // Input errors need correction, not retries
      default:
        return false;
    }
  }

  /**
   * Log error for debugging
   */
  logError(error: Error, context: OperationContext): void {
    const category = this.categorizeError(error, context);
    console.error(
      `[${category.toUpperCase()}] ${this.formatErrorMessage(error, context)}`
    );
    console.error("Stack trace:", error.stack);
    console.error("Context:", JSON.stringify(context, null, 2));
  }
}
