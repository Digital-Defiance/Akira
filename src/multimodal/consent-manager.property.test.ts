/**
 * Property-Based Tests for Consent Manager
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the ConsentManager component.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  ConsentManager,
  __setVSCodeForTesting,
  ConsentState,
} from "./consent-manager";

describe("ConsentManager Property Tests", () => {
  let consentManager: ConsentManager;

  beforeEach(() => {
    __setVSCodeForTesting(undefined); // Use in-memory state for property tests
    consentManager = new ConsentManager();
  });

  afterEach(() => {
    __setVSCodeForTesting(undefined);
  });

  describe("Feature: multimodal-input, Property 23: External Call Consent Enforcement", () => {
    /**
     * **Validates: Requirements REQ-9.1, REQ-9.2**
     * 
     * For any analysis request targeting external endpoints, the system SHALL block 
     * the request if user consent has not been given or if local-only mode is enabled.
     */

    it("should block external requests when consent not given (REQ-9.1)", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random consent states where userConsentGiven is false
          fc.record({
            userConsentGiven: fc.constant(false),
            localOnlyMode: fc.boolean(),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }),
          async (state: ConsentState) => {
            consentManager.setInMemoryState(state);

            const result = consentManager.checkExternalRequestAllowed();

            // Property: External requests should be blocked when consent not given
            expect(result.allowed).toBe(false);
            
            // Should have appropriate reason
            if (state.localOnlyMode) {
              expect(result.reason).toBe("LOCAL_ONLY_MODE");
            } else {
              expect(result.reason).toBe("NO_CONSENT");
            }
            
            // Should have error with CONSENT_REQUIRED code
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe("CONSENT_REQUIRED");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should block external requests when local-only mode enabled regardless of consent (REQ-9.2)", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random consent states where localOnlyMode is true
          fc.record({
            userConsentGiven: fc.boolean(), // Can be true or false
            localOnlyMode: fc.constant(true),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }),
          async (state: ConsentState) => {
            consentManager.setInMemoryState(state);

            const result = consentManager.checkExternalRequestAllowed();

            // Property: External requests should always be blocked in local-only mode
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("LOCAL_ONLY_MODE");
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe("CONSENT_REQUIRED");
            expect(result.error?.message).toContain("local-only mode");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should allow external requests only when consent given AND not in local-only mode", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate all possible consent state combinations
          fc.record({
            userConsentGiven: fc.boolean(),
            localOnlyMode: fc.boolean(),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }),
          async (state: ConsentState) => {
            consentManager.setInMemoryState(state);

            const result = consentManager.checkExternalRequestAllowed();

            // Property: Request allowed iff consent given AND not local-only
            const expectedAllowed = state.userConsentGiven && !state.localOnlyMode;
            expect(result.allowed).toBe(expectedAllowed);

            if (expectedAllowed) {
              expect(result.reason).toBeUndefined();
              expect(result.error).toBeUndefined();
            } else {
              expect(result.reason).toBeDefined();
              expect(result.error).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should prioritize local-only mode check over consent check", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate states where both conditions would block
          fc.record({
            userConsentGiven: fc.constant(false),
            localOnlyMode: fc.constant(true),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }),
          async (state: ConsentState) => {
            consentManager.setInMemoryState(state);

            const result = consentManager.checkExternalRequestAllowed();

            // Property: Local-only mode should be checked first
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("LOCAL_ONLY_MODE");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should provide recovery action in error for blocked requests", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate states that would block requests
          fc.record({
            userConsentGiven: fc.boolean(),
            localOnlyMode: fc.boolean(),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }).filter(state => !state.userConsentGiven || state.localOnlyMode),
          async (state: ConsentState) => {
            consentManager.setInMemoryState(state);

            const result = consentManager.checkExternalRequestAllowed();

            // Property: Blocked requests should have recovery action
            expect(result.allowed).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.recoveryAction).toBeDefined();
            expect(result.error?.recoveryAction?.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should correctly validate requests based on external flag", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate consent states
          fc.record({
            userConsentGiven: fc.boolean(),
            localOnlyMode: fc.boolean(),
            consentTimestamp: fc.option(fc.date().map(d => d.toISOString())),
          }),
          // Generate whether request is external
          fc.boolean(),
          async (state: ConsentState, isExternalRequest: boolean) => {
            consentManager.setInMemoryState(state);

            const shouldBlock = isExternalRequest && (!state.userConsentGiven || state.localOnlyMode);

            if (shouldBlock) {
              // Property: Should throw for blocked external requests
              expect(() => consentManager.validateRequest(isExternalRequest)).toThrow();
            } else {
              // Property: Should not throw for allowed requests
              expect(() => consentManager.validateRequest(isExternalRequest)).not.toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should disable cloud UI controls when local-only mode enabled (REQ-9.2)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // localOnlyMode
          async (localOnlyMode: boolean) => {
            consentManager.setInMemoryState({
              userConsentGiven: true,
              localOnlyMode,
            });

            const shouldDisable = consentManager.shouldDisableCloudControls();
            const disabledElements = consentManager.getDisabledUIElements();

            // Property: Cloud controls disabled iff local-only mode enabled
            expect(shouldDisable).toBe(localOnlyMode);
            
            if (localOnlyMode) {
              expect(disabledElements.length).toBeGreaterThan(0);
              expect(disabledElements).toContain("cloudEndpointUrl");
              expect(disabledElements).toContain("useCloudInference");
            } else {
              expect(disabledElements).toHaveLength(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should persist consent state correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // consent value
          async (consented: boolean) => {
            await consentManager.setConsent(consented);
            const state = consentManager.getInMemoryState();

            // Property: Consent state should match what was set
            expect(state.userConsentGiven).toBe(consented);
            
            if (consented) {
              expect(state.consentTimestamp).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should persist local-only mode correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // localOnlyMode value
          async (enabled: boolean) => {
            await consentManager.setLocalOnlyMode(enabled);
            const state = consentManager.getInMemoryState();

            // Property: Local-only mode should match what was set
            expect(state.localOnlyMode).toBe(enabled);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
