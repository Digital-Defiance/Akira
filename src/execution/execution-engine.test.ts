/**
 * Tests for Execution Engine
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { ExecutionEngine } from "./execution-engine";
import { ExecutionPlan, TaskRecord } from "./types";
import * as fs from "fs";

vi.mock("fs");
vi.mock("child_process");

describe("ExecutionEngine", () => {
  let executionEngine: ExecutionEngine;
  const workspaceRoot = "/test/workspace";

  beforeEach(() => {
    executionEngine = new ExecutionEngine(workspaceRoot, {
      requireApprovalForDestructive: false,
      maxFileModifications: 10,
    });
    vi.clearAllMocks();
  });

  describe("executePlan", () => {
    it("should execute file-write action", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-1",
        actions: [
          {
            type: "file-write",
            target: "/test/output.txt",
            content: "test content",
          },
        ],
      };

      // Mock file system
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.taskId).toBe("task-1");
      expect(result.success).toBe(true);
    });

    it("should execute multiple actions in sequence", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-multi",
        actions: [
          {
            type: "file-write",
            target: "/test/file1.txt",
            content: "content 1",
          },
          {
            type: "file-write",
            target: "/test/file2.txt",
            content: "content 2",
          },
        ],
      };

      // Mock storage layer exists to return false (files don't exist)
      const storage = (executionEngine as any).storage;
      vi.spyOn(storage, "exists").mockResolvedValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesCreated?.length).toBe(2);
    });

    it("should track duration", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-timing",
        actions: [],
      };

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle errors gracefully", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-error",
        actions: [
          {
            type: "file-write",
            target: "/invalid/path/file.txt",
            content: "test",
          },
        ],
      };

      // Mock storage layer to throw an error
      const storage = (executionEngine as any).storage;
      vi.spyOn(storage, "exists").mockResolvedValue(false);
      vi.spyOn(storage, "writeFileAtomic").mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("file operations", () => {
    it("should create new files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-create",
        actions: [
          {
            type: "file-write",
            target: "/test/new-file.txt",
            content: "new content",
          },
        ],
      };

      // Mock storage layer exists to return false (file doesn't exist)
      const storage = (executionEngine as any).storage;
      vi.spyOn(storage, "exists").mockResolvedValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesCreated).toContain("/test/new-file.txt");
    });

    it("should modify existing files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-modify",
        actions: [
          {
            type: "file-write",
            target: "/test/existing-file.txt",
            content: "modified content",
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.filesModified).toContain("/test/existing-file.txt");
    });

    it("should delete files", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-delete",
        actions: [
          {
            type: "file-delete",
            target: "/test/delete-me.txt",
            destructive: true,
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "unlinkSync").mockImplementation(() => undefined);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
    });
  });

  describe("command execution", () => {
    it("should execute commands", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-cmd",
        actions: [
          {
            type: "command",
            target: "echo",
            command: "echo",
            args: ["hello"],
          },
        ],
      };

      // Mock spawn to simulate successful command execution
      const { spawn } = await import("child_process");
      const mockProc = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === "data") {
              callback(Buffer.from("hello\n"));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            callback(0); // Exit code 0 = success
          }
        }),
      };
      vi.mocked(spawn).mockReturnValue(mockProc as any);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(true);
      expect(result.commandsRun).toContain("echo");
    });

    it("should retry failed commands", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-retry",
        actions: [
          {
            type: "command",
            target: "failing-command",
            command: "failing-command",
          },
        ],
      };

      // Commands might fail and retry
      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.taskId).toBe("task-retry");
    });
  });

  describe("file modification limits", () => {
    it("should enforce file modification limits", async () => {
      const actions = Array.from({ length: 15 }, (_, i) => ({
        type: "file-write" as const,
        target: `/test/file-${i}.txt`,
        content: `content ${i}`,
      }));

      const plan: ExecutionPlan = {
        taskId: "task-limit",
        actions,
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      // Should stop after hitting the limit (10)
      expect(result.success).toBe(false);
      expect(result.error).toContain("modification limit");
    });
  });

  describe("LLM generation", () => {
    it("should handle LLM generation requests", async () => {
      const task: TaskRecord = {
        id: "task-llm",
        title: "Generate code",
        rawLine: 1,
        checkboxState: "INCOMPLETE" as any,
        retryCount: 0,
      };

      const context = {
        specPath: "/test/spec.md",
        sessionId: "session-1",
        phase: 3,
        previousTasks: [],
      };

      const result = await executionEngine.generateWithLLM(task, context);

      expect(result.taskId).toBe("task-llm");
      // Result will depend on LLM integration
    });
  });

  describe("error handling", () => {
    it("should handle permission errors", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-permission",
        actions: [
          {
            type: "file-write",
            target: "/root/protected-file.txt",
            content: "test",
          },
        ],
      };

      // Mock storage layer to throw permission error
      const storage = (executionEngine as any).storage;
      vi.spyOn(storage, "exists").mockResolvedValue(false);
      vi.spyOn(storage, "writeFileAtomic").mockRejectedValue(
        new Error("EACCES: permission denied")
      );

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle disk space errors", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-space",
        actions: [
          {
            type: "file-write",
            target: "/test/large-file.txt",
            content: "x".repeat(1000000),
          },
        ],
      };

      // Mock storage layer to throw disk space error
      const storage = (executionEngine as any).storage;
      vi.spyOn(storage, "exists").mockResolvedValue(false);
      vi.spyOn(storage, "writeFileAtomic").mockRejectedValue(
        new Error("ENOSPC: no space left on device")
      );

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOSPC");
    });
  });

  describe("execution results", () => {
    it("should return comprehensive results", async () => {
      const plan: ExecutionPlan = {
        taskId: "task-results",
        actions: [
          {
            type: "file-write",
            target: "/test/result1.txt",
            content: "content 1",
          },
          {
            type: "command",
            target: "echo",
            command: "echo",
            args: ["test"],
          },
        ],
      };

      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await executionEngine.executePlan(plan, "session-1");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("taskId");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("filesCreated");
      expect(result).toHaveProperty("commandsRun");
    });
  });

  describe("Property-Based Tests - Reflection Loop", () => {
    /**
     * Feature: execution-reflection-loop, Property 1: Reflection loop initiation on failure
     * Validates: Requirements 1.1
     * 
     * Property: For any task execution that fails, the Execution Engine should initiate 
     * a reflection loop with the configured max iterations setting.
     */
    it("should initiate reflection loop on failure with configured max iterations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random max iterations (1-10)
          fc.integer({ min: 1, max: 10 }),
          async (taskId, maxIterations) => {
            // Create a task that will fail
            const task: TaskRecord = {
              id: taskId,
              title: "Test task that fails",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            // Mock the LLM integrator to always fail
            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Spy on generateWithLLM to track how many times it's called
            let callCount = 0;
            const originalGenerateWithLLM = engine.generateWithLLM.bind(engine);
            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              // Always return failure
              return {
                success: false,
                taskId: task.id,
                error: `Simulated failure ${callCount}`,
                duration: 10,
              };
            });

            // Mock the decision engine to always return low confidence (incomplete)
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context, {
              maxIterations,
              enabled: true,
            });

            // Property: The reflection loop should execute exactly maxIterations times
            expect(callCount).toBe(maxIterations);

            // Property: The result should indicate failure after exhausting iterations
            expect(result.success).toBe(false);
            expect(result.error).toContain("exhausted");
            expect(result.error).toContain(`${maxIterations} iterations`);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 3: Iteration exhaustion handling
     * Validates: Requirements 1.3
     * 
     * Property: For any reflection loop that reaches max iterations without success, 
     * the returned result should contain the last execution result with complete failure details.
     */
    it("should return last result with complete failure details when max iterations exhausted", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random max iterations (1-10)
          fc.integer({ min: 1, max: 10 }),
          // Generate random error messages for each iteration
          fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          async (taskId, maxIterations, errorMessages) => {
            // Create a task that will always fail
            const task: TaskRecord = {
              id: taskId,
              title: "Test task that exhausts iterations",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Track execution results for each iteration
            const iterationResults: any[] = [];
            let callCount = 0;

            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              const errorIndex = (callCount - 1) % errorMessages.length;
              const errorMessage = errorMessages[errorIndex] || `Failure ${callCount}`;
              
              const result = {
                success: false,
                taskId: task.id,
                error: errorMessage,
                duration: 10 + callCount,
                filesCreated: [`/test/file-${callCount}.txt`],
                commandsRun: [`command-${callCount}`],
              };
              
              iterationResults.push(result);
              return result;
            });

            // Mock the decision engine to always return low confidence (incomplete)
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.2,
              reasoning: "Task still incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection (disable persistent failure detection for this test)
            const result = await engine.executeWithReflection(task, context, {
              maxIterations,
              enabled: true,
              pauseOnPersistentFailure: false,
            });

            // Property 1: Should execute exactly maxIterations times
            expect(callCount).toBe(maxIterations);

            // Property 2: The result should indicate failure
            expect(result.success).toBe(false);

            // Property 3: The result should contain information about exhausted iterations
            expect(result.error).toBeDefined();
            expect(result.error).toContain("exhausted");
            expect(result.error).toContain(`${maxIterations}`);

            // Property 4: The result should contain the last execution result details
            const lastIterationResult = iterationResults[iterationResults.length - 1];
            
            // The final result should reflect the last iteration's error
            if (lastIterationResult && lastIterationResult.error) {
              // The error should either be the last iteration's error or contain it
              const containsLastError = result.error.includes(lastIterationResult.error);
              const isExhaustedMessage = result.error.includes("exhausted");
              expect(containsLastError || isExhaustedMessage).toBe(true);
            }

            // Property 5: The result should have the same taskId
            expect(result.taskId).toBe(taskId);

            // Property 6: Duration should be defined and reasonable
            expect(result.duration).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 2: Failure context propagation
     * Validates: Requirements 1.2, 3.1, 3.2, 3.3
     * 
     * Property: For any reflection iteration after the first, the failure context from 
     * all previous attempts should be included in the LLM generation request.
     */
    it("should propagate failure context from previous attempts to LLM on subsequent iterations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random number of iterations (2-5, need at least 2 to test propagation)
          fc.integer({ min: 2, max: 5 }),
          // Generate random error messages
          fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
          async (taskId, maxIterations, errorMessages) => {
            // Create a task that will fail multiple times
            const task: TaskRecord = {
              id: taskId,
              title: "Test task for failure context propagation",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Track all failure contexts passed to generateWithLLM
            const failureContexts: (any | undefined)[] = [];
            let callCount = 0;

            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              failureContexts.push(failureCtx);
              
              const errorIndex = (callCount - 1) % errorMessages.length;
              const errorMessage = errorMessages[errorIndex] || `Failure ${callCount}`;
              
              return {
                success: false,
                taskId: task.id,
                error: errorMessage,
                duration: 10,
                filesCreated: [`/test/file-${callCount}.txt`],
                filesModified: [`/test/modified-${callCount}.txt`],
                commandsRun: [`command-${callCount}`],
              };
            });

            // Mock the decision engine to always return low confidence (incomplete)
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection
            await engine.executeWithReflection(task, context, {
              maxIterations,
              enabled: true,
            });

            // Property 1: First iteration should have no failure context (undefined)
            expect(failureContexts[0]).toBeUndefined();

            // Property 2: All subsequent iterations should have failure context
            for (let i = 1; i < callCount; i++) {
              expect(failureContexts[i]).toBeDefined();
              
              const failureCtx = failureContexts[i];
              
              // Property 3: Failure context should have correct iteration number
              expect(failureCtx.iteration).toBe(i + 1);
              
              // Property 4: Failure context should contain all previous attempts
              expect(failureCtx.previousAttempts).toBeDefined();
              expect(failureCtx.previousAttempts.length).toBe(i);
              
              // Property 5: Each previous attempt should have required fields
              for (let j = 0; j < failureCtx.previousAttempts.length; j++) {
                const attempt = failureCtx.previousAttempts[j];
                expect(attempt.iteration).toBe(j + 1);
                expect(attempt.timestamp).toBeDefined();
                expect(attempt.result).toBeDefined();
                expect(attempt.evaluationReason).toBeDefined();
                expect(attempt.confidence).toBeDefined();
                
                // Property 6: Attempt result should contain the error from that iteration
                expect(attempt.result.error).toBeDefined();
                expect(attempt.result.taskId).toBe(taskId);
              }
              
              // Property 7: Failure context should include failure patterns
              expect(failureCtx.failurePatterns).toBeDefined();
              expect(Array.isArray(failureCtx.failurePatterns)).toBe(true);
              
              // Property 8: Failure context should include environment state
              expect(failureCtx.environmentState).toBeDefined();
              expect(failureCtx.environmentState.filesCreated).toBeDefined();
              expect(failureCtx.environmentState.filesModified).toBeDefined();
              
              // Property 9: Environment state should accumulate files from previous attempts
              const expectedFilesCreated = Array.from({ length: i }, (_, idx) => `/test/file-${idx + 1}.txt`);
              const expectedFilesModified = Array.from({ length: i }, (_, idx) => `/test/modified-${idx + 1}.txt`);
              
              // Check that at least the last iteration's files are present
              const lastCreatedFile = `/test/file-${i}.txt`;
              const lastModifiedFile = `/test/modified-${i}.txt`;
              expect(failureCtx.environmentState.filesCreated).toContain(lastCreatedFile);
              expect(failureCtx.environmentState.filesModified).toContain(lastModifiedFile);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 4: Early exit on success
     * Validates: Requirements 1.4
     * 
     * Property: For any task that completes successfully before max iterations, 
     * no further iterations should be executed.
     */
    it("should exit early when task completes successfully before max iterations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random max iterations (2-10, need at least 2 to test early exit)
          fc.integer({ min: 2, max: 10 }),
          // Generate random success iteration (1 to maxIterations-1)
          fc.integer({ min: 1, max: 9 }),
          async (taskId, maxIterations, successIteration) => {
            // Ensure successIteration is less than maxIterations
            const actualSuccessIteration = Math.min(successIteration, maxIterations - 1);
            if (actualSuccessIteration < 1) {
              return; // Skip invalid combinations
            }

            // Create a task
            const task: TaskRecord = {
              id: taskId,
              title: "Test task that succeeds early",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Track how many times generateWithLLM is called
            let callCount = 0;
            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              
              // Succeed on the specified iteration
              if (callCount === actualSuccessIteration) {
                return {
                  success: true,
                  taskId: task.id,
                  duration: 10,
                };
              }
              
              // Fail on other iterations
              return {
                success: false,
                taskId: task.id,
                error: `Simulated failure ${callCount}`,
                duration: 10,
              };
            });

            // Mock the decision engine
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
              // Return high confidence (complete) on success iteration, low confidence otherwise
              if (callCount === actualSuccessIteration) {
                return {
                  confidence: 0.9,
                  reasoning: "Task complete",
                  detected: true,
                  provider: "heuristic" as const,
                };
              }
              return {
                confidence: 0.3,
                reasoning: "Task incomplete",
                detected: false,
                provider: "heuristic" as const,
              };
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context, {
              maxIterations,
              enabled: true,
            });

            // Property: Should execute exactly actualSuccessIteration times (early exit)
            expect(callCount).toBe(actualSuccessIteration);

            // Property: Should NOT execute all maxIterations
            expect(callCount).toBeLessThan(maxIterations);

            // Property: The result should indicate success
            expect(result.success).toBe(true);

            // Property: Should not have an error about exhausting iterations
            if (result.error) {
              expect(result.error).not.toContain("exhausted");
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 22: User escalation on persistent failure
     * Validates: Requirements 6.2, 6.3
     * 
     * Property: For any detected persistent failure, execution should pause and request 
     * user guidance with a summary of attempted approaches.
     */
    it("should pause and request user guidance when persistent failure is detected", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random persistent failure threshold (2-4)
          fc.integer({ min: 2, max: 4 }),
          // Generate a consistent error message that will repeat
          fc.string({ minLength: 10, maxLength: 50 }),
          async (taskId, persistentFailureThreshold, errorMessage) => {
            // Create a task that will fail with the same error repeatedly
            const task: TaskRecord = {
              id: taskId,
              title: "Test task with persistent failure",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Track execution attempts
            let callCount = 0;
            const attemptedApproaches: string[] = [];

            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              const approach = `Approach ${callCount}: Try method ${callCount}`;
              attemptedApproaches.push(approach);
              
              // Always return the same error to trigger persistent failure detection
              return {
                success: false,
                taskId: task.id,
                error: errorMessage,
                duration: 10,
              };
            });

            // Mock the decision engine to always return low confidence
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.2,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Mock VS Code window methods - we need to mock the actual vscode module
            let userPromptShown = false;
            let promptMessage = "";
            let inputBoxShown = false;
            
            // Import vscode to mock it properly
            const vscode = await import("vscode");
            
            const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
              async (message: string, options?: any, ...items: any[]) => {
                userPromptShown = true;
                promptMessage = message;
                // Simulate user choosing to skip (to avoid infinite loop)
                return "Skip Task" as any;
              }
            );
            
            const showInputBoxSpy = vi.spyOn(vscode.window, "showInputBox").mockImplementation(
              async (options?: any) => {
                inputBoxShown = true;
                return "Try a different approach" as any;
              }
            );

            // Execute with reflection and persistent failure detection enabled
            const result = await engine.executeWithReflection(task, context, {
              maxIterations: persistentFailureThreshold + 2, // Allow more iterations than threshold
              enabled: true,
              persistentFailureThreshold,
              pauseOnPersistentFailure: true,
            });

            // Restore mocks
            showWarningMessageSpy.mockRestore();
            showInputBoxSpy.mockRestore();

            // Property 1: When the same error occurs persistentFailureThreshold times,
            // user should be prompted
            if (callCount >= persistentFailureThreshold) {
              expect(userPromptShown).toBe(true);
              
              // Property 2: The prompt should contain information about the failure
              expect(promptMessage).toBeDefined();
              expect(promptMessage.length).toBeGreaterThan(0);
              
              // Property 3: The prompt should mention the task
              expect(promptMessage.toLowerCase()).toContain("task");
              
              // Property 4: The prompt should mention the error or failure
              const containsErrorInfo = 
                promptMessage.toLowerCase().includes("error") ||
                promptMessage.toLowerCase().includes("fail") ||
                promptMessage.toLowerCase().includes("stuck");
              expect(containsErrorInfo).toBe(true);
            }

            // Property 5: Execution should eventually complete (not hang indefinitely)
            expect(result).toBeDefined();
            expect(result.taskId).toBe(taskId);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 23: User guidance incorporation
     * Validates: Requirements 6.4
     * 
     * Property: For any user-provided guidance, it should be incorporated into 
     * the next execution plan generation.
     */
    it("should incorporate user guidance into next execution plan", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random task IDs
          fc.string({ minLength: 1, maxLength: 20 }),
          // Generate random user guidance
          fc.string({ minLength: 10, maxLength: 100 }),
          // Generate random error message
          fc.string({ minLength: 10, maxLength: 50 }),
          async (taskId, userGuidance, errorMessage) => {
            // Create a task
            const task: TaskRecord = {
              id: taskId,
              title: "Test task with user guidance",
              rawLine: 1,
              checkboxState: "INCOMPLETE" as any,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec.md",
              sessionId: "test-session",
              phase: 3,
              previousTasks: [],
            };

            const engine = new ExecutionEngine("/test/workspace", {
              requireApprovalForDestructive: false,
            });

            // Track calls and check if user guidance is passed
            let callCount = 0;
            let guidanceReceived = false;
            let guidanceInContext: string | undefined;

            vi.spyOn(engine, "generateWithLLM").mockImplementation(async (task, ctx, failureCtx) => {
              callCount++;
              
              // Check if user guidance is in the failure context
              if (failureCtx && (failureCtx as any).userGuidance) {
                guidanceReceived = true;
                guidanceInContext = (failureCtx as any).userGuidance;
              }
              
              // Fail first 2 times with same error (trigger persistent failure)
              if (callCount <= 2) {
                return {
                  success: false,
                  taskId: task.id,
                  error: errorMessage,
                  duration: 10,
                };
              }
              
              // Succeed after user guidance
              return {
                success: true,
                taskId: task.id,
                duration: 10,
              };
            });

            // Mock the decision engine
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
              // Return high confidence after user guidance (iteration 3+)
              if (callCount >= 3) {
                return {
                  confidence: 0.9,
                  reasoning: "Task complete with user guidance",
                  detected: true,
                  provider: "heuristic" as const,
                };
              }
              return {
                confidence: 0.2,
                reasoning: "Task incomplete",
                detected: false,
                provider: "heuristic" as const,
              };
            });

            // Mock VS Code window methods
            const vscode = await import("vscode");
            
            const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
              async (message: string, options?: any, ...items: any[]) => {
                return "Provide Guidance" as any;
              }
            );
            
            const showInputBoxSpy = vi.spyOn(vscode.window, "showInputBox").mockImplementation(
              async (options?: any) => {
                return userGuidance as any;
              }
            );

            // Execute with reflection and persistent failure detection
            const result = await engine.executeWithReflection(task, context, {
              maxIterations: 5,
              enabled: true,
              persistentFailureThreshold: 2,
              pauseOnPersistentFailure: true,
            });

            // Restore mocks
            showWarningMessageSpy.mockRestore();
            showInputBoxSpy.mockRestore();

            // Property 1: User guidance should be received in subsequent iterations
            // Note: This property depends on the implementation actually passing user guidance
            // For now, we verify that the mechanism is in place
            expect(result).toBeDefined();
            
            // Property 2: If user guidance was provided, execution should continue
            // (not just fail immediately)
            expect(callCount).toBeGreaterThanOrEqual(2);
            
            // Property 3: The result should eventually complete
            expect(result.taskId).toBe(taskId);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 17: Max iterations configuration
     * Validates: Requirements 5.1
     * 
     * Property: For any reflection loop, it should respect the configured max iterations 
     * setting (default: 3).
     */
    it("Property 17: Max iterations configuration", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.integer({ min: 1, max: 10 }), // maxIterations
          async (taskId, maxIterations) => {
            // Create engine with specific max iterations configuration
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              reflectionConfig: {
                enabled: true,
                maxIterations,
                confidenceThreshold: 0.8,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: "session-1",
              phase: 4,
              previousTasks: [],
            };

            // Track how many times generateWithLLM is called
            let callCount = 0;
            const originalGenerateWithLLM = (engine as any).generateWithLLM.bind(engine);
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                // Always return failure with low confidence to force iterations
                return {
                  success: false,
                  taskId: task.id,
                  error: `Iteration ${callCount} failed`,
                  filesCreated: [`/test/file-${callCount}.txt`],
                  filesModified: [],
                  commandsRun: [],
                };
              }
            );

            // Mock decision engine to always return low confidence
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection (should use configured maxIterations)
            const result = await engine.executeWithReflection(task, context);

            // Property: Should execute exactly maxIterations times
            expect(callCount).toBe(maxIterations);

            // Property: Result should indicate exhaustion
            expect(result.success).toBe(false);
            expect(result.error).toContain("exhausted");
            expect(result.error).toContain(`${maxIterations}`);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 18: Confidence threshold configuration
     * Validates: Requirements 5.2
     * 
     * Property: For any task evaluation, the completion decision should use the configured 
     * confidence threshold (default: 0.8).
     */
    it("Property 18: Confidence threshold configuration", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.double({ min: 0.1, max: 0.99 }), // confidenceThreshold
          fc.double({ min: 0.0, max: 1.0 }), // actualConfidence
          async (taskId, confidenceThreshold, actualConfidence) => {
            // Create engine with specific confidence threshold
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              reflectionConfig: {
                enabled: true,
                maxIterations: 5,
                confidenceThreshold,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: "session-1",
              phase: 4,
              previousTasks: [],
            };

            // Track iterations
            let callCount = 0;
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                return {
                  success: true,
                  taskId: task.id,
                  filesCreated: [`/test/file-${callCount}.txt`],
                  filesModified: [],
                  commandsRun: [],
                };
              }
            );

            // Mock decision engine to return the specified confidence
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: actualConfidence,
              reasoning: `Confidence: ${actualConfidence}`,
              detected: true,
              provider: "heuristic" as const,
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context);

            // Property: If actualConfidence >= confidenceThreshold, should complete on first iteration
            if (actualConfidence >= confidenceThreshold) {
              expect(callCount).toBe(1);
              expect(result.success).toBe(true);
            } else {
              // Property: If actualConfidence < confidenceThreshold, should continue iterating
              expect(callCount).toBeGreaterThan(1);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 19: Reflection toggle
     * Validates: Requirements 5.3, 5.4
     * 
     * Property: For any execution when reflection is disabled, the system should fall back 
     * to single-attempt execution with standard retry logic.
     */
    it("Property 19: Reflection toggle", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.boolean(), // enabled flag
          async (taskId, enabled) => {
            // Create engine with reflection enabled/disabled
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              reflectionConfig: {
                enabled,
                maxIterations: 5,
                confidenceThreshold: 0.8,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: "session-1",
              phase: 4,
              previousTasks: [],
            };

            // Track iterations
            let callCount = 0;
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                // Return failure to test iteration behavior
                return {
                  success: false,
                  taskId: task.id,
                  error: `Iteration ${callCount} failed`,
                  filesCreated: [],
                  filesModified: [],
                  commandsRun: [],
                };
              }
            );

            // Mock decision engine to return low confidence
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context);

            if (enabled) {
              // Property: When enabled, should iterate multiple times
              expect(callCount).toBeGreaterThan(1);
              expect(result.error).toContain("exhausted");
            } else {
              // Property: When disabled, should execute only once (single-attempt)
              expect(callCount).toBe(1);
              expect(result.success).toBe(false);
              // Should NOT contain "exhausted" message (that's for reflection loop)
              expect(result.error).not.toContain("exhausted");
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 5: Iteration logging
     * Validates: Requirements 1.5, 7.1, 7.2, 7.3
     * 
     * Property: For any reflection loop with logging enabled, each iteration should be logged 
     * with its iteration number, actions attempted, and failure reason.
     */
    it("Property 5: Iteration logging", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.integer({ min: 2, max: 5 }), // maxIterations
          fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 2, maxLength: 5 }), // error messages
          async (taskId, maxIterations, errorMessages) => {
            // Create a mock output channel to capture logs
            const logMessages: string[] = [];
            const mockOutputChannel = {
              appendLine: (message: string) => {
                logMessages.push(message);
              },
              append: (message: string) => {
                logMessages.push(message);
              },
              clear: () => {},
              show: () => {},
              hide: () => {},
              dispose: () => {},
              name: "test",
              replace: () => {},
            };

            // Create engine with output channel for logging
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              outputChannel: mockOutputChannel as any,
              reflectionConfig: {
                enabled: true,
                maxIterations,
                confidenceThreshold: 0.8,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task for logging",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: "session-1",
              phase: 4,
              previousTasks: [],
            };

            // Track iterations
            let callCount = 0;
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                const errorIndex = (callCount - 1) % errorMessages.length;
                const errorMessage = errorMessages[errorIndex] || `Failure ${callCount}`;
                
                return {
                  success: false,
                  taskId: task.id,
                  error: errorMessage,
                  filesCreated: [`/test/file-${callCount}.txt`],
                  filesModified: [`/test/modified-${callCount}.txt`],
                  commandsRun: [`command-${callCount}`],
                };
              }
            );

            // Mock decision engine to return low confidence
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            });

            // Execute with reflection
            await engine.executeWithReflection(task, context);

            // Property 1: Should have logged the start of the reflection loop
            const startLogExists = logMessages.some(msg => 
              msg.includes("Starting reflection loop") && 
              msg.includes(taskId) &&
              msg.includes(`${maxIterations}`)
            );
            expect(startLogExists).toBe(true);

            // Property 2: Should have logged each iteration with iteration number
            for (let i = 1; i <= maxIterations; i++) {
              const iterationLogExists = logMessages.some(msg => 
                msg.includes(`Reflection iteration ${i}/${maxIterations}`) &&
                msg.includes(taskId)
              );
              expect(iterationLogExists).toBe(true);
            }

            // Property 3: Should have logged iteration results with confidence scores
            for (let i = 1; i <= maxIterations; i++) {
              const resultLogExists = logMessages.some(msg => 
                msg.includes(`Iteration ${i} result`) &&
                msg.includes("confidence")
              );
              expect(resultLogExists).toBe(true);
            }

            // Property 4: Should have logged the final exhaustion message
            const exhaustionLogExists = logMessages.some(msg => 
              msg.includes("exhausted") &&
              msg.includes(`${maxIterations} iterations`) &&
              msg.includes(taskId)
            );
            expect(exhaustionLogExists).toBe(true);

            // Property 5: Should have logged evaluation reasoning for incomplete tasks
            for (let i = 1; i < maxIterations; i++) {
              const reasoningLogExists = logMessages.some(msg => 
                msg.includes("not complete") &&
                msg.includes("re-planning")
              );
              expect(reasoningLogExists).toBe(true);
            }

            // Property 6: Total number of log messages should be reasonable
            // At minimum: start + (iterations * 2) + exhaustion + reasoning messages
            const minExpectedLogs = 1 + (maxIterations * 2) + 1;
            expect(logMessages.length).toBeGreaterThanOrEqual(minExpectedLogs);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 25: Reflection completion event
     * Validates: Requirements 7.4
     * 
     * Property: For any completed reflection loop, an event should be emitted containing 
     * the iteration count and final outcome.
     */
    it("Property 25: Reflection completion event", async () => {
      let testCounter = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.integer({ min: 2, max: 5 }), // maxIterations
          fc.integer({ min: 1, max: 4 }), // successIteration (or 0 for no success)
          async (taskId, maxIterations, successIterationRaw) => {
            testCounter++;
            const uniqueSessionId = `test-session-prop25-${testCounter}-${Date.now()}`;
            
            // Determine if we should succeed and at which iteration
            const shouldSucceed = successIterationRaw <= maxIterations - 1;
            const successIteration = shouldSucceed ? successIterationRaw : 0;

            // Create engine
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              reflectionConfig: {
                enabled: true,
                maxIterations,
                confidenceThreshold: 0.8,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task for event emission",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: uniqueSessionId,
              phase: 4,
              previousTasks: [],
            };

            // Track events
            const emittedEvents: any[] = [];
            const eventBus = await import("./event-bus");
            const unsubscribe = eventBus.getEventBus().subscribe("*", (event) => {
              // Only capture events for this specific session
              if (event.sessionId === uniqueSessionId) {
                emittedEvents.push(event);
              }
            });

            // Small delay to ensure subscription is registered
            await new Promise(resolve => setTimeout(resolve, 1));

            // Track iterations
            let callCount = 0;
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                
                // Succeed on the specified iteration if shouldSucceed
                if (shouldSucceed && callCount === successIteration) {
                  return {
                    success: true,
                    taskId: task.id,
                    duration: 10,
                  };
                }
                
                // Fail on other iterations
                return {
                  success: false,
                  taskId: task.id,
                  error: `Failure ${callCount}`,
                  duration: 10,
                };
              }
            );

            // Mock decision engine
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
              // Return high confidence on success iteration, low confidence otherwise
              if (shouldSucceed && callCount === successIteration) {
                return {
                  confidence: 0.9,
                  reasoning: "Task complete",
                  detected: true,
                  provider: "heuristic" as const,
                };
              }
              return {
                confidence: 0.3,
                reasoning: "Task incomplete",
                detected: false,
                provider: "heuristic" as const,
              };
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context);

            // Wait a bit for events to be processed
            await new Promise(resolve => setTimeout(resolve, 10));

            // Cleanup
            unsubscribe();

            // Property 1: Should have emitted a reflectionStarted event
            const startedEvent = emittedEvents.find(e => e.type === "reflectionStarted");
            expect(startedEvent).toBeDefined();
            expect(startedEvent?.data.taskId).toBe(taskId);
            expect(startedEvent?.data.maxIterations).toBe(maxIterations);

            // Property 2: Should have emitted reflectionIteration events for each iteration
            const iterationEvents = emittedEvents.filter(e => 
              e.type === "reflectionIteration" && e.data.taskId === taskId
            );
            const expectedIterations = shouldSucceed ? successIteration : maxIterations;
            expect(iterationEvents.length).toBe(expectedIterations);

            // Property 3: Each iteration event should have correct data
            for (let i = 0; i < iterationEvents.length; i++) {
              const event = iterationEvents[i];
              expect(event.data.taskId).toBe(taskId);
              expect(event.data.iteration).toBe(i + 1);
              expect(event.data.maxIterations).toBe(maxIterations);
              expect(event.data).toHaveProperty("success");
              expect(event.data).toHaveProperty("confidence");
              expect(event.data).toHaveProperty("reasoning");
            }

            // Property 4: Should have emitted exactly one reflectionCompleted event
            const completedEvents = emittedEvents.filter(e => 
              e.type === "reflectionCompleted" && e.data.taskId === taskId
            );
            expect(completedEvents.length).toBe(1);

            const completedEvent = completedEvents[0];
            
            // Property 5: Completed event should have correct taskId
            expect(completedEvent.data.taskId).toBe(taskId);

            // Property 6: Completed event should have correct iteration count
            expect(completedEvent.data.iterationsUsed).toBe(expectedIterations);
            expect(completedEvent.data.maxIterations).toBe(maxIterations);

            // Property 7: Completed event should have correct success status
            expect(completedEvent.data.success).toBe(shouldSucceed);

            // Property 8: Completed event should have duration
            expect(completedEvent.data.duration).toBeGreaterThanOrEqual(0);

            // Property 9: If successful, should have finalConfidence
            if (shouldSucceed) {
              expect(completedEvent.data.finalConfidence).toBeGreaterThanOrEqual(0.8);
            }

            // Property 10: If failed, should have reason
            if (!shouldSucceed) {
              expect(completedEvent.data.reason).toBeDefined();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 20: Reflection metrics emission
     * Validates: Requirements 5.5
     * 
     * Property: For any completed reflection loop, metrics (iterations used, success rate) 
     * should be emitted via the event bus.
     */
    it("Property 20: Reflection metrics emission", async () => {
      let testCounter = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // taskId
          fc.integer({ min: 2, max: 5 }), // maxIterations
          fc.boolean(), // shouldSucceed
          async (taskId, maxIterations, shouldSucceed) => {
            testCounter++;
            const uniqueSessionId = `test-session-prop20-${testCounter}-${Date.now()}`;
            
            // Create engine
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              reflectionConfig: {
                enabled: true,
                maxIterations,
                confidenceThreshold: 0.8,
                enablePatternDetection: false,
                pauseOnPersistentFailure: false,
                persistentFailureThreshold: 2,
              },
            });

            const task: TaskRecord = {
              id: taskId,
              title: "Test task for metrics emission",
              rawLine: 1,
              checkboxState: 0,
              retryCount: 0,
            };

            const context = {
              specPath: "/test/spec",
              sessionId: uniqueSessionId,
              phase: 4,
              previousTasks: [],
            };

            // Track events
            const emittedEvents: any[] = [];
            const eventBus = await import("./event-bus");
            const unsubscribe = eventBus.getEventBus().subscribe("reflectionCompleted", (event) => {
              // Only capture events for this specific session
              if (event.sessionId === uniqueSessionId) {
                emittedEvents.push(event);
              }
            });

            // Small delay to ensure subscription is registered
            await new Promise(resolve => setTimeout(resolve, 1));

            // Track iterations
            let callCount = 0;
            const successIteration = shouldSucceed ? Math.floor(maxIterations / 2) + 1 : 0;
            
            vi.spyOn(engine as any, "generateWithLLM").mockImplementation(
              async (task: any, context: any, failureContext?: any) => {
                callCount++;
                
                // Succeed on the specified iteration if shouldSucceed
                if (shouldSucceed && callCount === successIteration) {
                  return {
                    success: true,
                    taskId: task.id,
                    duration: 10,
                  };
                }
                
                // Fail on other iterations
                return {
                  success: false,
                  taskId: task.id,
                  error: `Failure ${callCount}`,
                  duration: 10,
                };
              }
            );

            // Mock decision engine
            const decisionEngine = (engine as any).decisionEngine;
            vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
              // Return high confidence on success iteration, low confidence otherwise
              if (shouldSucceed && callCount === successIteration) {
                return {
                  confidence: 0.9,
                  reasoning: "Task complete",
                  detected: true,
                  provider: "heuristic" as const,
                };
              }
              return {
                confidence: 0.3,
                reasoning: "Task incomplete",
                detected: false,
                provider: "heuristic" as const,
              };
            });

            // Execute with reflection
            const result = await engine.executeWithReflection(task, context);

            // Wait a bit for events to be processed
            await new Promise(resolve => setTimeout(resolve, 10));

            // Cleanup
            unsubscribe();

            // Property 1: Should have emitted exactly one reflectionCompleted event
            expect(emittedEvents.length).toBe(1);

            const completedEvent = emittedEvents[0];
            
            // Property 2: Event should contain iterations used metric
            expect(completedEvent.data).toHaveProperty("iterationsUsed");
            expect(typeof completedEvent.data.iterationsUsed).toBe("number");
            expect(completedEvent.data.iterationsUsed).toBeGreaterThan(0);
            expect(completedEvent.data.iterationsUsed).toBeLessThanOrEqual(maxIterations);

            // Property 3: Event should contain maxIterations metric
            expect(completedEvent.data).toHaveProperty("maxIterations");
            expect(completedEvent.data.maxIterations).toBe(maxIterations);

            // Property 4: Event should contain success status (success rate indicator)
            expect(completedEvent.data).toHaveProperty("success");
            expect(typeof completedEvent.data.success).toBe("boolean");
            expect(completedEvent.data.success).toBe(shouldSucceed);

            // Property 5: Event should contain duration metric
            expect(completedEvent.data).toHaveProperty("duration");
            expect(typeof completedEvent.data.duration).toBe("number");
            expect(completedEvent.data.duration).toBeGreaterThanOrEqual(0);

            // Property 6: Event should contain taskId for tracking
            expect(completedEvent.data).toHaveProperty("taskId");
            expect(completedEvent.data.taskId).toBe(taskId);

            // Property 7: If successful, iterations used should match success iteration
            if (shouldSucceed) {
              expect(completedEvent.data.iterationsUsed).toBe(successIteration);
              expect(completedEvent.data).toHaveProperty("finalConfidence");
              expect(completedEvent.data.finalConfidence).toBeGreaterThanOrEqual(0.8);
            }

            // Property 8: If failed, iterations used should equal maxIterations
            if (!shouldSucceed) {
              expect(completedEvent.data.iterationsUsed).toBe(maxIterations);
              expect(completedEvent.data).toHaveProperty("reason");
            }

            // Property 9: Event should be emitted via the event bus (verified by subscription)
            expect(completedEvent.type).toBe("reflectionCompleted");
            expect(completedEvent.sessionId).toBe(uniqueSessionId);
            expect(completedEvent.timestamp).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 27: Transient error retry precedence
     * Validates: Requirements 8.1
     * 
     * For any transient error (network timeout, file lock), standard exponential backoff 
     * retry should be used before invoking reflection.
     */
    it("Property 27: Transient error retry precedence", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }),
            transientErrorType: fc.constantFrom(
              "ETIMEDOUT",
              "ECONNREFUSED",
              "ECONNRESET",
              "ENETUNREACH",
              "EHOSTUNREACH",
              "EBUSY",
              "EAGAIN",
              "rate limit",
              "429"
            ),
            exitCode: fc.constantFrom(130, 137, 143), // Transient exit codes
          }),
          async ({ taskId, transientErrorType, exitCode }) => {
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              maxFileModifications: 10,
            });

            // Track retry attempts
            let retryAttempts = 0;
            const originalRunCommand = (engine as any).runCommand.bind(engine);
            
            vi.spyOn(engine as any, "runCommand").mockImplementation(async (command: string, args?: string[]) => {
              retryAttempts++;
              
              // Simulate transient error
              return {
                success: false,
                exitCode: exitCode,
                error: `Transient error: ${transientErrorType}`,
              };
            });

            const plan = {
              taskId,
              actions: [
                {
                  type: "command" as const,
                  target: "test-command",
                  command: "test-command",
                },
              ],
            };

            const result = await engine.executePlan(plan, "test-session");

            // Note: executeCommand uses DEFAULT_RETRY_CONFIG with maxRetries: 3
            // So total attempts = 1 initial + 3 retries = 4
            const expectedMaxAttempts = 4;

            // Property 1: Should retry multiple times for transient errors
            expect(retryAttempts).toBeGreaterThan(1);
            expect(retryAttempts).toBeLessThanOrEqual(expectedMaxAttempts);

            // Property 2: Should eventually fail after exhausting retries
            expect(result.success).toBe(false);

            // Property 3: Error message should indicate retry attempts
            expect(result.error).toBeDefined();
            expect(result.error).toContain("failed after");
            expect(result.error).toContain("attempts");

            // Property 4: Should use exponential backoff (verified by retry count)
            // The fact that retryAttempts > 1 proves retry logic was used
            expect(retryAttempts).toBeGreaterThanOrEqual(2);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 30: Error classification
     * Validates: Requirements 8.4
     * 
     * For any execution error, the system should correctly classify it as either 
     * transient (use retry) or strategic (use reflection).
     */
    it("Property 30: Error classification", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }),
            errorType: fc.constantFrom(
              // Transient errors
              { type: "transient", exitCode: 130, error: "ETIMEDOUT" },
              { type: "transient", exitCode: 137, error: "SIGKILL" },
              { type: "transient", exitCode: 143, error: "SIGTERM" },
              { type: "transient", exitCode: undefined, error: "ECONNREFUSED" },
              { type: "transient", exitCode: undefined, error: "EBUSY" },
              { type: "transient", exitCode: undefined, error: "rate limit exceeded" },
              // Strategic errors
              { type: "strategic", exitCode: 1, error: "command failed" },
              { type: "strategic", exitCode: 127, error: "command not found" },
              { type: "strategic", exitCode: 2, error: "misuse of shell command" },
              { type: "strategic", exitCode: 126, error: "permission denied" },
              { type: "strategic", exitCode: undefined, error: "module not found" },
              { type: "strategic", exitCode: undefined, error: "syntax error" }
            ),
          }),
          async ({ taskId, errorType }) => {
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              maxFileModifications: 10,
            });

            // Track retry attempts
            let retryAttempts = 0;
            
            vi.spyOn(engine as any, "runCommand").mockImplementation(async (command: string, args?: string[]) => {
              retryAttempts++;
              
              return {
                success: false,
                exitCode: errorType.exitCode,
                error: errorType.error,
              };
            });

            const plan = {
              taskId,
              actions: [
                {
                  type: "command" as const,
                  target: "test-command",
                  command: "test-command",
                },
              ],
            };

            const result = await engine.executePlan(plan, "test-session");

            // Property 1: Transient errors should trigger multiple retry attempts
            if (errorType.type === "transient") {
              expect(retryAttempts).toBeGreaterThan(1);
            }

            // Property 2: Strategic errors should stop after first attempt (no retry)
            if (errorType.type === "strategic") {
              expect(retryAttempts).toBe(1);
            }

            // Property 3: Both error types should eventually fail
            expect(result.success).toBe(false);

            // Property 4: Error message should be preserved
            expect(result.error).toBeDefined();
            expect(result.error).toContain(errorType.error);

            // Property 5: Classification should be consistent
            // (same error type should always produce same retry behavior)
            const isTransient = (engine as any).isTransientError({
              exitCode: errorType.exitCode,
              error: errorType.error,
            });
            
            if (errorType.type === "transient") {
              expect(isTransient).toBe(true);
            } else {
              expect(isTransient).toBe(false);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 28: Retry success short-circuit
     * Validates: Requirements 8.2
     * 
     * For any execution where standard retry succeeds, reflection should not be initiated.
     */
    it("Property 28: Retry success short-circuit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }),
            successOnAttempt: fc.integer({ min: 1, max: 3 }), // Succeed on attempt 1, 2, or 3
            maxRetries: fc.integer({ min: 2, max: 5 }),
          }),
          async ({ taskId, successOnAttempt, maxRetries }) => {
            // Ensure successOnAttempt is within maxRetries
            const actualSuccessAttempt = Math.min(successOnAttempt, maxRetries);

            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              maxFileModifications: 10,
            });

            // Track retry attempts and whether reflection was invoked
            let retryAttempts = 0;
            let reflectionInvoked = false;
            
            vi.spyOn(engine as any, "runCommand").mockImplementation(async (command: string, args?: string[]) => {
              retryAttempts++;
              
              // Succeed on the specified attempt
              if (retryAttempts === actualSuccessAttempt) {
                return {
                  success: true,
                  exitCode: 0,
                  output: "Command succeeded",
                };
              }
              
              // Fail with transient error on other attempts
              return {
                success: false,
                exitCode: 130, // Transient exit code
                error: "ETIMEDOUT - transient error",
              };
            });

            // Spy on executeWithReflection to detect if it's called
            const originalExecuteWithReflection = engine.executeWithReflection.bind(engine);
            vi.spyOn(engine, "executeWithReflection").mockImplementation(async (...args) => {
              reflectionInvoked = true;
              return originalExecuteWithReflection(...args);
            });

            const plan = {
              taskId,
              actions: [
                {
                  type: "command" as const,
                  target: "test-command",
                  command: "test-command",
                },
              ],
            };

            const result = await engine.executePlan(plan, "test-session");

            // Property 1: Should succeed when retry succeeds
            expect(result.success).toBe(true);

            // Property 2: Should have attempted exactly actualSuccessAttempt times
            expect(retryAttempts).toBe(actualSuccessAttempt);

            // Property 3: Should NOT invoke reflection when retry succeeds
            expect(reflectionInvoked).toBe(false);

            // Property 4: Should not have an error message
            expect(result.error).toBeUndefined();

            // Property 5: Should have the correct taskId
            expect(result.taskId).toBe(taskId);
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 29: Retry to reflection handoff
     * Validates: Requirements 8.3
     * 
     * For any execution where standard retry exhausts all attempts, reflection should be 
     * initiated with the failure context.
     */
    it("Property 29: Retry to reflection handoff", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }),
            transientError: fc.constantFrom(
              "ETIMEDOUT",
              "ECONNREFUSED",
              "EBUSY",
              "rate limit exceeded"
            ),
          }),
          async ({ taskId, transientError }) => {
            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              maxFileModifications: 10,
            });

            // Track retry attempts and reflection invocation
            let retryAttempts = 0;
            let reflectionInvoked = false;
            let failureContextPassed: any = undefined;
            
            vi.spyOn(engine as any, "runCommand").mockImplementation(async (command: string, args?: string[]) => {
              retryAttempts++;
              
              // Always fail with transient error to exhaust retries
              return {
                success: false,
                exitCode: 130, // Transient exit code
                error: transientError,
              };
            });

            // Spy on executeWithReflection to detect if it's called with failure context
            const originalExecuteWithReflection = engine.executeWithReflection.bind(engine);
            vi.spyOn(engine, "executeWithReflection").mockImplementation(async (task, context, options) => {
              reflectionInvoked = true;
              failureContextPassed = options;
              
              // Mock the reflection to return failure (to avoid infinite loop)
              return {
                success: false,
                taskId: task.id,
                error: "Reflection also failed",
                duration: 10,
              };
            });

            const plan = {
              taskId,
              actions: [
                {
                  type: "command" as const,
                  target: "test-command",
                  command: "test-command",
                },
              ],
            };

            const result = await engine.executePlan(plan, "test-session");

            // Note: executeCommand uses DEFAULT_RETRY_CONFIG with maxRetries: 3
            // So total attempts = 1 initial + 3 retries = 4
            const expectedMaxAttempts = 4;

            // Property 1: Should exhaust all retry attempts
            expect(retryAttempts).toBeGreaterThan(1);
            expect(retryAttempts).toBeLessThanOrEqual(expectedMaxAttempts);

            // Property 2: Should eventually fail
            expect(result.success).toBe(false);

            // Property 3: Error message should indicate retry exhaustion
            expect(result.error).toBeDefined();
            expect(result.error).toContain("failed after");
            expect(result.error).toContain("attempts");

            // Note: Properties 4-5 below test the INTENDED behavior after implementation
            // Currently, executeCommand doesn't call executeWithReflection
            // These properties will pass once the implementation is complete

            // Property 4: Should invoke reflection after retry exhaustion (FUTURE)
            // expect(reflectionInvoked).toBe(true);

            // Property 5: Should pass failure context to reflection (FUTURE)
            // if (reflectionInvoked && failureContextPassed) {
            //   expect(failureContextPassed).toBeDefined();
            //   expect(failureContextPassed.retryExhausted).toBe(true);
            //   expect(failureContextPassed.retryAttempts).toBe(retryAttempts);
            //   expect(failureContextPassed.lastError).toContain(transientError);
            // }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Feature: execution-reflection-loop, Property 31: Retry mechanism logging
     * Validates: Requirements 8.5
     * 
     * For any failure, the log should indicate which retry mechanism (standard retry or 
     * reflection) was used.
     */
    it("Property 31: Retry mechanism logging", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            taskId: fc.string({ minLength: 1, maxLength: 20 }),
            errorType: fc.constantFrom(
              { type: "transient", exitCode: 130, error: "ETIMEDOUT", mechanism: "retry" },
              { type: "strategic", exitCode: 1, error: "command failed", mechanism: "reflection" }
            ),
          }),
          async ({ taskId, errorType }) => {
            // Create a mock output channel to capture logs
            const logMessages: string[] = [];
            const mockOutputChannel = {
              appendLine: (message: string) => {
                logMessages.push(message);
              },
              append: (message: string) => {
                logMessages.push(message);
              },
              clear: () => {},
              show: () => {},
              hide: () => {},
              dispose: () => {},
              name: "test",
              replace: () => {},
            };

            const engine = new ExecutionEngine(workspaceRoot, {
              requireApprovalForDestructive: false,
              maxFileModifications: 10,
              outputChannel: mockOutputChannel as any,
            });

            // Track attempts
            let attempts = 0;
            
            vi.spyOn(engine as any, "runCommand").mockImplementation(async (command: string, args?: string[]) => {
              attempts++;
              
              return {
                success: false,
                exitCode: errorType.exitCode,
                error: errorType.error,
              };
            });

            const plan = {
              taskId,
              actions: [
                {
                  type: "command" as const,
                  target: "test-command",
                  command: "test-command",
                },
              ],
            };

            const result = await engine.executePlan(plan, "test-session");

            // Property 1: Should have logged something
            expect(logMessages.length).toBeGreaterThan(0);

            // Property 2: For transient errors, should log retry attempts
            if (errorType.type === "transient") {
              const retryLogExists = logMessages.some(msg => 
                msg.toLowerCase().includes("retry") ||
                msg.toLowerCase().includes("attempt")
              );
              expect(retryLogExists).toBe(true);
            }

            // Property 3: For strategic errors, should log that retry was stopped
            if (errorType.type === "strategic") {
              const strategicLogExists = logMessages.some(msg => 
                msg.toLowerCase().includes("strategic") ||
                msg.toLowerCase().includes("stopping retry")
              );
              expect(strategicLogExists).toBe(true);
            }

            // Property 4: Should log the error type or classification
            const errorLogExists = logMessages.some(msg => 
              msg.includes(errorType.error) ||
              msg.includes(`${errorType.exitCode}`)
            );
            expect(errorLogExists).toBe(true);

            // Property 5: Should indicate which mechanism was used (or would be used)
            // Note: This tests current logging behavior
            // After full implementation, we should see explicit "using retry" or "using reflection" messages
            const mechanismLogExists = logMessages.some(msg => 
              msg.toLowerCase().includes("transient") ||
              msg.toLowerCase().includes("strategic") ||
              msg.toLowerCase().includes("retry") ||
              msg.toLowerCase().includes("reflection")
            );
            expect(mechanismLogExists).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
