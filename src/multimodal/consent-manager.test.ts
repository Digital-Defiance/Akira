/**
 * Unit Tests for Consent Manager
 * Feature: multimodal-input
 * 
 * Tests for ConsentManager component that handles user consent
 * for external endpoint access and local-only mode enforcement.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  ConsentManager,
  __setVSCodeForTesting,
  ConsentState,
} from "./consent-manager";

// Mock VS Code module
const mockConfig = {
  get: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
};

const mockVSCode = {
  workspace: {
    getConfiguration: vi.fn().mockReturnValue(mockConfig),
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  ConfigurationTarget: {
    Workspace: 2,
  },
};

describe("ConsentManager", () => {
  let consentManager: ConsentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, defaultValue: unknown) => defaultValue);
    __setVSCodeForTesting(mockVSCode);
    consentManager = new ConsentManager();
  });

  afterEach(() => {
    __setVSCodeForTesting(undefined);
  });

  describe("getConsentState", () => {
    it("should return default state when no settings configured", () => {
      const state = consentManager.getConsentState();
      
      expect(state.userConsentGiven).toBe(false);
      expect(state.localOnlyMode).toBe(false);
      expect(state.consentTimestamp).toBeUndefined();
    });

    it("should return configured state from workspace settings", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "userConsentGiven") return true;
        if (key === "consentTimestamp") return "2024-01-15T10:00:00.000Z";
        if (key === "localOnlyMode") return false;
        return undefined;
      });

      const state = consentManager.getConsentState();
      
      expect(state.userConsentGiven).toBe(true);
      expect(state.consentTimestamp).toBe("2024-01-15T10:00:00.000Z");
      expect(state.localOnlyMode).toBe(false);
    });

    it("should return in-memory state when VS Code not available", () => {
      __setVSCodeForTesting(undefined);
      const manager = new ConsentManager();
      
      manager.setInMemoryState({
        userConsentGiven: true,
        localOnlyMode: true,
      });

      const state = manager.getConsentState();
      
      expect(state.userConsentGiven).toBe(true);
      expect(state.localOnlyMode).toBe(true);
    });
  });

  describe("hasConsent", () => {
    it("should return false when consent not given", () => {
      mockConfig.get.mockReturnValue(false);
      
      expect(consentManager.hasConsent()).toBe(false);
    });

    it("should return true when consent given", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "userConsentGiven") return true;
        return false;
      });
      
      expect(consentManager.hasConsent()).toBe(true);
    });
  });

  describe("isLocalOnlyMode", () => {
    it("should return false when local-only mode disabled", () => {
      mockConfig.get.mockReturnValue(false);
      
      expect(consentManager.isLocalOnlyMode()).toBe(false);
    });

    it("should return true when local-only mode enabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });
      
      expect(consentManager.isLocalOnlyMode()).toBe(true);
    });
  });

  describe("checkExternalRequestAllowed", () => {
    it("should block request when local-only mode enabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        if (key === "userConsentGiven") return true; // Even with consent
        return false;
      });

      const result = consentManager.checkExternalRequestAllowed();
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LOCAL_ONLY_MODE");
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("CONSENT_REQUIRED");
    });

    it("should block request when consent not given", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        if (key === "userConsentGiven") return false;
        return false;
      });

      const result = consentManager.checkExternalRequestAllowed();
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("NO_CONSENT");
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("CONSENT_REQUIRED");
    });

    it("should allow request when consent given and not local-only", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        if (key === "userConsentGiven") return true;
        return false;
      });

      const result = consentManager.checkExternalRequestAllowed();
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe("setConsent", () => {
    it("should persist consent to workspace settings", async () => {
      await consentManager.setConsent(true);
      
      expect(mockConfig.update).toHaveBeenCalledWith(
        "userConsentGiven",
        true,
        mockVSCode.ConfigurationTarget.Workspace
      );
      expect(mockConfig.update).toHaveBeenCalledWith(
        "consentTimestamp",
        expect.any(String),
        mockVSCode.ConfigurationTarget.Workspace
      );
    });

    it("should not set timestamp when revoking consent", async () => {
      await consentManager.setConsent(false);
      
      expect(mockConfig.update).toHaveBeenCalledWith(
        "userConsentGiven",
        false,
        mockVSCode.ConfigurationTarget.Workspace
      );
      // Should only be called once for userConsentGiven
      expect(mockConfig.update).toHaveBeenCalledTimes(1);
    });

    it("should update in-memory state when VS Code not available", async () => {
      __setVSCodeForTesting(undefined);
      const manager = new ConsentManager();
      
      await manager.setConsent(true);
      
      const state = manager.getInMemoryState();
      expect(state.userConsentGiven).toBe(true);
      expect(state.consentTimestamp).toBeDefined();
    });
  });

  describe("setLocalOnlyMode", () => {
    it("should persist local-only mode to workspace settings", async () => {
      await consentManager.setLocalOnlyMode(true);
      
      expect(mockConfig.update).toHaveBeenCalledWith(
        "localOnlyMode",
        true,
        mockVSCode.ConfigurationTarget.Workspace
      );
    });

    it("should update in-memory state when VS Code not available", async () => {
      __setVSCodeForTesting(undefined);
      const manager = new ConsentManager();
      
      await manager.setLocalOnlyMode(true);
      
      const state = manager.getInMemoryState();
      expect(state.localOnlyMode).toBe(true);
    });
  });

  describe("showConsentDialog", () => {
    it("should show dialog and return true when user accepts", async () => {
      mockVSCode.window.showInformationMessage.mockResolvedValue("Yes, I consent");
      
      const result = await consentManager.showConsentDialog();
      
      expect(result).toBe(true);
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalled();
      expect(mockConfig.update).toHaveBeenCalledWith(
        "userConsentGiven",
        true,
        mockVSCode.ConfigurationTarget.Workspace
      );
    });

    it("should show dialog and return false when user declines", async () => {
      mockVSCode.window.showInformationMessage.mockResolvedValue("No, keep local only");
      
      const result = await consentManager.showConsentDialog();
      
      expect(result).toBe(false);
      expect(mockConfig.update).toHaveBeenCalledWith(
        "userConsentGiven",
        false,
        mockVSCode.ConfigurationTarget.Workspace
      );
    });

    it("should use custom dialog options", async () => {
      mockVSCode.window.showInformationMessage.mockResolvedValue("Accept");
      
      await consentManager.showConsentDialog({
        title: "Custom Title",
        message: "Custom message",
        acceptLabel: "Accept",
        declineLabel: "Decline",
      });
      
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledWith(
        "Custom message",
        { modal: true, detail: "Custom Title" },
        "Accept",
        "Decline"
      );
    });

    it("should mark dialog as shown this session", async () => {
      mockVSCode.window.showInformationMessage.mockResolvedValue(undefined);
      
      expect(consentManager.wasConsentDialogShown()).toBe(false);
      
      await consentManager.showConsentDialog();
      
      expect(consentManager.wasConsentDialogShown()).toBe(true);
    });
  });

  describe("requireConsentForExternalRequest", () => {
    it("should return allowed when consent already given", async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "userConsentGiven") return true;
        if (key === "localOnlyMode") return false;
        return false;
      });

      const result = await consentManager.requireConsentForExternalRequest();
      
      expect(result.allowed).toBe(true);
      expect(mockVSCode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it("should show dialog when consent not given", async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "userConsentGiven") return false;
        if (key === "localOnlyMode") return false;
        return false;
      });
      mockVSCode.window.showInformationMessage.mockResolvedValue("Yes, I consent");

      const result = await consentManager.requireConsentForExternalRequest();
      
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    it("should not show dialog when local-only mode enabled", async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });

      const result = await consentManager.requireConsentForExternalRequest();
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LOCAL_ONLY_MODE");
      expect(mockVSCode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it("should not show dialog twice in same session", async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "userConsentGiven") return false;
        if (key === "localOnlyMode") return false;
        return false;
      });
      mockVSCode.window.showInformationMessage.mockResolvedValue(undefined);

      // First call shows dialog
      await consentManager.requireConsentForExternalRequest();
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledTimes(1);

      // Second call should not show dialog again
      await consentManager.requireConsentForExternalRequest();
      expect(mockVSCode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("revokeConsent", () => {
    it("should revoke consent", async () => {
      await consentManager.revokeConsent();
      
      expect(mockConfig.update).toHaveBeenCalledWith(
        "userConsentGiven",
        false,
        mockVSCode.ConfigurationTarget.Workspace
      );
    });
  });

  describe("resetSessionState", () => {
    it("should reset session state", async () => {
      mockVSCode.window.showInformationMessage.mockResolvedValue(undefined);
      
      await consentManager.showConsentDialog();
      expect(consentManager.wasConsentDialogShown()).toBe(true);
      
      consentManager.resetSessionState();
      expect(consentManager.wasConsentDialogShown()).toBe(false);
    });
  });

  describe("shouldDisableCloudControls", () => {
    it("should return true when local-only mode enabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });

      expect(consentManager.shouldDisableCloudControls()).toBe(true);
    });

    it("should return false when local-only mode disabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        return false;
      });

      expect(consentManager.shouldDisableCloudControls()).toBe(false);
    });
  });

  describe("getDisabledUIElements", () => {
    it("should return cloud UI elements when local-only mode enabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });

      const elements = consentManager.getDisabledUIElements();
      
      expect(elements).toContain("cloudEndpointUrl");
      expect(elements).toContain("useCloudInference");
      expect(elements).toContain("cloudModelSelector");
      expect(elements).toContain("cloudEndpointSettings");
    });

    it("should return empty array when local-only mode disabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        return false;
      });

      const elements = consentManager.getDisabledUIElements();
      
      expect(elements).toHaveLength(0);
    });
  });

  describe("validateRequest", () => {
    it("should not throw for local requests", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });

      expect(() => consentManager.validateRequest(false)).not.toThrow();
    });

    it("should throw for external requests when local-only mode enabled", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return true;
        return false;
      });

      expect(() => consentManager.validateRequest(true)).toThrow();
    });

    it("should throw for external requests when consent not given", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        if (key === "userConsentGiven") return false;
        return false;
      });

      expect(() => consentManager.validateRequest(true)).toThrow();
    });

    it("should not throw for external requests when consent given", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "localOnlyMode") return false;
        if (key === "userConsentGiven") return true;
        return false;
      });

      expect(() => consentManager.validateRequest(false)).not.toThrow();
      expect(() => consentManager.validateRequest(true)).not.toThrow();
    });
  });
});
