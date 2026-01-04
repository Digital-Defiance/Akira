/**
 * Unit tests for requirements generation
 */

import { describe, it, expect } from "vitest";
import {
  RequirementsGenerator,
  Requirement,
  RequirementsDocument,
} from "./requirements-generator";

describe("RequirementsGenerator", () => {
  describe("EARS pattern validation", () => {
    it("should validate ubiquitous pattern", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              { id: "1.1", text: "THE System SHALL process requests" },
              { id: "1.2", text: "THE Extension SHALL validate inputs" },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      // Check that EARS validation passes (no EARS errors)
      const earsErrors = result.errors.filter((e) => e.rule === "EARS");
      expect(earsErrors).toHaveLength(0);
    });

    it("should validate event-driven pattern", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "WHEN user clicks button, THE System SHALL respond",
              },
              {
                id: "1.2",
                text: "WHEN file is saved, THE Extension SHALL update state",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      // Check that EARS validation passes (no EARS errors)
      const earsErrors = result.errors.filter((e) => e.rule === "EARS");
      expect(earsErrors).toHaveLength(0);
    });

    it("should validate state-driven pattern", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "WHILE connected, THE System SHALL maintain state",
              },
              {
                id: "1.2",
                text: "WHILE processing, THE Extension SHALL show progress",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      // Check that EARS validation passes (no EARS errors)
      const earsErrors = result.errors.filter((e) => e.rule === "EARS");
      expect(earsErrors).toHaveLength(0);
    });

    it("should validate unwanted event pattern", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "IF error occurs, THEN THE System SHALL log details",
              },
              {
                id: "1.2",
                text: "IF validation fails, THEN THE Extension SHALL notify user",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      // Check that EARS validation passes (no EARS errors)
      const earsErrors = result.errors.filter((e) => e.rule === "EARS");
      expect(earsErrors).toHaveLength(0);
    });

    it("should validate optional pattern", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "WHERE feature enabled, THE System SHALL display option",
              },
              {
                id: "1.2",
                text: "WHERE debug mode active, THE Extension SHALL log verbose",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      // Check that EARS validation passes (no EARS errors)
      const earsErrors = result.errors.filter((e) => e.rule === "EARS");
      expect(earsErrors).toHaveLength(0);
    });

    it("should reject invalid EARS patterns", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              { id: "1.1", text: "The system should work properly" },
              { id: "1.2", text: "Users can click buttons" },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Check that at least one error is an EARS error
      expect(result.errors.some((e) => e.rule === "EARS")).toBe(true);
    });
  });

  describe("INCOSE rule violations", () => {
    it("should detect vague terms", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "THE System SHALL process requests quickly",
              },
              {
                id: "1.2",
                text: "THE System SHALL provide adequate performance",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.rule === "INCOSE" && e.message.toLowerCase().includes("vague")
        )
      ).toBe(true);
    });

    it("should detect negative statements", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              { id: "1.1", text: "THE System SHALL NOT fail" },
              { id: "1.2", text: "THE System SHALL NOT crash" },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.rule === "INCOSE" && e.message.toLowerCase().includes("negative")
        )
      ).toBe(true);
    });

    it("should detect pronouns", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              { id: "1.1", text: "THE System SHALL process it correctly" },
              { id: "1.2", text: "THE System SHALL handle them properly" },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.rule === "INCOSE" && e.message.toLowerCase().includes("pronoun")
        )
      ).toBe(true);
    });

    it("should detect absolutes", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              { id: "1.1", text: "THE System SHALL always succeed" },
              { id: "1.2", text: "THE System SHALL never fail" },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.rule === "INCOSE" && e.message.toLowerCase().includes("absolute")
        )
      ).toBe(true);
    });

    it("should detect escape clauses", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test",
        glossary: [],
        requirements: [
          {
            id: "1",
            userStory: { role: "user", feature: "test", benefit: "test" },
            acceptanceCriteria: [
              {
                id: "1.1",
                text: "THE System SHALL work where possible",
              },
              {
                id: "1.2",
                text: "THE System SHALL try to process requests",
              },
            ],
          },
        ],
      };

      const result = generator.validateRequirements(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.rule === "INCOSE" &&
            e.message.toLowerCase().includes("escape clause")
        )
      ).toBe(true);
    });
  });

  describe("Glossary extraction", () => {
    it("should extract technical terms from requirements", () => {
      const generator = new RequirementsGenerator();
      const requirements: Requirement[] = [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [
            {
              id: "1.1",
              text: "WHEN the user authenticates, THE Authentication Service SHALL verify the credentials",
            },
            {
              id: "1.2",
              text: "THE Database Manager SHALL persist the session tokens",
            },
          ],
        },
      ];

      const glossary = generator.extractGlossaryTerms(requirements);

      expect(glossary.length).toBeGreaterThan(0);
      const terms = glossary.map((entry) => entry.term);

      // The implementation extracts multi-word capitalized terms
      // Check that we have some technical terms (could be "Authentication Service" or individual words)
      expect(terms.length).toBeGreaterThan(0);

      // Verify all terms are capitalized
      for (const term of terms) {
        expect(term[0]).toMatch(/[A-Z]/);
      }
    });

    it("should not include common EARS keywords in glossary", () => {
      const generator = new RequirementsGenerator();
      const requirements: Requirement[] = [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [
            {
              id: "1.1",
              text: "WHEN The User clicks, THE System SHALL respond",
            },
            {
              id: "1.2",
              text: "WHILE The Data loads, THE System SHALL display progress",
            },
          ],
        },
      ];

      const glossary = generator.extractGlossaryTerms(requirements);
      const terms = glossary.map((entry) => entry.term);

      // Common EARS keywords should not be in glossary
      expect(terms).not.toContain("The");
      expect(terms).not.toContain("When");
      expect(terms).not.toContain("While");
      expect(terms).not.toContain("Then");
      expect(terms).not.toContain("Shall");
      expect(terms).not.toContain("System");
      expect(terms).not.toContain("User");
      expect(terms).not.toContain("Data");
    });

    it("should provide definitions for all glossary terms", () => {
      const generator = new RequirementsGenerator();
      const requirements: Requirement[] = [
        {
          id: "1",
          userStory: { role: "user", feature: "test", benefit: "test" },
          acceptanceCriteria: [
            {
              id: "1.1",
              text: "THE Message Queue SHALL process incoming messages",
            },
          ],
        },
      ];

      const glossary = generator.extractGlossaryTerms(requirements);

      for (const entry of glossary) {
        expect(entry.term).toBeDefined();
        expect(entry.term.length).toBeGreaterThan(0);
        expect(entry.definition).toBeDefined();
        expect(entry.definition.length).toBeGreaterThan(0);
      }
    });

    it("should handle empty requirements", () => {
      const generator = new RequirementsGenerator();
      const glossary = generator.extractGlossaryTerms([]);

      expect(glossary).toBeDefined();
      expect(Array.isArray(glossary)).toBe(true);
      expect(glossary.length).toBe(0);
    });
  });

  describe("Requirements document generation", () => {
    it("should generate requirements from feature idea", () => {
      const generator = new RequirementsGenerator();
      const doc = generator.generateRequirements("user authentication system");

      expect(doc).toBeDefined();
      expect(doc.introduction).toBeDefined();
      expect(doc.introduction.length).toBeGreaterThan(0);
      expect(doc.glossary).toBeDefined();
      expect(Array.isArray(doc.glossary)).toBe(true);
      expect(doc.requirements).toBeDefined();
      expect(Array.isArray(doc.requirements)).toBe(true);
    });

    it("should format requirements as markdown", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
        introduction: "Test introduction",
        glossary: [
          { term: "System", definition: "The software system" },
          { term: "User", definition: "A person using the system" },
        ],
        requirements: [
          {
            id: "1",
            userStory: {
              role: "user",
              feature: "login",
              benefit: "access the system",
            },
            acceptanceCriteria: [
              { id: "1.1", text: "THE System SHALL authenticate users" },
              { id: "1.2", text: "THE System SHALL validate credentials" },
            ],
          },
        ],
      };

      const markdown = generator.formatAsMarkdown(doc);

      expect(markdown).toContain("# Requirements Document");
      expect(markdown).toContain("## Introduction");
      expect(markdown).toContain("Test introduction");
      expect(markdown).toContain("## Glossary");
      expect(markdown).toContain("**System**");
      expect(markdown).toContain("**User**");
      expect(markdown).toContain("## Requirements");
      expect(markdown).toContain("### Requirement 1");
      expect(markdown).toContain("**User Story:**");
      expect(markdown).toContain("As a user");
      expect(markdown).toContain("I want login");
      expect(markdown).toContain("so that access the system");
      expect(markdown).toContain("#### Acceptance Criteria");
      expect(markdown).toContain("THE System SHALL authenticate users");
      expect(markdown).toContain("THE System SHALL validate credentials");
    });
  });

  describe("User story validation", () => {
    it("should warn when requirements have too few acceptance criteria", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
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

      const result = generator.validateRequirements(doc);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w) =>
          w.message.includes("at least 2 acceptance criteria")
        )
      ).toBe(true);
    });

    it("should warn when requirements have too many acceptance criteria", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
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

      const result = generator.validateRequirements(doc);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w) =>
          w.message.includes("at most 5 acceptance criteria")
        )
      ).toBe(true);
    });

    it("should not warn for valid acceptance criteria count", () => {
      const generator = new RequirementsGenerator();
      const doc: RequirementsDocument = {
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

      const result = generator.validateRequirements(doc);
      const criteriaWarnings = result.warnings.filter(
        (w) =>
          w.message.includes("acceptance criteria") &&
          (w.message.includes("at least") || w.message.includes("at most"))
      );
      expect(criteriaWarnings.length).toBe(0);
    });
  });
});
