/**
 * Tests for Design Generator
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  DesignGenerator,
  DesignDocument,
  ComponentDescription,
  DataModel,
  CorrectnessProperty,
  TestingStrategy,
  PreworkAnalysis,
} from "./design-generator";
import {
  RequirementsDocument,
  GlossaryEntry,
  AcceptanceCriterion,
} from "./requirements-generator";

describe("DesignGenerator", () => {
  describe("Unit Tests", () => {
    const generator = new DesignGenerator();

    describe("Section Generation", () => {
      it("should generate overview section from requirements", () => {
        const requirements: RequirementsDocument = {
          introduction: "This is a test system for managing tasks.",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.overview).toContain("This is a test system");
        expect(design.overview).toContain("design document");
      });

      it("should generate architecture section", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test system",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.architecture).toBeTruthy();
        expect(design.architecture).toContain("architecture");
        expect(design.architecture.length).toBeGreaterThan(0);
      });

      it("should generate components from requirements", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test system",
          glossary: [],
          requirements: [
            {
              id: "1",
              userStory: {
                role: "user",
                feature: "manage tasks and projects",
                benefit: "stay organized",
              },
              acceptanceCriteria: [],
            },
          ],
        };

        const design = generator.generateDesign(requirements);

        expect(design.components).toBeDefined();
        expect(Array.isArray(design.components)).toBe(true);
        expect(design.components.length).toBeGreaterThan(0);
      });

      it("should generate data models from glossary", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test system",
          glossary: [
            { term: "Task", definition: "A unit of work to be completed" },
            { term: "Project", definition: "A collection of related tasks" },
          ],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.dataModels).toBeDefined();
        expect(design.dataModels.length).toBe(2);
        expect(design.dataModels[0].name).toBe("Task");
        expect(design.dataModels[1].name).toBe("Project");
      });

      it("should generate error handling section", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test system",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.errorHandling).toBeTruthy();
        expect(design.errorHandling).toContain("error");
        expect(design.errorHandling.length).toBeGreaterThan(0);
      });

      it("should generate testing strategy with PBT library", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test system",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.testingStrategy).toBeDefined();
        expect(design.testingStrategy.pbtLibrary).toBe("fast-check");
        expect(design.testingStrategy.iterations).toBe(100);
        expect(design.testingStrategy.unitTesting).toBeTruthy();
        expect(design.testingStrategy.propertyBasedTesting).toBeTruthy();
      });

      it("should ensure at least one component when none extracted", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.components.length).toBeGreaterThan(0);
      });

      it("should ensure at least one data model when glossary is empty", () => {
        const requirements: RequirementsDocument = {
          introduction: "Test",
          glossary: [],
          requirements: [],
        };

        const design = generator.generateDesign(requirements);

        expect(design.dataModels.length).toBeGreaterThan(0);
      });
    });

    describe("Property Formatting", () => {
      it("should format properties with 'For any' quantification", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "1.1",
            criterionText: "WHEN adding a task THEN it should be stored",
            thoughts: "This is testable",
            testable: "yes-property",
          },
        ];

        const properties = generator.generateProperties(analyses);

        expect(properties.length).toBeGreaterThan(0);
        expect(properties[0].description.toLowerCase()).toMatch(/for any/);
      });

      it("should include requirement references in properties", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "2.3",
            criterionText: "WHEN validating input THEN check format",
            thoughts: "This is testable",
            testable: "yes-property",
          },
        ];

        const properties = generator.generateProperties(analyses);

        expect(properties[0].validatesRequirements).toContain("2.3");
      });

      it("should assign sequential property IDs", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "1.1",
            criterionText: "WHEN adding a task THEN it should be stored",
            thoughts: "Testable",
            testable: "yes-property",
          },
          {
            criterionId: "1.2",
            criterionText: "WHEN deleting a task THEN it should be removed",
            thoughts: "Testable",
            testable: "yes-property",
          },
        ];

        const properties = generator.generateProperties(analyses);

        expect(properties.length).toBeGreaterThanOrEqual(2);
        expect(properties[0].id).toBe("Property 1");
        expect(properties[1].id).toBe("Property 2");
      });

      it("should filter out non-testable criteria", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "1.1",
            criterionText: "Testable criterion",
            thoughts: "This is testable",
            testable: "yes-property",
          },
          {
            criterionId: "1.2",
            criterionText: "Non-testable criterion",
            thoughts: "This is not testable",
            testable: "no",
          },
          {
            criterionId: "1.3",
            criterionText: "Edge case",
            thoughts: "This is an edge case",
            testable: "edge-case",
          },
        ];

        const properties = generator.generateProperties(analyses);

        // Only the testable property should be included
        expect(properties.length).toBe(1);
        expect(properties[0].validatesRequirements).toContain("1.1");
      });

      it("should merge duplicate properties and combine requirements", () => {
        const properties: CorrectnessProperty[] = [
          {
            id: "Property 1",
            description: "_For any_ valid input, the system should validate it",
            validatesRequirements: ["1.1"],
          },
          {
            id: "Property 2",
            description: "_For any_ valid input, the system should validate it",
            validatesRequirements: ["1.2"],
          },
        ];

        const reflected = generator.reflectProperties(properties);

        expect(reflected.length).toBe(1);
        expect(reflected[0].validatesRequirements).toContain("1.1");
        expect(reflected[0].validatesRequirements).toContain("1.2");
      });
    });

    describe("Round-trip Property Detection", () => {
      it("should detect parsing-related criteria", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN parsing user input THEN the system SHALL validate it",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("yes-property");
        expect(analyses[0].thoughts.toLowerCase()).toContain("round-trip");
      });

      it("should detect serialization-related criteria", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN serializing data THEN the system SHALL encode it as JSON",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("yes-property");
        expect(analyses[0].thoughts.toLowerCase()).toContain("round-trip");
      });

      it("should detect encoding-related criteria", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN encoding values THEN the system SHALL preserve structure",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("yes-property");
      });

      it("should detect decoding-related criteria", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN decoding messages THEN the system SHALL restore data",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("yes-property");
      });

      it("should generate round-trip property descriptions for parsing", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "1.1",
            criterionText: "WHEN parsing input THEN validate against grammar",
            thoughts: "Round-trip property",
            testable: "yes-property",
          },
        ];

        const properties = generator.generateProperties(analyses);

        expect(properties[0].description.toLowerCase()).toContain(
          "serializing"
        );
        expect(properties[0].description.toLowerCase()).toContain(
          "deserializing"
        );
      });

      it("should generate round-trip property descriptions for encoding", () => {
        const analyses: PreworkAnalysis[] = [
          {
            criterionId: "1.1",
            criterionText: "WHEN encoding data THEN preserve structure",
            thoughts: "Round-trip property",
            testable: "yes-property",
          },
        ];

        const properties = generator.generateProperties(analyses);

        expect(properties[0].description.toLowerCase()).toContain("encoding");
        expect(properties[0].description.toLowerCase()).toContain("decoding");
      });
    });

    describe("Testability Analysis", () => {
      it("should categorize UI-related criteria as not testable", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN displaying results THEN show them in a clear interface",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("no");
      });

      it("should categorize edge cases correctly", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN input is empty THEN the system SHALL reject it",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("edge-case");
      });

      it("should categorize specific examples correctly", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN a user clicks the button THEN navigate to page",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("yes-example");
      });

      it("should categorize vague criteria as not testable", () => {
        const criteria: AcceptanceCriterion[] = [
          {
            id: "1.1",
            text: "WHEN processing THEN maintain appropriate quality",
          },
        ];

        const analyses = generator.analyzeTestability(criteria);

        expect(analyses[0].testable).toBe("no");
      });
    });

    describe("Design Document Validation", () => {
      it("should validate complete design documents", () => {
        const design: DesignDocument = {
          overview: "Test overview",
          architecture: "Test architecture",
          components: [{ name: "TestComponent", description: "Test" }],
          dataModels: [{ name: "TestModel", description: "Test" }],
          correctnessProperties: [],
          errorHandling: "Test error handling",
          testingStrategy: {
            unitTesting: "Test",
            propertyBasedTesting: "Test",
            pbtLibrary: "fast-check",
            iterations: 100,
            coverage: "80%",
          },
        };

        const validation = generator.validateCompleteness(design);

        expect(validation.complete).toBe(true);
        expect(validation.missingSections).toHaveLength(0);
      });

      it("should detect missing overview", () => {
        const design: DesignDocument = {
          overview: "",
          architecture: "Test",
          components: [{ name: "Test", description: "Test" }],
          dataModels: [{ name: "Test", description: "Test" }],
          correctnessProperties: [],
          errorHandling: "Test",
          testingStrategy: {
            unitTesting: "Test",
            propertyBasedTesting: "Test",
            pbtLibrary: "fast-check",
            iterations: 100,
            coverage: "80%",
          },
        };

        const validation = generator.validateCompleteness(design);

        expect(validation.complete).toBe(false);
        expect(validation.missingSections).toContain("Overview");
      });

      it("should detect missing components", () => {
        const design: DesignDocument = {
          overview: "Test",
          architecture: "Test",
          components: [],
          dataModels: [{ name: "Test", description: "Test" }],
          correctnessProperties: [],
          errorHandling: "Test",
          testingStrategy: {
            unitTesting: "Test",
            propertyBasedTesting: "Test",
            pbtLibrary: "fast-check",
            iterations: 100,
            coverage: "80%",
          },
        };

        const validation = generator.validateCompleteness(design);

        expect(validation.complete).toBe(false);
        expect(validation.missingSections).toContain(
          "Components and Interfaces"
        );
      });

      it("should detect missing testing strategy library", () => {
        const design: DesignDocument = {
          overview: "Test",
          architecture: "Test",
          components: [{ name: "Test", description: "Test" }],
          dataModels: [{ name: "Test", description: "Test" }],
          correctnessProperties: [],
          errorHandling: "Test",
          testingStrategy: {
            unitTesting: "Test",
            propertyBasedTesting: "Test",
            pbtLibrary: "",
            iterations: 100,
            coverage: "80%",
          },
        };

        const validation = generator.validateCompleteness(design);

        expect(validation.complete).toBe(false);
        expect(validation.missingSections).toContain("Testing Strategy");
      });
    });

    describe("Markdown Formatting", () => {
      it("should format design document as markdown", () => {
        const design: DesignDocument = {
          overview: "Test overview",
          architecture: "Test architecture",
          components: [
            { name: "TestComponent", description: "Test component" },
          ],
          dataModels: [{ name: "TestModel", description: "Test model" }],
          correctnessProperties: [
            {
              id: "Property 1",
              description: "_For any_ input, output should be valid",
              validatesRequirements: ["1.1", "1.2"],
            },
          ],
          errorHandling: "Test error handling",
          testingStrategy: {
            unitTesting: "Unit test strategy",
            propertyBasedTesting: "PBT strategy",
            pbtLibrary: "fast-check",
            iterations: 100,
            coverage: "80%",
          },
        };

        const markdown = generator.formatAsMarkdown(design);

        expect(markdown).toContain("# Design Document");
        expect(markdown).toContain("## Overview");
        expect(markdown).toContain("## Architecture");
        expect(markdown).toContain("## Components and Interfaces");
        expect(markdown).toContain("## Data Models");
        expect(markdown).toContain("## Correctness Properties");
        expect(markdown).toContain("## Error Handling");
        expect(markdown).toContain("## Testing Strategy");
        expect(markdown).toContain("**Property 1**");
        expect(markdown).toContain("**Validates: Requirements 1.1, 1.2**");
      });
    });
  });

  describe("Property Tests", () => {
    it("Property 5: Design document completeness", () => {
      // **Feature: copilot-spec-extension, Property 5: Design document completeness**
      // For any generated design document, it should contain all required sections

      const generator = new DesignGenerator();

      fc.assert(
        fc.property(arbitraryRequirementsDocument(), (requirements) => {
          const design = generator.generateDesign(requirements);
          const validation = generator.validateCompleteness(design);

          // All required sections should be present
          expect(validation.complete).toBe(true);
          expect(validation.missingSections).toHaveLength(0);

          // Verify each section exists and has content
          expect(design.overview).toBeTruthy();
          expect(design.overview.trim().length).toBeGreaterThan(0);

          expect(design.architecture).toBeTruthy();
          expect(design.architecture.trim().length).toBeGreaterThan(0);

          expect(design.components).toBeDefined();
          expect(Array.isArray(design.components)).toBe(true);

          expect(design.dataModels).toBeDefined();
          expect(Array.isArray(design.dataModels)).toBe(true);

          expect(design.correctnessProperties).toBeDefined();
          expect(Array.isArray(design.correctnessProperties)).toBe(true);

          expect(design.errorHandling).toBeTruthy();
          expect(design.errorHandling.trim().length).toBeGreaterThan(0);

          expect(design.testingStrategy).toBeDefined();
          expect(design.testingStrategy.pbtLibrary).toBeTruthy();
        }),
        { numRuns: 100 }
      );
    });

    it("Property 6: Acceptance criteria analysis", () => {
      // **Feature: copilot-spec-extension, Property 6: Acceptance criteria analysis**
      // For any set of acceptance criteria, the prework analysis should categorize
      // each criterion as exactly one of: property, example, edge-case, or not testable

      const generator = new DesignGenerator();

      fc.assert(
        fc.property(
          fc.array(arbitraryAcceptanceCriterion(), {
            minLength: 1,
            maxLength: 10,
          }),
          (criteria) => {
            const analyses = generator.analyzeTestability(criteria);

            // Should have one analysis per criterion
            expect(analyses.length).toBe(criteria.length);

            // Each analysis should have exactly one testability category
            for (const analysis of analyses) {
              expect(analysis.criterionId).toBeTruthy();
              expect(analysis.criterionText).toBeTruthy();
              expect(analysis.thoughts).toBeTruthy();
              expect(analysis.testable).toMatch(
                /^(yes-property|yes-example|edge-case|no)$/
              );
            }

            // Each criterion should be analyzed
            for (let i = 0; i < criteria.length; i++) {
              expect(analyses[i].criterionId).toBe(criteria[i].id);
              expect(analyses[i].criterionText).toBe(criteria[i].text);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 7: Property formatting", () => {
      // **Feature: copilot-spec-extension, Property 7: Property formatting**
      // For any correctness property in the design document, it should contain
      // explicit universal quantification and reference specific requirements

      const generator = new DesignGenerator();

      fc.assert(
        fc.property(
          fc.array(arbitraryPreworkAnalysis(), { minLength: 1, maxLength: 10 }),
          (analyses) => {
            const properties = generator.generateProperties(analyses);

            // Each property should have proper formatting
            for (const property of properties) {
              // Should have an ID
              expect(property.id).toMatch(/^Property \d+$/);

              // Should have a description with universal quantification
              expect(property.description).toBeTruthy();
              expect(property.description.toLowerCase()).toMatch(
                /for (any|all)/
              );

              // Should reference at least one requirement
              expect(property.validatesRequirements).toBeDefined();
              expect(property.validatesRequirements.length).toBeGreaterThan(0);

              // Each requirement reference should be in the format X.Y
              for (const req of property.validatesRequirements) {
                expect(req).toMatch(/^\d+\.\d+$/);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 8: Round-trip properties for parsing", () => {
      // **Feature: copilot-spec-extension, Property 8: Round-trip properties for parsing**
      // For any requirements that mention parsing, serialization, encoding, or decoding,
      // the design document should include at least one round-trip correctness property

      const generator = new DesignGenerator();

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc
                .tuple(fc.nat({ max: 100 }), fc.nat({ max: 10 }))
                .map(([a, b]) => `${a}.${b}`),
              text: fc.constantFrom(
                "WHEN parsing user input THEN the system SHALL validate it",
                "WHEN serializing data THEN the system SHALL encode it correctly",
                "WHEN encoding values THEN the system SHALL preserve structure",
                "WHEN decoding messages THEN the system SHALL restore original data"
              ),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (criteria) => {
            const analyses = generator.analyzeTestability(criteria);
            const properties = generator.generateProperties(analyses);

            // Should have at least one property
            expect(properties.length).toBeGreaterThan(0);

            // At least one property should mention round-trip or equivalent concepts
            const hasRoundTripProperty = properties.some(
              (p) =>
                p.description.toLowerCase().includes("serializ") ||
                p.description.toLowerCase().includes("deserializ") ||
                p.description.toLowerCase().includes("equivalent")
            );

            expect(hasRoundTripProperty).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 27: Testing strategy library specification", () => {
      // **Feature: copilot-spec-extension, Property 27: Testing strategy library specification**
      // For any generated design document, the Testing Strategy section should explicitly
      // name a property-based testing library appropriate for the target language

      const generator = new DesignGenerator();

      fc.assert(
        fc.property(arbitraryRequirementsDocument(), (requirements) => {
          const design = generator.generateDesign(requirements);

          // Testing strategy should exist
          expect(design.testingStrategy).toBeDefined();

          // Should have a PBT library specified
          expect(design.testingStrategy.pbtLibrary).toBeDefined();
          expect(design.testingStrategy.pbtLibrary).toBeTruthy();
          expect(
            design.testingStrategy.pbtLibrary.trim().length
          ).toBeGreaterThan(0);

          // The library name should be a known PBT library
          const knownLibraries = [
            "fast-check",
            "hypothesis",
            "jqwik",
            "fscheck",
            "gopter",
            "proptest",
            "quickcheck",
          ];

          const libraryName = design.testingStrategy.pbtLibrary.toLowerCase();
          const isKnownLibrary = knownLibraries.some((lib) =>
            libraryName.includes(lib)
          );

          expect(isKnownLibrary).toBe(true);

          // The property-based testing description should mention the library
          expect(design.testingStrategy.propertyBasedTesting).toBeDefined();
          expect(design.testingStrategy.propertyBasedTesting).toContain(
            design.testingStrategy.pbtLibrary
          );
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Arbitraries for property-based testing

function arbitraryPreworkAnalysis(): fc.Arbitrary<PreworkAnalysis> {
  return fc.record({
    criterionId: fc
      .tuple(fc.nat({ max: 100 }), fc.nat({ max: 10 }))
      .map(([a, b]) => `${a}.${b}`),
    criterionText: fc
      .string({ minLength: 20, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    thoughts: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    testable: fc.constantFrom(
      "yes-property" as const,
      "yes-example" as const,
      "edge-case" as const,
      "no" as const
    ),
  });
}

function arbitraryAcceptanceCriterion(): fc.Arbitrary<AcceptanceCriterion> {
  return fc.record({
    id: fc
      .tuple(fc.nat({ max: 100 }), fc.nat({ max: 10 }))
      .map(([a, b]) => `${a}.${b}`),
    text: fc
      .string({ minLength: 20, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
  });
}

function arbitraryRequirementsDocument(): fc.Arbitrary<RequirementsDocument> {
  return fc.record({
    introduction: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    glossary: fc.array(arbitraryGlossaryEntry(), {
      minLength: 1,
      maxLength: 5,
    }),
    requirements: fc.array(arbitraryRequirement(), {
      minLength: 1,
      maxLength: 5,
    }),
  });
}

function arbitraryGlossaryEntry(): fc.Arbitrary<GlossaryEntry> {
  return fc.record({
    term: fc
      .string({ minLength: 3, maxLength: 20 })
      .filter((s) => /^[A-Z]/.test(s) && s.trim().length > 0),
    definition: fc
      .string({ minLength: 10, maxLength: 100 })
      .filter((s) => s.trim().length > 0),
  });
}

function arbitraryRequirement(): fc.Arbitrary<any> {
  return fc.record({
    id: fc.nat({ max: 100 }).map((n) => n.toString()),
    userStory: fc.record({
      role: fc.constantFrom("user", "developer", "admin", "system"),
      feature: fc
        .string({ minLength: 10, maxLength: 100 })
        .filter((s) => s.trim().length > 0),
      benefit: fc
        .string({ minLength: 10, maxLength: 100 })
        .filter((s) => s.trim().length > 0),
    }),
    acceptanceCriteria: fc.array(
      fc.record({
        id: fc
          .tuple(fc.nat({ max: 100 }), fc.nat({ max: 10 }))
          .map(([a, b]) => `${a}.${b}`),
        text: fc
          .string({ minLength: 20, maxLength: 200 })
          .filter((s) => s.trim().length > 0),
      }),
      { minLength: 2, maxLength: 5 }
    ),
  });
}
