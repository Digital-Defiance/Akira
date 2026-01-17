/**
 * Property-Based Tests for Concurrency Manager
 * Feature: multimodal-input
 * 
 * These tests validate the correctness properties defined in the design document
 * for the ConcurrencyManager component.
 * 
 * **Validates: Requirements REQ-7.3**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { 
  ConcurrencyManager, 
  ConcurrencyError
} from "./concurrency-manager";
import { AnalysisRequest, AnalysisResult } from "./types";

describe("ConcurrencyManager Property Tests", () => {
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

  const createRequest = (index: number, workspaceRoot: string): AnalysisRequest => ({
    imagePath: `/test/image${index}.png`,
    mimeType: "image/png",
    fileSize: 1000,
    modelId: "test-model",
    confidenceThreshold: 50,
    inferenceMode: "local",
    workspaceRoot,
  });

  // Helper to create a controllable deferred promise
  interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
  }
  
  const createDeferred = (): Deferred => {
    let resolveFunc: () => void = () => {};
    const promise = new Promise<void>(resolve => {
      resolveFunc = resolve;
    });
    return { promise, resolve: resolveFunc };
  };

  describe("Feature: multimodal-input, Property 19: Concurrency Limit and FIFO Queuing", () => {
    /**
     * **Validates: Requirements REQ-7.3**
     * 
     * For any set of concurrent analysis requests exceeding 10, the system SHALL 
     * process 10 concurrently and queue up to 5 additional requests in FIFO order.
     */

    it("should enforce maxConcurrent limit during execution", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (maxConcurrent) => {
            const manager = new ConcurrencyManager({ maxConcurrent, queueLimit: 10 });
            const workspaceRoot = "/workspace/test";
            
            // Track concurrent executions
            let currentConcurrent = 0;
            let maxObservedConcurrent = 0;
            
            const createExecutor = () => async (req: AnalysisRequest) => {
              currentConcurrent++;
              maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);
              
              // Small delay to allow concurrent execution
              await new Promise(resolve => setTimeout(resolve, 5));
              
              currentConcurrent--;
              return createMockResult(req);
            };
            
            // Submit exactly maxConcurrent requests
            const requests: AnalysisRequest[] = [];
            for (let i = 0; i < maxConcurrent; i++) {
              requests.push(createRequest(i, workspaceRoot));
            }
            
            const promises = requests.map(req => manager.submit(req, createExecutor()));
            await Promise.all(promises);
            
            // Property: concurrent executions should not exceed maxConcurrent
            expect(maxObservedConcurrent).toBeLessThanOrEqual(maxConcurrent);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should reject requests when queue is full", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxConcurrent, queueLimit) => {
            const manager = new ConcurrencyManager({ maxConcurrent, queueLimit });
            const workspaceRoot = "/workspace/test";
            
            // Create deferreds upfront so we can control them
            const deferreds: Deferred[] = [];
            for (let i = 0; i < maxConcurrent + queueLimit + 1; i++) {
              deferreds.push(createDeferred());
            }
            
            let deferredIndex = 0;
            const createBlockingExecutor = () => async (req: AnalysisRequest) => {
              const deferred = deferreds[deferredIndex++];
              await deferred.promise;
              return createMockResult(req);
            };
            
            // Fill up concurrent slots and queue
            const totalAcceptable = maxConcurrent + queueLimit;
            const promises: Promise<AnalysisResult>[] = [];
            
            for (let i = 0; i < totalAcceptable; i++) {
              promises.push(manager.submit(createRequest(i, workspaceRoot), createBlockingExecutor()));
            }
            
            // Wait for all submissions to register
            await new Promise(resolve => setTimeout(resolve, 20));
            
            // Property: one more request should be rejected synchronously
            let rejected = false;
            let errorCode: string | undefined;
            
            try {
              // This should throw immediately since queue is full
              await manager.submit(createRequest(999, workspaceRoot), createBlockingExecutor());
            } catch (error) {
              if (error instanceof ConcurrencyError) {
                rejected = true;
                errorCode = error.code;
              }
            }
            
            // Property: request should be rejected with QUEUE_FULL error
            expect(rejected).toBe(true);
            expect(errorCode).toBe("QUEUE_FULL");
            
            // Cleanup: resolve all blocking executors
            deferreds.forEach(d => d.resolve());
            await Promise.all(promises);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should process queued requests in FIFO order", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (queueSize) => {
            const manager = new ConcurrencyManager({ maxConcurrent: 1, queueLimit: queueSize });
            const workspaceRoot = "/workspace/test";
            
            // Track execution order
            const executionOrder: number[] = [];
            
            // Create deferred for first request only
            const firstDeferred = createDeferred();
            
            const createExecutor = (index: number) => async (req: AnalysisRequest) => {
              if (index === 0) {
                // First request blocks until we release it
                await firstDeferred.promise;
              }
              executionOrder.push(index);
              return createMockResult(req);
            };
            
            // Submit first request (will block) plus queued requests
            const promises: Promise<AnalysisResult>[] = [];
            for (let i = 0; i <= queueSize; i++) {
              promises.push(manager.submit(createRequest(i, workspaceRoot), createExecutor(i)));
            }
            
            // Wait for all to be submitted
            await new Promise(resolve => setTimeout(resolve, 20));
            
            // Property: first request should be active, rest should be queued
            expect(manager.getActiveCount(workspaceRoot)).toBe(1);
            expect(manager.getQueuedCount(workspaceRoot)).toBe(queueSize);
            
            // Release the first request
            firstDeferred.resolve();
            
            // Wait for all to complete
            await Promise.all(promises);
            
            // Property: execution order should be FIFO (0, 1, 2, 3, ...)
            for (let i = 0; i < executionOrder.length; i++) {
              expect(executionOrder[i]).toBe(i);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should correctly track active and queued counts", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxConcurrent, queueLimit) => {
            const manager = new ConcurrencyManager({ maxConcurrent, queueLimit });
            const workspaceRoot = "/workspace/test";
            
            // Initially should have zero counts
            expect(manager.getActiveCount(workspaceRoot)).toBe(0);
            expect(manager.getQueuedCount(workspaceRoot)).toBe(0);
            expect(manager.canAccept(workspaceRoot)).toBe(true);
            
            // Create deferreds upfront
            const totalCapacity = maxConcurrent + queueLimit;
            const deferreds: Deferred[] = [];
            for (let i = 0; i < totalCapacity; i++) {
              deferreds.push(createDeferred());
            }
            
            let deferredIndex = 0;
            const createBlockingExecutor = () => async (req: AnalysisRequest) => {
              const deferred = deferreds[deferredIndex++];
              await deferred.promise;
              return createMockResult(req);
            };
            
            // Fill up to capacity
            const promises: Promise<AnalysisResult>[] = [];
            
            for (let i = 0; i < totalCapacity; i++) {
              promises.push(manager.submit(createRequest(i, workspaceRoot), createBlockingExecutor()));
            }
            
            // Wait for submissions
            await new Promise(resolve => setTimeout(resolve, 20));
            
            // Property: counts should reflect capacity
            expect(manager.getActiveCount(workspaceRoot)).toBe(maxConcurrent);
            expect(manager.getQueuedCount(workspaceRoot)).toBe(queueLimit);
            
            // Property: should not accept when at capacity
            expect(manager.canAccept(workspaceRoot)).toBe(false);
            
            // Cleanup
            deferreds.forEach(d => d.resolve());
            await Promise.all(promises);
            
            // Property: should accept again after completion
            expect(manager.canAccept(workspaceRoot)).toBe(true);
            expect(manager.getActiveCount(workspaceRoot)).toBe(0);
            expect(manager.getQueuedCount(workspaceRoot)).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should maintain separate queues per workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }),
          fc.integer({ min: 1, max: 2 }),
          async (maxConcurrent, queueLimit) => {
            const manager = new ConcurrencyManager({ maxConcurrent, queueLimit });
            const workspace1 = "/workspace/one";
            const workspace2 = "/workspace/two";
            
            // Create deferreds upfront for both workspaces
            const totalPerWorkspace = maxConcurrent + queueLimit;
            const deferreds1: Deferred[] = [];
            const deferreds2: Deferred[] = [];
            for (let i = 0; i < totalPerWorkspace; i++) {
              deferreds1.push(createDeferred());
              deferreds2.push(createDeferred());
            }
            
            let deferredIndex1 = 0;
            let deferredIndex2 = 0;
            
            const createBlockingExecutor1 = () => async (req: AnalysisRequest) => {
              const deferred = deferreds1[deferredIndex1++];
              await deferred.promise;
              return createMockResult(req);
            };
            
            const createBlockingExecutor2 = () => async (req: AnalysisRequest) => {
              const deferred = deferreds2[deferredIndex2++];
              await deferred.promise;
              return createMockResult(req);
            };
            
            // Submit requests to both workspaces
            const promises1: Promise<AnalysisResult>[] = [];
            const promises2: Promise<AnalysisResult>[] = [];
            
            for (let i = 0; i < totalPerWorkspace; i++) {
              promises1.push(manager.submit(createRequest(i, workspace1), createBlockingExecutor1()));
              promises2.push(manager.submit(createRequest(i, workspace2), createBlockingExecutor2()));
            }
            
            // Wait for submissions
            await new Promise(resolve => setTimeout(resolve, 20));
            
            // Property: each workspace should have independent counts
            expect(manager.getActiveCount(workspace1)).toBe(maxConcurrent);
            expect(manager.getQueuedCount(workspace1)).toBe(queueLimit);
            expect(manager.getActiveCount(workspace2)).toBe(maxConcurrent);
            expect(manager.getQueuedCount(workspace2)).toBe(queueLimit);
            
            // Cleanup
            deferreds1.forEach(d => d.resolve());
            deferreds2.forEach(d => d.resolve());
            await Promise.all([...promises1, ...promises2]);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should cancel all pending requests when cancelAll is called", async () => {
      const manager = new ConcurrencyManager({ maxConcurrent: 1, queueLimit: 3 });
      const workspaceRoot = "/workspace/test";
      
      // Create deferred for first request
      const firstDeferred = createDeferred();
      
      const createBlockingExecutor = (isFirst: boolean) => async (req: AnalysisRequest) => {
        if (isFirst) {
          await firstDeferred.promise;
        }
        return createMockResult(req);
      };
      
      // Submit requests
      const promises: Promise<AnalysisResult>[] = [];
      for (let i = 0; i < 4; i++) {
        promises.push(manager.submit(createRequest(i, workspaceRoot), createBlockingExecutor(i === 0)));
      }
      
      // Wait for submissions
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should have 1 active and 3 queued
      expect(manager.getActiveCount(workspaceRoot)).toBe(1);
      expect(manager.getQueuedCount(workspaceRoot)).toBe(3);
      
      // Cancel all pending
      manager.cancelAll(workspaceRoot);
      
      // Queue should be empty
      expect(manager.getQueuedCount(workspaceRoot)).toBe(0);
      
      // Release first request
      firstDeferred.resolve();
      
      // Wait for first to complete, others should have been cancelled
      const results = await Promise.allSettled(promises);
      
      // First should succeed, rest should be rejected
      expect(results[0].status).toBe("fulfilled");
      for (let i = 1; i < results.length; i++) {
        expect(results[i].status).toBe("rejected");
      }
    });
  });
});
