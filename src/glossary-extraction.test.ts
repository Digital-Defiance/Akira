/**
 * Property-based tests for glossary term extraction
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RequirementsGenerator,
  Requirement,
  AcceptanceCriterion,
} from "./requirements-generator";

describe("Glossary Extraction Property Tests", () => {
  /**
   * **Feature: copilot-spec-extension, Property 3: Glossary term extraction**
   * **Validates: Requirements 2.3**
   *
   * For any requirements document containing technical terms, all undefined terms
   * should appear in the Glossary section with definitions.
   */
  it("Property 3: Glossary term extraction", () => {
    const generator = new RequirementsGenerator();

    // Generator for technical terms (capitalized multi-word terms)
    const technicalTerm = fc
      .tuple(
        fc.constantFrom(
          "Authentication",
          "Database",
          "Message",
          "Request",
          "Response",
          "Connection",
          "Transaction",
          "Session",
          "Token",
          "Validation"
        ),
        fc.option(
          fc.constantFrom(
            "Service",
            "Manager",
            "Handler",
            "Provider",
            "Controller",
            "Repository"
          ),
          { nil: undefined }
        )
      )
      .map(([first, second]) => (second ? `${first} ${second}` : first));

    // Generator for acceptance criteria containing technical terms
    const acceptanceCriterionWithTerm = fc
      .tuple(technicalTerm, fc.lorem({ maxCount: 5 }))
      .map(
        ([term, text]) =>
          `WHEN ${text}, THE ${term} SHALL process the request` as const
      );

    // Generator for requirements with technical terms
    const requirementWithTerms = fc
      .tuple(
        fc.integer({ min: 1, max: 100 }),
        fc.array(acceptanceCriterionWithTerm, { minLength: 2, maxLength: 5 })
      )
      .map(([id, criteria]) => {
        const requirement: Requirement = {
          id: id.toString(),
          userStory: {
            role: "user",
            feature: "test feature",
            benefit: "test benefit",
          },
          acceptanceCriteria: criteria.map((text, idx) => ({
            id: `${id}.${idx + 1}`,
            text,
          })),
        };
        return requirement;
      });

    fc.assert(
      fc.property(
        fc.array(requirementWithTerms, { minLength: 1, maxLength: 10 }),
        (requirements) => {
          // Extract glossary terms
          const glossary = generator.extractGlossaryTerms(requirements);

          // Collect all technical terms from requirements
          const termsInRequirements = new Set<string>();
          for (const req of requirements) {
            for (const criterion of req.acceptanceCriteria) {
              // Extract capitalized terms
              const matches = criterion.text.match(
                /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
              );
              if (matches) {
                for (const match of matches) {
                  // Skip EARS keywords
                  if (
                    ![
                      "When",
                      "The",
                      "Then",
                      "Shall",
                      "While",
                      "Where",
                    ].includes(match)
                  ) {
                    termsInRequirements.add(match);
                  }
                }
              }
            }
          }

          // All technical terms should appear in glossary
          const glossaryTerms = new Set(glossary.map((entry) => entry.term));

          for (const term of termsInRequirements) {
            expect(
              glossaryTerms.has(term),
              `Term "${term}" should be in glossary`
            ).toBe(true);
          }

          // All glossary entries should have definitions
          for (const entry of glossary) {
            expect(entry.term).toBeDefined();
            expect(entry.term.length).toBeGreaterThan(0);
            expect(entry.definition).toBeDefined();
            expect(entry.definition.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Property 3: Glossary excludes common EARS keywords", () => {
    const generator = new RequirementsGenerator();

    // Create requirements with only EARS keywords
    const requirements: Requirement[] = [
      {
        id: "1",
        userStory: {
          role: "user",
          feature: "test",
          benefit: "test",
        },
        acceptanceCriteria: [
          {
            id: "1.1",
            text: "WHEN The User clicks, THE System SHALL respond",
          },
          {
            id: "1.2",
            text: "WHILE The System runs, THE Data SHALL persist",
          },
        ],
      },
    ];

    const glossary = generator.extractGlossaryTerms(requirements);
    const glossaryTerms = glossary.map((entry) => entry.term);

    // Common EARS keywords should not appear in glossary
    const earsKeywords = [
      "The",
      "When",
      "While",
      "Where",
      "Then",
      "Shall",
      "System",
      "User",
      "Data",
    ];

    for (const keyword of earsKeywords) {
      expect(glossaryTerms).not.toContain(keyword);
    }
  });

  it("Property 3: Glossary handles empty requirements", () => {
    const generator = new RequirementsGenerator();
    const glossary = generator.extractGlossaryTerms([]);

    expect(glossary).toBeDefined();
    expect(Array.isArray(glossary)).toBe(true);
    expect(glossary.length).toBe(0);
  });
});
