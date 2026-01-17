/**
 * Property-Based Tests for Offline Queue Manager
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the OfflineQueueManager component.
 * 
 * **Validates: Requirements REQ-6.3**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  OfflineQueueManager,
  OfflineQueueError,
} from "./offline-queue-manager";
import { AnalysisRequest, AnalysisResult } from "./types";

describe("OfflineQueueManager Property Tests", () => {
  let requestIdCounter = 0;
  
  const createMockResult = (request: AnalysisRequest): AnalysisResult => ({
    id: `result-${++requestIdCounter}`,
    imagePath: request.imagePath,
    timestamp: new Date().toISOString(),
    modelId: request.modelId,
    inferenceMode: request.inferenceMode,
    duration: 100,
    labels: [{ label: "test", confidence: 0.9 }],
  });

  const createRequest = (index: number, workspaceRoot: string = "/workspace/test"): AnalysisRequest => ({
    imagePath: `/test/image${index}.png`,
    mimeType: "image/png",
    fileSize: 1000,
    modelId: "test-model",
    confidenceThreshold: 50,
    inferenceMode: "cloud",
    workspaceRoot,
  });

  describe("Feature: multimodal-input, Property 18: Offline Request Queuing", () => {
    /**
     * **Validates: Requirements REQ-6.3**
     * 
     * For any cloud analysis request made while offline, the system SHALL queue 
     * the request locally and process it when network connectivity is restored.
     */

    it("should queue requests when offline and process when online", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Set up connectivity checker to return offline
            let isOnline = false;
            manager.setConnectivityChecker(async () => isOnline);
            
            // Track execution order
            const executedRequests: number[] = [];
            
            const createExecutor = (index: number) => async (req: AnalysisRequest) => {
              executedRequests.push(index);
              return createMockResult(req);
            };
            
            // Submit requests while offline - these will be queued
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor(i)));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Property: requests should be queued when offline
            expect(manager.getQueuedCount()).toBe(numRequests);
            expect(manager.getNetworkState()).toBe("offline");
            expect(executedRequests.length).toBe(0);
            
            // Simulate coming back online
            isOnline = true;
            manager.setNetworkState("online");
            await manager.triggerQueueProcessing();
            
            // Wait for all requests to complete
            await Promise.all(promises);
            
            // Property: all requests should have been processed
            expect(executedRequests.length).toBe(numRequests);
            expect(manager.getQueuedCount()).toBe(0);
            
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should process queued requests in FIFO order when connectivity returns", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 6 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Start offline
            let isOnline = false;
            manager.setConnectivityChecker(async () => isOnline);
            
            // Track execution order
            const executionOrder: number[] = [];
            
            const createExecutor = (index: number) => async (req: AnalysisRequest) => {
              executionOrder.push(index);
              return createMockResult(req);
            };
            
            // Submit requests in order 0, 1, 2, ...
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor(i)));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Verify all are queued
            expect(manager.getQueuedCount()).toBe(numRequests);
            
            // Come back online
            isOnline = true;
            manager.setNetworkState("online");
            await manager.triggerQueueProcessing();
            
            // Wait for completion
            await Promise.all(promises);
            
            // Property: execution order should be FIFO
            for (let i = 0; i < executionOrder.length; i++) {
              expect(executionOrder[i]).toBe(i);
            }
            
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should reject requests when queue is full", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (maxQueueSize) => {
            const manager = new OfflineQueueManager({ maxQueueSize });
            
            // Start offline
            manager.setConnectivityChecker(async () => false);
            
            const createExecutor = () => async (req: AnalysisRequest) => {
              return createMockResult(req);
            };
            
            // Fill the queue
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < maxQueueSize; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor()));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Property: queue should be full
            expect(manager.getQueuedCount()).toBe(maxQueueSize);
            
            // Property: one more request should be rejected
            let rejected = false;
            let errorCode: string | undefined;
            
            try {
              await manager.submitCloudRequest(createRequest(999), createExecutor());
            } catch (error) {
              if (error instanceof OfflineQueueError) {
                rejected = true;
                errorCode = error.code;
              }
            }
            
            expect(rejected).toBe(true);
            expect(errorCode).toBe("QUEUE_FULL");
            
            // Cleanup - clear queue and wait for rejections
            manager.clearQueue();
            await Promise.allSettled(promises);
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should execute immediately when online", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Start online
            manager.setConnectivityChecker(async () => true);
            manager.setNetworkState("online");
            
            const executedRequests: number[] = [];
            
            const createExecutor = (index: number) => async (req: AnalysisRequest) => {
              executedRequests.push(index);
              return createMockResult(req);
            };
            
            // Submit requests while online
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor(i)));
            }
            
            // Wait for all to complete
            await Promise.all(promises);
            
            // Property: all requests should have been executed immediately (not queued)
            expect(executedRequests.length).toBe(numRequests);
            expect(manager.getQueuedCount()).toBe(0);
            
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should queue request if execution fails due to network error", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Start online but executor will fail with network error
            let isOnline = true;
            let shouldFail = true;
            manager.setConnectivityChecker(async () => isOnline);
            manager.setNetworkState("online");
            
            const executedRequests: number[] = [];
            
            const createExecutor = (index: number) => async (req: AnalysisRequest) => {
              if (shouldFail) {
                // Simulate network error
                const error = new Error("ENOTFOUND: network error");
                throw error;
              }
              executedRequests.push(index);
              return createMockResult(req);
            };
            
            // Submit requests - they should fail and get queued
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor(i)));
            }
            
            // Wait a bit for the network error to be detected
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Property: requests should be queued after network failure
            expect(manager.getQueuedCount()).toBe(numRequests);
            expect(manager.getNetworkState()).toBe("offline");
            
            // Now fix the network and process
            shouldFail = false;
            isOnline = true;
            manager.setNetworkState("online");
            await manager.triggerQueueProcessing();
            
            // Wait for completion
            await Promise.all(promises);
            
            // Property: all requests should have been processed
            expect(executedRequests.length).toBe(numRequests);
            expect(manager.getQueuedCount()).toBe(0);
            
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should update status bar callback with queue state changes", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Track status bar updates
            const statusUpdates: Array<{ count: number; state: string }> = [];
            manager.setStatusBarCallback((count, state) => {
              statusUpdates.push({ count, state });
            });
            
            // Start offline
            manager.setConnectivityChecker(async () => false);
            
            const createExecutor = () => async (req: AnalysisRequest) => {
              return createMockResult(req);
            };
            
            // Submit requests and store promises
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor()));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Property: status bar should have been updated
            expect(statusUpdates.length).toBeGreaterThan(0);
            
            // Property: last update should show correct queue count
            const lastUpdate = statusUpdates[statusUpdates.length - 1];
            expect(lastUpdate.count).toBe(numRequests);
            expect(lastUpdate.state).toBe("offline");
            
            // Cleanup - clear queue and wait for rejections
            manager.clearQueue();
            await Promise.allSettled(promises);
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should clear queue and reject pending requests on clearQueue", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Start offline
            manager.setConnectivityChecker(async () => false);
            
            const createExecutor = () => async (req: AnalysisRequest) => {
              return createMockResult(req);
            };
            
            // Submit requests
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor()));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Verify queued
            expect(manager.getQueuedCount()).toBe(numRequests);
            
            // Clear the queue
            manager.clearQueue();
            
            // Property: queue should be empty
            expect(manager.getQueuedCount()).toBe(0);
            
            // Property: all promises should be rejected
            const results = await Promise.allSettled(promises);
            for (const result of results) {
              expect(result.status).toBe("rejected");
              if (result.status === "rejected") {
                expect(result.reason).toBeInstanceOf(OfflineQueueError);
                expect((result.reason as OfflineQueueError).code).toBe("REQUEST_EXPIRED");
              }
            }
            
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should correctly report network state transitions", async () => {
      const manager = new OfflineQueueManager();
      
      // Initial state should be unknown
      expect(manager.getNetworkState()).toBe("unknown");
      
      // Set to offline
      manager.setNetworkState("offline");
      expect(manager.getNetworkState()).toBe("offline");
      expect(manager.isOnline()).toBe(false);
      
      // Set to online
      manager.setNetworkState("online");
      expect(manager.getNetworkState()).toBe("online");
      expect(manager.isOnline()).toBe(true);
      
      manager.dispose();
    });

    it("should provide queued request metadata", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numRequests) => {
            const manager = new OfflineQueueManager({ maxQueueSize: 10 });
            
            // Start offline
            manager.setConnectivityChecker(async () => false);
            
            const createExecutor = () => async (req: AnalysisRequest) => {
              return createMockResult(req);
            };
            
            // Submit requests and store promises
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i < numRequests; i++) {
              promises.push(manager.submitCloudRequest(createRequest(i), createExecutor()));
            }
            
            // Wait a tick for all async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Get queued request metadata
            const queuedRequests = manager.getQueuedRequests();
            
            // Property: should have correct number of queued requests
            expect(queuedRequests.length).toBe(numRequests);
            
            // Property: each request should have required metadata
            for (let i = 0; i < queuedRequests.length; i++) {
              expect(queuedRequests[i].id).toBeDefined();
              expect(queuedRequests[i].queuedAt).toBeDefined();
              expect(queuedRequests[i].retryCount).toBe(0);
              expect(queuedRequests[i].imagePath).toBe(`/test/image${i}.png`);
            }
            
            // Cleanup - clear queue and wait for rejections
            manager.clearQueue();
            await Promise.allSettled(promises);
            manager.dispose();
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
