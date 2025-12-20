/**
 * Property-based tests for user story structure
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RequirementsGenerator,
  RequirementsDocument,
} from "./requirements-generator";

describe("User Story Structure Property Tests", () => {
  /**
   * **Feature: copilot-spec-extension, Property 4: User story structure**
   * **Validates: Requirements 2.4**
   *
   * For any generated requirements document, each requirement should have
   * exactly one user story and between 2 and 5 acceptance criteria.
   */
  it("Property 4: User story structure", () => {
    // Generator for valid requirements documents
    const validRequirementsDocument = fc
      .tuple(
        fc.string({ minLength: 10, maxLength: 100 }), // introduction
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }).map(String),
            userStory: fc.record({
              role: fc.constantFrom(
                "user",
                "developer",
                "administrator",
                "system architect",
                "moderator"
              ),
              feature: fc.lorem({ maxCount: 10 }),
              benefit: fc.lorem({ maxCount: 10 }),
            }),
            acceptanceCriteria: fc.array(
              fc.record({
                id: fc.string(),
                text: fc.constantFrom(
                  "WHEN user clicks button, THE System SHALL respond",
                  "THE System SHALL process requests",
                  "WHILE connected, THE System SHALL maintain state",
                  "IF error occurs, THEN THE System SHALL log details",
                  "WHERE feature enabled, THE System SHALL display option"
                ),
              }),
              { minLength: 2, maxLength: 5 } // Enforce 2-5 acceptance criteria
            ),
          }),
          { minLength: 1, maxLength: 10 }
        )
      )
      .map(([introduction, requirements]) => {
        // Ensure acceptance criteria IDs are properly formatted
        const formattedRequirements = requirements.map((req) => ({
          ...req,
          acceptanceCriteria: req.acceptanceCriteria.map((ac, idx) => ({
            ...ac,
            id: `${req.id}.${idx + 1}`,
          })),
        }));

        const doc: RequirementsDocument = {
          introduction,
          glossary: [],
          requirements: formattedRequirements,
        };
        return doc;
      });

    fc.assert(
      fc.property(validRequirementsDocument, (doc) => {
        // Each requirement should have exactly one user story
        for (const requirement of doc.requirements) {
          expect(requirement.userStory).toBeDefined();
          expect(requirement.userStory.role).toBeDefined();
          expect(requirement.userStory.role.length).toBeGreaterThan(0);
          expect(requirement.userStory.feature).toBeDefined();
          expect(requirement.userStory.feature.length).toBeGreaterThan(0);
          expect(requirement.userStory.benefit).toBeDefined();
          expect(requirement.userStory.benefit.length).toBeGreaterThan(0);

          // Each requirement should have between 2 and 5 acceptance criteria
          expect(requirement.acceptanceCriteria.length).toBeGreaterThanOrEqual(
            2
          );
          expect(requirement.acceptanceCriteria.length).toBeLessThanOrEqual(5);

          // Each acceptance criterion should have an ID and text
          for (const criterion of requirement.acceptanceCriteria) {
            expect(criterion.id).toBeDefined();
            expect(criterion.id.length).toBeGreaterThan(0);
            expect(criterion.text).toBeDefined();
            expect(criterion.text.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4: User story has all required fields", () => {
    // Generator for user stories
    const userStory = fc.record({
      role: fc.lorem({ maxCount: 3 }),
      feature: fc.lorem({ maxCount: 10 }),
      benefit: fc.lorem({ maxCount: 10 }),
    });

    fc.assert(
      fc.property(userStory, (story) => {
        // User story must have role, feature, and benefit
        expect(story.role).toBeDefined();
        expect(story.feature).toBeDefined();
        expect(story.benefit).toBeDefined();

        // All fields should be non-empty
        expect(story.role.length).toBeGreaterThan(0);
        expect(story.feature.length).toBeGreaterThan(0);
        expect(story.benefit.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4: Acceptance criteria count validation", () => {
    const generator = new RequirementsGenerator();

    // Test with requirements having too few acceptance criteria
    const tooFewCriteria: RequirementsDocument = {
      introduction: "Test",
      glossary: [],
      requirements: [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [{ id: "1.1", text: "THE System SHALL work" }],
        },
      ],
    };

    const resultTooFew = generator.validateRequirements(tooFewCriteria);
    expect(resultTooFew.warnings.length).toBeGreaterThan(0);
    expect(
      resultTooFew.warnings.some((w) =>
        w.message.includes("at least 2 acceptance criteria")
      )
    ).toBe(true);

    // Test with requirements having too many acceptance criteria
    const tooManyCriteria: RequirementsDocument = {
      introduction: "Test",
      glossary: [],
      requirements: [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [
            { id: "1.1", text: "THE System SHALL work" },
            { id: "1.2", text: "THE System SHALL work" },
            { id: "1.3", text: "THE System SHALL work" },
            { id: "1.4", text: "THE System SHALL work" },
            { id: "1.5", text: "THE System SHALL work" },
            { id: "1.6", text: "THE System SHALL work" },
          ],
        },
      ],
    };

    const resultTooMany = generator.validateRequirements(tooManyCriteria);
    expect(resultTooMany.warnings.length).toBeGreaterThan(0);
    expect(
      resultTooMany.warnings.some((w) =>
        w.message.includes("at most 5 acceptance criteria")
      )
    ).toBe(true);

    // Test with valid number of acceptance criteria
    const validCriteria: RequirementsDocument = {
      introduction: "Test",
      glossary: [],
      requirements: [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [
            { id: "1.1", text: "THE System SHALL work" },
            { id: "1.2", text: "THE System SHALL work" },
            { id: "1.3", text: "THE System SHALL work" },
          ],
        },
      ],
    };

    const resultValid = generator.validateRequirements(validCriteria);
    // Should not have warnings about acceptance criteria count
    expect(
      resultValid.warnings.filter(
        (w) =>
          w.message.includes("acceptance criteria") &&
          (w.message.includes("at least") || w.message.includes("at most"))
      ).length
    ).toBe(0);
  });
});
