/**
 * Task Generator Tests
 * Tests for task generation functionality
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { TaskGenerator, Task, TaskDocument } from "./task-generator";
import {
  RequirementsDocument,
  Requirement,
  UserStory,
  AcceptanceCriterion,
} from "./requirements-generator";
import {
  DesignDocument,
  CorrectnessProperty,
  ComponentDescription,
  DataModel,
  TestingStrategy,
} from "./design-generator";

// Arbitraries for property-based testing

/**
 * Generate arbitrary task IDs with max 2 levels
 */
const arbitraryTaskId = (): fc.Arbitrary<string> => {
  return fc.oneof(
    // Top-level task: just a number
    fc.integer({ min: 1, max: 100 }).map(String),
    // Subtask: N.M format
    fc
      .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 20 }))
      .map(([parent, child]) => `${parent}.${child}`)
  );
};

/**
 * Generate arbitrary task description
 */
const arbitraryTaskDescription = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.constant("Implement core functionality"),
    fc.constant("Write unit tests"),
    fc.constant("Write property test"),
    fc.constant("Create data models"),
    fc.constant("Set up infrastructure"),
    fc.constant("Checkpoint - Ensure all tests pass")
  );
};

/**
 * Generate arbitrary subtask (no nested subtasks)
 */
const arbitrarySubtask = (): fc.Arbitrary<Task> => {
  return fc.record({
    id: fc
      .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 20 }))
      .map(([parent, child]) => `${parent}.${child}`),
    description: arbitraryTaskDescription(),
    optional: fc.boolean(),
    completed: fc.boolean(),
    subtasks: fc.constant([]), // Subtasks cannot have subtasks
    requirementRefs: fc.array(fc.integer({ min: 1, max: 20 }).map(String), {
      maxLength: 3,
    }),
    propertyRef: fc.option(
      fc.integer({ min: 1, max: 50 }).map((n) => `Property ${n}`),
      { nil: undefined }
    ),
  });
};

/**
 * Generate arbitrary top-level task
 */
const arbitraryTask = (): fc.Arbitrary<Task> => {
  return fc.record({
    id: fc.integer({ min: 1, max: 100 }).map(String),
    description: arbitraryTaskDescription(),
    optional: fc.boolean(),
    completed: fc.boolean(),
    subtasks: fc.array(arbitrarySubtask(), { maxLength: 5 }),
    requirementRefs: fc.array(fc.integer({ min: 1, max: 20 }).map(String), {
      maxLength: 3,
    }),
    propertyRef: fc.option(
      fc.integer({ min: 1, max: 50 }).map((n) => `Property ${n}`),
      { nil: undefined }
    ),
  });
};

/**
 * Generate arbitrary task document
 */
const arbitraryTaskDocument = (): fc.Arbitrary<TaskDocument> => {
  return fc.record({
    tasks: fc.array(arbitraryTask(), { minLength: 1, maxLength: 10 }),
  });
};

/**
 * Generate arbitrary requirements document
 */
const arbitraryRequirementsDocument =
  (): fc.Arbitrary<RequirementsDocument> => {
    return fc.record({
      introduction: fc.lorem({ maxCount: 2 }),
      glossary: fc.array(
        fc.record({
          term: fc.lorem({ maxCount: 1 }),
          definition: fc.lorem({ maxCount: 2 }),
        }),
        { maxLength: 5 }
      ),
      requirements: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 20 }).map(String),
          userStory: fc.record({
            role: fc.constant("developer"),
            feature: fc.lorem({ maxCount: 3 }),
            benefit: fc.lorem({ maxCount: 3 }),
          }),
          acceptanceCriteria: fc.array(
            fc.record({
              id: fc
                .tuple(
                  fc.integer({ min: 1, max: 20 }),
                  fc.integer({ min: 1, max: 5 })
                )
                .map(([req, crit]) => `${req}.${crit}`),
              text: fc.lorem({ maxCount: 5 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
        }),
        { minLength: 1, maxLength: 10 }
      ),
    });
  };

/**
 * Generate arbitrary design document
 */
const arbitraryDesignDocument = (): fc.Arbitrary<DesignDocument> => {
  return fc.record({
    overview: fc.lorem({ maxCount: 3 }),
    architecture: fc.lorem({ maxCount: 3 }),
    components: fc.array(
      fc.record({
        name: fc.lorem({ maxCount: 1 }).map((s) => s + "Component"),
        description: fc.lorem({ maxCount: 2 }),
        interfaces: fc.array(fc.lorem({ maxCount: 1 }), { maxLength: 3 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    dataModels: fc.array(
      fc.record({
        name: fc.lorem({ maxCount: 1 }),
        description: fc.lorem({ maxCount: 2 }),
        fields: fc.constant({}),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    correctnessProperties: fc.array(
      fc.record({
        id: fc.integer({ min: 1, max: 50 }).map((n) => `Property ${n}`),
        description: fc.lorem({ maxCount: 5 }),
        validatesRequirements: fc.array(
          fc
            .tuple(
              fc.integer({ min: 1, max: 20 }),
              fc.integer({ min: 1, max: 5 })
            )
            .map(([req, crit]) => `${req}.${crit}`),
          { minLength: 1, maxLength: 3 }
        ),
      }),
      { maxLength: 10 }
    ),
    errorHandling: fc.lorem({ maxCount: 3 }),
    testingStrategy: fc.record({
      unitTesting: fc.lorem({ maxCount: 2 }),
      propertyBasedTesting: fc.lorem({ maxCount: 2 }),
      pbtLibrary: fc.constant("fast-check"),
      iterations: fc.constant(100),
      coverage: fc.lorem({ maxCount: 2 }),
    }),
  });
};

describe("TaskGenerator - Property Tests", () => {
  const generator = new TaskGenerator();

  it("Property 9: Task hierarchy constraint", () => {
    // **Feature: copilot-spec-extension, Property 9: Task hierarchy constraint**
    fc.assert(
      fc.property(
        arbitraryDesignDocument(),
        arbitraryRequirementsDocument(),
        (design, requirements) => {
          const taskDoc = generator.generateTasks(design, requirements);

          // Verify no task has more than 2 levels of hierarchy
          for (const task of taskDoc.tasks) {
            // Top-level task ID should be just a number
            expect(task.id).toMatch(/^\d+$/);

            // Check subtasks
            for (const subtask of task.subtasks) {
              // Subtask ID should be in format "N.M"
              expect(subtask.id).toMatch(/^\d+\.\d+$/);

              // Subtasks should not have their own subtasks
              expect(subtask.subtasks).toHaveLength(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 10: Optional task marking", () => {
    // **Feature: copilot-spec-extension, Property 10: Optional task marking**
    fc.assert(
      fc.property(arbitraryTaskDocument(), (taskDoc) => {
        // Test normal mode (strictMode = false)
        const markedTasks = generator.markOptionalTasks(taskDoc.tasks, false);

        // Verify all test-related subtasks are marked as optional
        for (const task of markedTasks) {
          for (const subtask of task.subtasks) {
            const desc = subtask.description.toLowerCase();
            const isTestRelated =
              desc.includes("test") ||
              desc.includes("property test") ||
              desc.includes("unit test") ||
              desc.includes("integration test") ||
              desc.includes("write test");

            if (isTestRelated) {
              expect(subtask.optional).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("Property 11: Checkpoint task inclusion", () => {
    // **Feature: copilot-spec-extension, Property 11: Checkpoint task inclusion**
    fc.assert(
      fc.property(arbitraryTaskDocument(), (taskDoc) => {
        const tasksWithCheckpoints = generator.insertCheckpoints(taskDoc.tasks);

        // Verify at least one checkpoint task exists
        const hasCheckpoint = tasksWithCheckpoints.some(
          (task) =>
            task.description.toLowerCase().includes("checkpoint") ||
            task.description.includes("Ensure all tests pass")
        );

        expect(hasCheckpoint).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 28: Property test iteration configuration", () => {
    // **Feature: copilot-spec-extension, Property 28: Property test iteration configuration**
    fc.assert(
      fc.property(
        arbitraryDesignDocument(),
        arbitraryRequirementsDocument(),
        (design, requirements) => {
          const taskDoc = generator.generateTasks(design, requirements);

          // Find all property test tasks
          const propertyTestTasks: Task[] = [];
          for (const task of taskDoc.tasks) {
            for (const subtask of task.subtasks) {
              if (subtask.propertyRef) {
                propertyTestTasks.push(subtask);
              }
            }
          }

          // Verify each property test task has a property reference
          for (const propTask of propertyTestTasks) {
            expect(propTask.propertyRef).toBeTruthy();
            expect(propTask.propertyRef).toMatch(/^Property \d+$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("TaskGenerator - Unit Tests", () => {
  const generator = new TaskGenerator();

  describe("Task Hierarchy Validation", () => {
    it("should accept valid task hierarchy with 2 levels", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Top level task",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Subtask",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      expect(() => generator.validateTaskHierarchy(tasks)).not.toThrow();
    });

    it("should reject task with invalid top-level ID", () => {
      const tasks: Task[] = [
        {
          id: "1.1",
          description: "Invalid top level",
          optional: false,
          completed: false,
          subtasks: [],
          requirementRefs: [],
        },
      ];

      expect(() => generator.validateTaskHierarchy(tasks)).toThrow(
        /Invalid top-level task ID/
      );
    });

    it("should reject subtask with invalid ID format", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Top level",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "invalid",
              description: "Bad subtask",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      expect(() => generator.validateTaskHierarchy(tasks)).toThrow(
        /Invalid subtask ID/
      );
    });

    it("should reject tasks with more than 2 levels", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Top level",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Subtask",
              optional: false,
              completed: false,
              subtasks: [
                {
                  id: "1.1.1",
                  description: "Too deep",
                  optional: false,
                  completed: false,
                  subtasks: [],
                  requirementRefs: [],
                },
              ],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      expect(() => generator.validateTaskHierarchy(tasks)).toThrow(
        /maximum hierarchy depth is 2 levels/
      );
    });
  });

  describe("Optional Task Marking", () => {
    it("should mark unit test tasks as optional", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Write unit tests",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks);
      expect(marked[0].subtasks[0].optional).toBe(true);
    });

    it("should mark property test tasks as optional", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Write property test for validation",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks);
      expect(marked[0].subtasks[0].optional).toBe(true);
    });

    it("should mark integration test tasks as optional", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Write integration tests",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks);
      expect(marked[0].subtasks[0].optional).toBe(true);
    });

    it("should not mark non-test tasks as optional", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Implement core functionality",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks);
      expect(marked[0].subtasks[0].optional).toBe(false);
    });

    it("should not mark any tasks as optional in strict mode", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Write unit tests",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
            {
              id: "1.2",
              description: "Write property test",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
            {
              id: "1.3",
              description: "Implement core functionality",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks, true);

      // In strict mode, no tasks should be marked as optional
      expect(marked[0].optional).toBe(false);
      expect(marked[0].subtasks[0].optional).toBe(false); // unit tests
      expect(marked[0].subtasks[1].optional).toBe(false); // property test
      expect(marked[0].subtasks[2].optional).toBe(false); // core functionality
    });

    it("should mark test tasks as optional in normal mode", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Implement feature",
          optional: false,
          completed: false,
          subtasks: [
            {
              id: "1.1",
              description: "Write unit tests",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
            {
              id: "1.2",
              description: "Implement core functionality",
              optional: false,
              completed: false,
              subtasks: [],
              requirementRefs: [],
            },
          ],
          requirementRefs: [],
        },
      ];

      const marked = generator.markOptionalTasks(tasks, false);

      // In normal mode, test tasks should be marked as optional
      expect(marked[0].subtasks[0].optional).toBe(true); // unit tests
      expect(marked[0].subtasks[1].optional).toBe(false); // core functionality
    });
  });

  describe("Checkpoint Insertion", () => {
    it("should add final checkpoint if missing", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Task 1",
          optional: false,
          completed: false,
          subtasks: [],
          requirementRefs: [],
        },
        {
          id: "2",
          description: "Task 2",
          optional: false,
          completed: false,
          subtasks: [],
          requirementRefs: [],
        },
      ];

      const withCheckpoints = generator.insertCheckpoints(tasks);
      const lastTask = withCheckpoints[withCheckpoints.length - 1];

      expect(lastTask.description.toLowerCase()).toContain("checkpoint");
    });

    it("should not duplicate checkpoint if last task is already a checkpoint", () => {
      const tasks: Task[] = [
        {
          id: "1",
          description: "Task 1",
          optional: false,
          completed: false,
          subtasks: [],
          requirementRefs: [],
        },
        {
          id: "2",
          description: "Checkpoint - Ensure all tests pass",
          optional: false,
          completed: false,
          subtasks: [],
          requirementRefs: [],
        },
      ];

      const withCheckpoints = generator.insertCheckpoints(tasks);

      // Should not add another checkpoint
      expect(withCheckpoints.length).toBe(2);
    });

    it("should insert checkpoints at intervals for large task lists", () => {
      const tasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
        id: String(i + 1),
        description: `Task ${i + 1}`,
        optional: false,
        completed: false,
        subtasks: [],
        requirementRefs: [],
      }));

      const withCheckpoints = generator.insertCheckpoints(tasks);

      // Should have more tasks than original due to inserted checkpoints
      expect(withCheckpoints.length).toBeGreaterThan(tasks.length);

      // Should have at least one checkpoint
      const checkpoints = withCheckpoints.filter((t) =>
        t.description.toLowerCase().includes("checkpoint")
      );
      expect(checkpoints.length).toBeGreaterThan(0);
    });
  });

  describe("Task Generation", () => {
    it("should generate tasks from design and requirements", () => {
      const requirements: RequirementsDocument = {
        introduction: "Test system",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: {
              role: "developer",
              feature: "create tasks",
              benefit: "organize work",
            },
            acceptanceCriteria: [
              { id: "1.1", text: "WHEN creating THEN system SHALL save" },
            ],
          },
        ],
      };

      const design: DesignDocument = {
        overview: "Test",
        architecture: "Test",
        components: [{ name: "TaskComponent", description: "Handles tasks" }],
        dataModels: [{ name: "Task", description: "Task model" }],
        correctnessProperties: [
          {
            id: "Property 1",
            description: "For any task, it should be valid",
            validatesRequirements: ["1.1"],
          },
        ],
        errorHandling: "Test",
        testingStrategy: {
          unitTesting: "Test",
          propertyBasedTesting: "Test",
          pbtLibrary: "fast-check",
          iterations: 100,
          coverage: "80%",
        },
      };

      const taskDoc = generator.generateTasks(design, requirements);

      expect(taskDoc.tasks.length).toBeGreaterThan(0);
      expect(taskDoc.tasks[0].id).toMatch(/^\d+$/);
    });
  });

  describe("Markdown Formatting", () => {
    it("should format tasks as markdown with checkboxes", () => {
      const taskDoc: TaskDocument = {
        tasks: [
          {
            id: "1",
            description: "Implement feature",
            optional: false,
            completed: false,
            subtasks: [
              {
                id: "1.1",
                description: "Write tests",
                optional: true,
                completed: false,
                subtasks: [],
                requirementRefs: ["1.1"],
              },
            ],
            requirementRefs: [],
          },
        ],
      };

      const markdown = generator.formatAsMarkdown(taskDoc);

      expect(markdown).toContain("# Implementation Plan");
      expect(markdown).toContain("- [ ] 1. Implement feature");
      expect(markdown).toContain("- [ ]* 1.1. Write tests");
      expect(markdown).toContain("_Requirements: 1.1_");
    });

    it("should mark completed tasks with [x]", () => {
      const taskDoc: TaskDocument = {
        tasks: [
          {
            id: "1",
            description: "Completed task",
            optional: false,
            completed: true,
            subtasks: [],
            requirementRefs: [],
          },
        ],
      };

      const markdown = generator.formatAsMarkdown(taskDoc);

      expect(markdown).toContain("- [x] 1. Completed task");
    });

    it("should include property references for property test tasks", () => {
      const taskDoc: TaskDocument = {
        tasks: [
          {
            id: "1",
            description: "Implement feature",
            optional: false,
            completed: false,
            subtasks: [
              {
                id: "1.1",
                description: "Write property test",
                optional: false,
                completed: false,
                subtasks: [],
                requirementRefs: ["1.1"],
                propertyRef: "Property 1",
              },
            ],
            requirementRefs: [],
          },
        ],
      };

      const markdown = generator.formatAsMarkdown(taskDoc);

      expect(markdown).toContain("**Property 1**");
      expect(markdown).toContain("**Validates: Requirements 1.1**");
    });
  });
});
