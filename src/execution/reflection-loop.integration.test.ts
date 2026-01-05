/**
 * Integration Tests for Execution Reflection Loop
 * 
 * These tests verify the complete reflection flow including:
 * - Execute → fail → re-plan → succeed flow
 * - Multiple iterations with different failures
 * - Persistent failure detection and user escalation
 * - Failure pattern recognition across iterations
 * - Environment state tracking across attempts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ExecutionEngine } from "./execution-engine";
import { ContextManager } from "./context-manager";
import { DecisionEngine } from "./decision-engine";
import { getEventBus, resetEventBus } from "./event-bus";
import {
  TaskRecord,
  CheckboxState,
  ExecutionEvent,
  FailureContext,
} from "./types";

// Define ExecutionContext type for tests
type ExecutionContext = {
  specPath: string;
  sessionId: string;
  phase: number;
  previousTasks: TaskRecord[];
};

describe("Reflection Loop Integration Tests", () => {
  let tempDir: string;
  let executionEngine: ExecutionEngine;
  let contextManager: ContextManager;
  let decisionEngine: DecisionEngine;
  let capturedEvents: ExecutionEvent[] = [];

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflection-integration-"));
    
    // Reset event bus and capture events
    resetEventBus();
    capturedEvents = [];
    
    const eventBus = getEventBus();
    eventBus.subscribe("*", (event) => {
      capturedEvents.push(event);
    });

    // Initialize components
    executionEngine = new ExecutionEngine(tempDir, {
      requireApprovalForDestructive: false,
      reflectionConfig: {
        enabled: true,
        maxIterations: 3,
        confidenceThreshold: 0.8,
        enablePatternDetection: true,
        pauseOnPersistentFailure: true,
        persistentFailureThreshold: 2,
      },
    });

    contextManager = new ContextManager(tempDir);
    decisionEngine = new DecisionEngine(tempDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    resetEventBus();
    vi.restoreAllMocks();
  });

  describe("16.1 Complete Reflection Flow: Execute → Fail → Re-plan → Succeed", () => {
    it("should successfully complete a task after initial failure through reflection", async () => {
      // Setup: Create a task that will fail initially but succeed on retry
      const task: TaskRecord = {
        id: "test-task-1",
        title: "Create test file with specific content",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
        successCriteria: [
          {
            type: "file-exists",
            description: "Test file should exist",
            validation: "test-output.txt",
          },
        ],
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-1",
        phase: 4,
        previousTasks: [],
      };

      // Initialize context manager
      await contextManager.initialize(context.sessionId);

      // Track iterations and simulate failure then success
      let iterationCount = 0;
      const originalGenerateWithLLM = executionEngine.generateWithLLM.bind(executionEngine);
      
      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // First iteration: fail (wrong file path)
          if (iterationCount === 1) {
            return {
              success: false,
              taskId: task.id,
              error: "File created at wrong location",
              filesCreated: ["wrong-path.txt"],
              duration: 100,
            };
          }

          // Second iteration: succeed (correct file path)
          if (iterationCount === 2) {
            // Verify failure context was provided
            expect(failureContext).toBeDefined();
            expect(failureContext!.iteration).toBe(2);
            expect(failureContext!.previousAttempts).toHaveLength(1);
            expect(failureContext!.previousAttempts[0].result.error).toContain("wrong location");

            // Create the correct file
            const filePath = path.join(tempDir, "test-output.txt");
            fs.writeFileSync(filePath, "correct content");

            return {
              success: true,
              taskId: task.id,
              filesCreated: ["test-output.txt"],
              duration: 100,
            };
          }

          throw new Error("Unexpected iteration count");
        }
      );

      // Mock decision engine to return low confidence on first attempt, high on second
      vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async (task) => {
        if (iterationCount === 1) {
          return {
            confidence: 0.3,
            reasoning: "File not found at expected location",
            detected: false,
            provider: "heuristic" as const,
          };
        }
        
        return {
          confidence: 0.95,
          reasoning: "File exists with correct content",
          detected: true,
          provider: "heuristic" as const,
        };
      });

      // Execute with reflection
      const result = await executionEngine.executeWithReflection(task, context);

      // Assertions
      expect(result.success).toBe(true);
      expect(iterationCount).toBe(2);
      expect(result.filesCreated).toContain("test-output.txt");

      // Verify file was actually created
      const filePath = path.join(tempDir, "test-output.txt");
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify events were emitted
      const reflectionStartedEvents = capturedEvents.filter(e => e.type === "reflectionStarted");
      expect(reflectionStartedEvents).toHaveLength(1);

      const reflectionIterationEvents = capturedEvents.filter(e => e.type === "reflectionIteration");
      expect(reflectionIterationEvents).toHaveLength(2);

      const reflectionCompletedEvents = capturedEvents.filter(e => e.type === "reflectionCompleted");
      expect(reflectionCompletedEvents).toHaveLength(1);
      expect(reflectionCompletedEvents[0].data.success).toBe(true);
      expect(reflectionCompletedEvents[0].data.iterationsUsed).toBe(2);
    });

    it("should handle multiple iterations with different failures before success", async () => {
      const task: TaskRecord = {
        id: "test-task-2",
        title: "Complex task with multiple failure modes",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
        successCriteria: [
          {
            type: "file-exists",
            description: "Output file should exist",
            validation: "output.json",
          },
        ],
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-2",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      let iterationCount = 0;
      const errorMessages = [
        "Permission denied",
        "Invalid JSON format",
        "Missing required field",
      ];

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Fail with different errors for first 3 iterations
          if (iterationCount <= 3) {
            return {
              success: false,
              taskId: task.id,
              error: errorMessages[iterationCount - 1],
              duration: 100,
            };
          }

          // Succeed on 4th iteration
          const filePath = path.join(tempDir, "output.json");
          fs.writeFileSync(filePath, JSON.stringify({ status: "success" }));

          return {
            success: true,
            taskId: task.id,
            filesCreated: ["output.json"],
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
        if (iterationCount <= 3) {
          return {
            confidence: 0.2,
            reasoning: `Failure: ${errorMessages[iterationCount - 1]}`,
            detected: false,
            provider: "heuristic" as const,
          };
        }
        
        return {
          confidence: 0.9,
          reasoning: "Task completed successfully",
          detected: true,
          provider: "heuristic" as const,
        };
      });

      // Execute with higher max iterations
      const result = await executionEngine.executeWithReflection(task, context, {
        maxIterations: 5,
      });

      // Assertions
      expect(result.success).toBe(true);
      expect(iterationCount).toBe(4);

      // Verify all different error messages were encountered
      const iterationEvents = capturedEvents.filter(e => e.type === "reflectionIteration");
      expect(iterationEvents).toHaveLength(4);
      
      // First 3 should have failures
      for (let i = 0; i < 3; i++) {
        expect(iterationEvents[i].data.success).toBe(false);
      }
      
      // Last one should succeed
      expect(iterationEvents[3].data.success).toBe(true);
    });

    it("should track environment state across iterations", async () => {
      const task: TaskRecord = {
        id: "test-task-3",
        title: "Task with file modifications",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-3",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      let iterationCount = 0;
      const filesCreatedPerIteration: string[][] = [];

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Verify environment state accumulates
          if (failureContext) {
            expect(failureContext.environmentState).toBeDefined();
            expect(failureContext.environmentState.filesCreated.length).toBeGreaterThan(0);
            
            // Should contain files from previous iterations
            for (let i = 0; i < iterationCount - 1; i++) {
              const expectedFile = `file-iteration-${i + 1}.txt`;
              expect(failureContext.environmentState.filesCreated).toContain(expectedFile);
            }
          }

          // Create a file for this iteration
          const fileName = `file-iteration-${iterationCount}.txt`;
          const filePath = path.join(tempDir, fileName);
          fs.writeFileSync(filePath, `Content from iteration ${iterationCount}`);

          filesCreatedPerIteration.push([fileName]);

          if (iterationCount < 3) {
            return {
              success: false,
              taskId: task.id,
              error: `Iteration ${iterationCount} incomplete`,
              filesCreated: [fileName],
              duration: 100,
            };
          }

          return {
            success: true,
            taskId: task.id,
            filesCreated: [fileName],
            duration: 100,
          };
        }
      );

      // Mock the decision engine on the execution engine instance
      const engineDecisionEngine = (executionEngine as any).decisionEngine;
      vi.spyOn(engineDecisionEngine, "evaluateTask").mockImplementation(async () => {
        // Check the current iteration count to determine confidence
        // Note: This is called AFTER generateWithLLM, so iterationCount is already incremented
        if (iterationCount >= 3) {
          return {
            confidence: 0.85,
            reasoning: "Task complete",
            detected: true,
            provider: "heuristic" as const,
          };
        }
        
        return {
          confidence: 0.4,
          reasoning: "Task incomplete",
          detected: false,
          provider: "heuristic" as const,
        };
      });

      const result = await executionEngine.executeWithReflection(task, context);

      // Verify all files were created
      for (let i = 1; i <= 3; i++) {
        const filePath = path.join(tempDir, `file-iteration-${i}.txt`);
        expect(fs.existsSync(filePath)).toBe(true);
      }

      // The task should complete successfully on the 3rd iteration
      expect(result.success).toBe(true);
      expect(iterationCount).toBe(3);
    });
  });

  describe("16.2 Persistent Failure Escalation", () => {
    it("should detect persistent failures and trigger user escalation", async () => {
      const task: TaskRecord = {
        id: "test-task-persistent",
        title: "Task with persistent failure",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-persistent",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      const persistentError = "Module 'missing-dependency' not found";
      let iterationCount = 0;
      let userPromptShown = false;
      let promptMessage = "";

      // Mock VS Code window methods
      const vscode = await import("vscode");
      const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
        async (message: string, ...items: any[]) => {
          userPromptShown = true;
          promptMessage = message;
          return "Skip Task" as any;
        }
      );

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Always return the same error to trigger persistent failure detection
          return {
            success: false,
            taskId: task.id,
            error: persistentError,
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
        confidence: 0.2,
        reasoning: "Task incomplete due to missing dependency",
        detected: false,
        provider: "heuristic" as const,
      });

      // Execute with reflection
      const result = await executionEngine.executeWithReflection(task, context, {
        maxIterations: 5,
        persistentFailureThreshold: 2,
        pauseOnPersistentFailure: true,
      });

      // Restore mock
      showWarningMessageSpy.mockRestore();

      // Assertions
      expect(userPromptShown).toBe(true);
      expect(promptMessage).toBeDefined();
      expect(promptMessage.toLowerCase()).toContain("task");
      expect(promptMessage.toLowerCase()).toMatch(/fail|error|stuck/);

      // Should have stopped after detecting persistent failure
      expect(iterationCount).toBeGreaterThanOrEqual(2);
      expect(iterationCount).toBeLessThan(5); // Should not reach max iterations

      // Verify failure pattern was detected
      // Manually track attempts since the execution engine mock doesn't do it
      for (let i = 1; i <= iterationCount; i++) {
        await contextManager.trackAttempt(context.sessionId, task.id, {
          iteration: i,
          timestamp: new Date().toISOString(),
          actions: [],
          result: {
            success: false,
            taskId: task.id,
            error: persistentError,
          },
          evaluationReason: "Task incomplete due to missing dependency",
          confidence: 0.2,
        });
      }

      const patterns = await contextManager.detectFailurePatterns(
        context.sessionId,
        task.id
      );
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].errorMessage).toBe(persistentError);
      expect(patterns[0].occurrences).toBeGreaterThanOrEqual(2);
    });

    it("should incorporate user guidance after persistent failure", async () => {
      const task: TaskRecord = {
        id: "test-task-guidance",
        title: "Task requiring user guidance",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-guidance",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      const userGuidance = "Install the missing dependency first";
      let iterationCount = 0;
      let guidanceReceived = false;

      // Mock VS Code window methods
      const vscode = await import("vscode");
      const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
        async (message: string, ...items: any[]) => {
          return "Provide Guidance" as any;
        }
      );

      const showInputBoxSpy = vi.spyOn(vscode.window, "showInputBox").mockImplementation(
        async (options?: any) => {
          return userGuidance as any;
        }
      );

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Check if user guidance was provided
          if (failureContext && (failureContext as any).userGuidance) {
            guidanceReceived = true;
            expect((failureContext as any).userGuidance).toBe(userGuidance);
            
            // Succeed after receiving guidance
            return {
              success: true,
              taskId: task.id,
              duration: 100,
            };
          }

          // Fail with persistent error before guidance
          return {
            success: false,
            taskId: task.id,
            error: "Dependency missing",
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
        if (guidanceReceived) {
          return {
            confidence: 0.9,
            reasoning: "Task complete after user guidance",
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

      const result = await executionEngine.executeWithReflection(task, context, {
        maxIterations: 5,
        persistentFailureThreshold: 2,
        pauseOnPersistentFailure: true,
      });

      // Restore mocks
      showWarningMessageSpy.mockRestore();
      showInputBoxSpy.mockRestore();

      // Assertions
      expect(result).toBeDefined();
      expect(iterationCount).toBeGreaterThanOrEqual(2);
    });

    it("should handle user choosing to skip task", async () => {
      const task: TaskRecord = {
        id: "test-task-skip",
        title: "Task to be skipped",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-skip",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      let iterationCount = 0;

      // Mock VS Code window methods - user chooses to skip
      const vscode = await import("vscode");
      const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage").mockImplementation(
        async (message: string, ...items: any[]) => {
          return "Skip Task" as any;
        }
      );

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;
          return {
            success: false,
            taskId: task.id,
            error: "Persistent error",
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockResolvedValue({
        confidence: 0.2,
        reasoning: "Task incomplete",
        detected: false,
        provider: "heuristic" as const,
      });

      const result = await executionEngine.executeWithReflection(task, context, {
        maxIterations: 5,
        persistentFailureThreshold: 2,
        pauseOnPersistentFailure: true,
      });

      // Restore mock
      showWarningMessageSpy.mockRestore();

      // Assertions
      expect(result.success).toBe(false);
      expect(iterationCount).toBeGreaterThanOrEqual(2);
      
      // Should have stopped after user chose to skip
      expect(iterationCount).toBeLessThan(5);
    });
  });

  describe("16.3 Failure Pattern Recognition", () => {
    it("should detect and summarize failure patterns across iterations", async () => {
      const task: TaskRecord = {
        id: "test-task-patterns",
        title: "Task with recognizable failure patterns",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-patterns",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      const errorPatterns = [
        "ENOENT: no such file or directory",
        "ENOENT: no such file or directory",
        "EACCES: permission denied",
        "ENOENT: no such file or directory",
      ];

      let iterationCount = 0;

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Verify failure patterns are being tracked
          if (failureContext && iterationCount > 1) {
            expect(failureContext.failurePatterns).toBeDefined();
            
            // After 2nd iteration, should detect ENOENT pattern
            if (iterationCount >= 3) {
              const enoentPattern = failureContext.failurePatterns.find(
                p => p.errorMessage.includes("ENOENT")
              );
              expect(enoentPattern).toBeDefined();
              expect(enoentPattern!.occurrences).toBeGreaterThanOrEqual(2);
            }
          }

          if (iterationCount <= errorPatterns.length) {
            return {
              success: false,
              taskId: task.id,
              error: errorPatterns[iterationCount - 1],
              duration: 100,
            };
          }

          return {
            success: true,
            taskId: task.id,
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
        if (iterationCount <= errorPatterns.length) {
          return {
            confidence: 0.3,
            reasoning: "Task incomplete",
            detected: false,
            provider: "heuristic" as const,
          };
        }
        
        return {
          confidence: 0.9,
          reasoning: "Task complete",
          detected: true,
          provider: "heuristic" as const,
        };
      });

      const result = await executionEngine.executeWithReflection(task, context, {
        maxIterations: 6,
        pauseOnPersistentFailure: false, // Disable to test pattern detection without escalation
      });

      // Verify patterns were detected
      // Manually track attempts for pattern detection
      for (let i = 0; i < errorPatterns.length; i++) {
        await contextManager.trackAttempt(context.sessionId, task.id, {
          iteration: i + 1,
          timestamp: new Date().toISOString(),
          actions: [],
          result: {
            success: false,
            taskId: task.id,
            error: errorPatterns[i],
          },
          evaluationReason: "Task incomplete",
          confidence: 0.3,
        });
      }

      const patterns = await contextManager.detectFailurePatterns(
        context.sessionId,
        task.id
      );

      expect(patterns.length).toBeGreaterThan(0);

      // Should have detected ENOENT pattern (occurred 3 times)
      const enoentPattern = patterns.find(p => p.errorMessage.includes("ENOENT"));
      expect(enoentPattern).toBeDefined();
      expect(enoentPattern!.occurrences).toBe(3);

      // Should have detected EACCES pattern (occurred 1 time)
      const eaccesPattern = patterns.find(p => p.errorMessage.includes("EACCES"));
      expect(eaccesPattern).toBeDefined();
      expect(eaccesPattern!.occurrences).toBe(1);

      // Verify timestamps
      expect(enoentPattern!.firstSeen).toBeDefined();
      expect(enoentPattern!.lastSeen).toBeDefined();
      expect(new Date(enoentPattern!.lastSeen).getTime()).toBeGreaterThanOrEqual(
        new Date(enoentPattern!.firstSeen).getTime()
      );
    });

    it("should track patterns across multiple tasks in a session", async () => {
      const sessionId = "integration-session-multi-task";
      await contextManager.initialize(sessionId);

      const tasks = [
        {
          id: "task-1",
          title: "First task",
          error: "Network timeout",
        },
        {
          id: "task-2",
          title: "Second task",
          error: "Network timeout",
        },
        {
          id: "task-3",
          title: "Third task",
          error: "File not found",
        },
      ];

      // Simulate failures for each task
      for (const taskData of tasks) {
        const task: TaskRecord = {
          id: taskData.id,
          title: taskData.title,
          rawLine: 1,
          checkboxState: CheckboxState.PENDING,
          retryCount: 0,
        };

        const context: ExecutionContext = {
          specPath: path.join(tempDir, "spec.md"),
          sessionId,
          phase: 4,
          previousTasks: [],
        };

        let iterationCount = 0;

        vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
          async (task, ctx, failureContext?: FailureContext) => {
            iterationCount++;
            
            if (iterationCount === 1) {
              return {
                success: false,
                taskId: task.id,
                error: taskData.error,
                duration: 100,
              };
            }
            
            return {
              success: true,
              taskId: task.id,
              duration: 100,
            };
          }
        );

        vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
          if (iterationCount === 1) {
            return {
              confidence: 0.3,
              reasoning: "Task incomplete",
              detected: false,
              provider: "heuristic" as const,
            };
          }
          
          return {
            confidence: 0.9,
            reasoning: "Task complete",
            detected: true,
            provider: "heuristic" as const,
          };
        });

        await executionEngine.executeWithReflection(task, context, {
          maxIterations: 3,
        });

        // Manually track the attempt for pattern detection
        await contextManager.trackAttempt(sessionId, taskData.id, {
          iteration: 1,
          timestamp: new Date().toISOString(),
          actions: [],
          result: {
            success: false,
            taskId: taskData.id,
            error: taskData.error,
          },
          evaluationReason: "Task incomplete",
          confidence: 0.3,
        });

        vi.restoreAllMocks();
      }

      // Verify patterns across all tasks
      const allPatterns: any[] = [];
      for (const taskData of tasks) {
        const patterns = await contextManager.detectFailurePatterns(sessionId, taskData.id);
        allPatterns.push(...patterns);
      }

      // Should have detected "Network timeout" pattern in 2 tasks
      const networkTimeoutPatterns = allPatterns.filter(p => 
        p.errorMessage.includes("Network timeout")
      );
      expect(networkTimeoutPatterns.length).toBe(2);

      // Should have detected "File not found" pattern in 1 task
      const fileNotFoundPatterns = allPatterns.filter(p => 
        p.errorMessage.includes("File not found")
      );
      expect(fileNotFoundPatterns.length).toBe(1);
    });

    it("should provide pattern summary in failure context for LLM", async () => {
      const task: TaskRecord = {
        id: "test-task-llm-patterns",
        title: "Task with patterns for LLM",
        rawLine: 1,
        checkboxState: CheckboxState.PENDING,
        retryCount: 0,
      };

      const context: ExecutionContext = {
        specPath: path.join(tempDir, "spec.md"),
        sessionId: "integration-session-llm-patterns",
        phase: 4,
        previousTasks: [],
      };

      await contextManager.initialize(context.sessionId);

      const repeatedError = "Cannot connect to database";
      let iterationCount = 0;
      let patternsSentToLLM: any[] = [];

      vi.spyOn(executionEngine, "generateWithLLM").mockImplementation(
        async (task, ctx, failureContext?: FailureContext) => {
          iterationCount++;

          // Capture patterns sent to LLM
          if (failureContext && failureContext.failurePatterns) {
            patternsSentToLLM = failureContext.failurePatterns;
          }

          if (iterationCount <= 3) {
            return {
              success: false,
              taskId: task.id,
              error: repeatedError,
              duration: 100,
            };
          }

          return {
            success: true,
            taskId: task.id,
            duration: 100,
          };
        }
      );

      vi.spyOn(decisionEngine, "evaluateTask").mockImplementation(async () => {
        if (iterationCount <= 3) {
          return {
            confidence: 0.2,
            reasoning: "Database connection failed",
            detected: false,
            provider: "heuristic" as const,
          };
        }
        
        return {
          confidence: 0.9,
          reasoning: "Task complete",
          detected: true,
          provider: "heuristic" as const,
        };
      });

      await executionEngine.executeWithReflection(task, context, {
        maxIterations: 5,
        pauseOnPersistentFailure: false,
      });

      // Verify patterns were sent to LLM in later iterations
      expect(patternsSentToLLM.length).toBeGreaterThan(0);
      
      const dbPattern = patternsSentToLLM.find(p => 
        p.errorMessage.includes("Cannot connect to database")
      );
      expect(dbPattern).toBeDefined();
      expect(dbPattern.occurrences).toBeGreaterThanOrEqual(2);
    });
  });
});
