/**
 * Consent Manager for Multimodal Input Support
 * Requirements: REQ-9.1, REQ-9.2
 * 
 * Manages user consent for external endpoint access and local-only mode enforcement.
 * Implements one-time consent dialog and persists consent state in workspace settings.
 */

import { AnalysisError } from "./types";

// Conditionally import vscode only when available
let vscode: typeof import("vscode") | undefined;

// Allow tests to inject vscode mock
export function __setVSCodeForTesting(vscodeMock: unknown): void {
  vscode = vscodeMock as typeof vscode;
}

try {
  vscode = require("vscode");
} catch {
  try {
    const requireFunc = eval("require");
    vscode = requireFunc("vscode");
  } catch {
    vscode = undefined;
  }
}

// ============================================================================
// Consent Types
// ============================================================================

/**
 * Consent state for external endpoint access
 */
export interface ConsentState {
  /** Whether user has given consent for external endpoints */
  userConsentGiven: boolean;
  /** Timestamp when consent was given (ISO string) */
  consentTimestamp?: string;
  /** Whether local-only mode is enabled */
  localOnlyMode: boolean;
}

/**
 * Result of a consent check
 */
export interface ConsentCheckResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: "NO_CONSENT" | "LOCAL_ONLY_MODE";
  /** Error to throw if not allowed */
  error?: AnalysisError;
}

/**
 * Options for showing consent dialog
 */
export interface ConsentDialogOptions {
  /** Title for the dialog */
  title?: string;
  /** Message to display */
  message?: string;
  /** Label for accept button */
  acceptLabel?: string;
  /** Label for decline button */
  declineLabel?: string;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_CONSENT_DIALOG_OPTIONS: Required<ConsentDialogOptions> = {
  title: "External Endpoint Access",
  message: "This feature requires sending image data to an external inference endpoint. Do you consent to sending your images to external services for analysis?",
  acceptLabel: "Yes, I consent",
  declineLabel: "No, keep local only",
};

// ============================================================================
// ConsentManager Class
// ============================================================================

/**
 * ConsentManager class for managing user consent and local-only mode
 * Implements REQ-9.1 (one-time consent dialog for external endpoints)
 * Implements REQ-9.2 (local-only mode enforcement)
 */
export class ConsentManager {
  private static readonly CONFIG_SECTION = "akira.multimodal";
  
  // In-memory state for testing without VS Code
  private inMemoryState: ConsentState = {
    userConsentGiven: false,
    localOnlyMode: false,
  };

  // Flag to track if consent dialog has been shown this session
  private consentDialogShownThisSession = false;

  constructor() {}

  /**
   * Check if vscode is available
   */
  private isVSCodeAvailable(): boolean {
    return !!(vscode && vscode.workspace);
  }

  /**
   * Get the current consent state
   * @returns Current consent state from workspace settings or in-memory
   */
  public getConsentState(): ConsentState {
    if (this.isVSCodeAvailable() && vscode) {
      const config = vscode.workspace.getConfiguration(ConsentManager.CONFIG_SECTION);
      return {
        userConsentGiven: config.get<boolean>("userConsentGiven", false),
        consentTimestamp: config.get<string>("consentTimestamp"),
        localOnlyMode: config.get<boolean>("localOnlyMode", false),
      };
    }
    return { ...this.inMemoryState };
  }

  /**
   * Check if user has given consent for external endpoints
   * Requirement: REQ-9.1
   * @returns true if consent has been given
   */
  public hasConsent(): boolean {
    const state = this.getConsentState();
    return state.userConsentGiven;
  }

  /**
   * Check if local-only mode is enabled
   * Requirement: REQ-9.2
   * @returns true if local-only mode is enabled
   */
  public isLocalOnlyMode(): boolean {
    const state = this.getConsentState();
    return state.localOnlyMode;
  }

  /**
   * Check if an external request is allowed
   * Requirement: REQ-9.1, REQ-9.2
   * @returns ConsentCheckResult indicating if request is allowed
   */
  public checkExternalRequestAllowed(): ConsentCheckResult {
    const state = this.getConsentState();

    // Check local-only mode first (REQ-9.2)
    if (state.localOnlyMode) {
      return {
        allowed: false,
        reason: "LOCAL_ONLY_MODE",
        error: this.createConsentError(
          "External requests are blocked because local-only mode is enabled.",
          "LOCAL_ONLY_MODE"
        ),
      };
    }

    // Check consent (REQ-9.1)
    if (!state.userConsentGiven) {
      return {
        allowed: false,
        reason: "NO_CONSENT",
        error: this.createConsentError(
          "User consent is required before sending data to external endpoints.",
          "NO_CONSENT"
        ),
      };
    }

    return { allowed: true };
  }

  /**
   * Show consent dialog and persist result
   * Requirement: REQ-9.1
   * @param options - Dialog options
   * @returns true if user consented, false otherwise
   */
  public async showConsentDialog(
    options: ConsentDialogOptions = {}
  ): Promise<boolean> {
    const opts = { ...DEFAULT_CONSENT_DIALOG_OPTIONS, ...options };

    if (this.isVSCodeAvailable() && vscode) {
      const result = await vscode.window.showInformationMessage(
        opts.message,
        { modal: true, detail: opts.title },
        opts.acceptLabel,
        opts.declineLabel
      );

      const consented = result === opts.acceptLabel;
      await this.setConsent(consented);
      this.consentDialogShownThisSession = true;
      return consented;
    }

    // In test mode, return false (no consent)
    this.consentDialogShownThisSession = true;
    return false;
  }

  /**
   * Set consent state
   * Requirement: REQ-9.1
   * @param consented - Whether user consented
   */
  public async setConsent(consented: boolean): Promise<void> {
    const timestamp = consented ? new Date().toISOString() : undefined;

    if (this.isVSCodeAvailable() && vscode) {
      const config = vscode.workspace.getConfiguration(ConsentManager.CONFIG_SECTION);
      await config.update("userConsentGiven", consented, vscode.ConfigurationTarget.Workspace);
      if (timestamp) {
        await config.update("consentTimestamp", timestamp, vscode.ConfigurationTarget.Workspace);
      }
    } else {
      this.inMemoryState.userConsentGiven = consented;
      this.inMemoryState.consentTimestamp = timestamp;
    }
  }

  /**
   * Set local-only mode
   * Requirement: REQ-9.2
   * @param enabled - Whether to enable local-only mode
   */
  public async setLocalOnlyMode(enabled: boolean): Promise<void> {
    if (this.isVSCodeAvailable() && vscode) {
      const config = vscode.workspace.getConfiguration(ConsentManager.CONFIG_SECTION);
      await config.update("localOnlyMode", enabled, vscode.ConfigurationTarget.Workspace);
    } else {
      this.inMemoryState.localOnlyMode = enabled;
    }
  }

  /**
   * Revoke consent
   * @returns Promise that resolves when consent is revoked
   */
  public async revokeConsent(): Promise<void> {
    await this.setConsent(false);
  }

  /**
   * Check if consent dialog has been shown this session
   * @returns true if dialog was shown
   */
  public wasConsentDialogShown(): boolean {
    return this.consentDialogShownThisSession;
  }

  /**
   * Reset session state (for testing)
   */
  public resetSessionState(): void {
    this.consentDialogShownThisSession = false;
  }

  /**
   * Require consent before proceeding with external request
   * Shows dialog if consent not given and not in local-only mode
   * Requirement: REQ-9.1
   * @param options - Dialog options
   * @returns ConsentCheckResult after potentially showing dialog
   */
  public async requireConsentForExternalRequest(
    options: ConsentDialogOptions = {}
  ): Promise<ConsentCheckResult> {
    // First check current state
    const checkResult = this.checkExternalRequestAllowed();
    
    // If local-only mode, don't show dialog
    if (checkResult.reason === "LOCAL_ONLY_MODE") {
      return checkResult;
    }

    // If no consent and dialog not shown this session, show it
    if (!checkResult.allowed && !this.consentDialogShownThisSession) {
      const consented = await this.showConsentDialog(options);
      if (consented) {
        return { allowed: true };
      }
    }

    return this.checkExternalRequestAllowed();
  }

  /**
   * Create a consent-related error
   */
  private createConsentError(
    message: string,
    reason: "NO_CONSENT" | "LOCAL_ONLY_MODE"
  ): AnalysisError {
    const recoveryActions: Record<string, string> = {
      NO_CONSENT: "Grant consent for external endpoint access in the settings or when prompted.",
      LOCAL_ONLY_MODE: "Disable local-only mode in settings to allow external endpoint access.",
    };

    return {
      code: "CONSENT_REQUIRED",
      message,
      details: {},
      recoveryAction: recoveryActions[reason],
      retryable: false,
    };
  }

  /**
   * Set in-memory state directly (for testing)
   */
  public setInMemoryState(state: Partial<ConsentState>): void {
    this.inMemoryState = { ...this.inMemoryState, ...state };
  }

  /**
   * Get in-memory state (for testing)
   */
  public getInMemoryState(): ConsentState {
    return { ...this.inMemoryState };
  }

  /**
   * Check if cloud endpoint UI controls should be disabled
   * Requirement: REQ-9.2
   * @returns true if cloud controls should be disabled
   */
  public shouldDisableCloudControls(): boolean {
    return this.isLocalOnlyMode();
  }

  /**
   * Get the list of UI elements that should be disabled in local-only mode
   * Requirement: REQ-9.2
   * @returns Array of UI element identifiers to disable
   */
  public getDisabledUIElements(): string[] {
    if (!this.isLocalOnlyMode()) {
      return [];
    }
    return [
      "cloudEndpointUrl",
      "useCloudInference",
      "cloudModelSelector",
      "cloudEndpointSettings",
    ];
  }

  /**
   * Validate that a request can proceed based on consent and mode
   * Throws an error if the request should be blocked
   * Requirement: REQ-9.1, REQ-9.2
   * @param isExternalRequest - Whether the request targets external endpoints
   * @throws AnalysisError if request is blocked
   */
  public validateRequest(isExternalRequest: boolean): void {
    if (!isExternalRequest) {
      return; // Local requests are always allowed
    }

    const checkResult = this.checkExternalRequestAllowed();
    if (!checkResult.allowed && checkResult.error) {
      throw checkResult.error;
    }
  }
}

/**
 * Create a consent manager instance
 */
export function createConsentManager(): ConsentManager {
  return new ConsentManager();
}
