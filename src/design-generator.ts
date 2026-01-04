/**
 * Design Generator
 * Generates design documents from requirements
 */

import {
  RequirementsDocument,
  AcceptanceCriterion,
} from "./requirements-generator";

export interface ComponentDescription {
  name: string;
  description: string;
  interfaces?: string[];
}

export interface DataModel {
  name: string;
  description: string;
  fields?: Record<string, string>;
}

export interface PreworkAnalysis {
  criterionId: string;
  criterionText: string;
  thoughts: string;
  testable: "yes-property" | "yes-example" | "edge-case" | "no";
}

export interface CorrectnessProperty {
  id: string;
  description: string;
  validatesRequirements: string[];
}

export interface TestingStrategy {
  unitTesting: string;
  propertyBasedTesting: string;
  pbtLibrary: string;
  iterations: number;
  coverage: string;
}

export interface DesignDocument {
  overview: string;
  architecture: string;
  components: ComponentDescription[];
  dataModels: DataModel[];
  correctnessProperties: CorrectnessProperty[];
  errorHandling: string;
  testingStrategy: TestingStrategy;
}

export class DesignGenerator {
  private iterations: number;

  /**
   * Create a new DesignGenerator
   * @param iterations Number of iterations for property-based tests (default: 100)
   *                   Use ConfigManager.getPropertyTestIterations() to get from settings
   */
  constructor(iterations: number = 100) {
    this.iterations = iterations;
  }

  /**
   * Generate design document from requirements
   */
  generateDesign(requirements: RequirementsDocument): DesignDocument {
    return {
      overview: this.generateOverview(requirements),
      architecture: this.generateArchitecture(requirements),
      components: this.generateComponents(requirements),
      dataModels: this.generateDataModels(requirements),
      correctnessProperties: [],
      errorHandling: this.generateErrorHandling(requirements),
      testingStrategy: this.generateTestingStrategy(requirements),
    };
  }

  /**
   * Analyze acceptance criteria for testability (prework)
   */
  analyzeTestability(criteria: AcceptanceCriterion[]): PreworkAnalysis[] {
    const analyses: PreworkAnalysis[] = [];

    for (const criterion of criteria) {
      const analysis = this.analyzeSingleCriterion(criterion);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Analyze a single acceptance criterion for testability
   */
  private analyzeSingleCriterion(
    criterion: AcceptanceCriterion
  ): PreworkAnalysis {
    const text = criterion.text.toLowerCase();

    // Check for UI/UX related criteria (often not testable)
    if (this.isUIRelated(text)) {
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        thoughts:
          "This criterion relates to UI/UX presentation which is not easily testable through automated properties.",
        testable: "no",
      };
    }

    // Check for parsing/serialization (should use round-trip properties)
    if (this.isParsingRelated(text)) {
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        thoughts:
          "This criterion involves parsing or serialization. Best tested with a round-trip property.",
        testable: "yes-property",
      };
    }

    // Check for edge cases
    if (this.isEdgeCase(text)) {
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        thoughts:
          "This criterion describes an edge case or boundary condition that should be covered by property test generators.",
        testable: "edge-case",
      };
    }

    // Check for specific examples
    if (this.isSpecificExample(text)) {
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        thoughts:
          "This criterion describes a specific example or scenario rather than a general rule.",
        testable: "yes-example",
      };
    }

    // Check for vague or non-functional requirements
    if (this.isVague(text)) {
      return {
        criterionId: criterion.id,
        criterionText: criterion.text,
        thoughts:
          "This criterion is vague or describes non-functional aspects that are difficult to test automatically.",
        testable: "no",
      };
    }

    // Default: assume it's a testable property
    return {
      criterionId: criterion.id,
      criterionText: criterion.text,
      thoughts:
        "This criterion describes a general rule that should hold across all valid inputs.",
      testable: "yes-property",
    };
  }

  /**
   * Check if criterion is UI/UX related
   */
  private isUIRelated(text: string): boolean {
    const uiKeywords = [
      "display",
      "show",
      "visual",
      "aesthetic",
      "feedback",
      "interface",
      "layout",
      "style",
      "color",
      "font",
      "readable",
      "clear interface",
    ];
    return uiKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Check if criterion is parsing/serialization related
   */
  private isParsingRelated(text: string): boolean {
    const parsingKeywords = [
      "parse",
      "parsing",
      "serialize",
      "serialization",
      "encode",
      "encoding",
      "decode",
      "decoding",
      "format",
      "json",
      "xml",
    ];
    return parsingKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Check if criterion describes an edge case
   */
  private isEdgeCase(text: string): boolean {
    const edgeCaseKeywords = [
      "empty",
      "null",
      "zero",
      "maximum",
      "minimum",
      "boundary",
      "limit",
      "edge",
      "special character",
      "large",
      "very",
    ];
    return edgeCaseKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Check if criterion is a specific example
   */
  private isSpecificExample(text: string): boolean {
    // Look for specific values or examples
    const hasSpecificValue = /\d+/.test(text) || text.includes("e.g.");
    const isSpecificScenario =
      text.includes("when a user") ||
      text.includes("when the") ||
      text.includes("if a specific");
    return hasSpecificValue || isSpecificScenario;
  }

  /**
   * Check if criterion is vague
   */
  private isVague(text: string): boolean {
    const vagueKeywords = [
      "appropriate",
      "suitable",
      "reasonable",
      "adequate",
      "properly",
      "correctly",
      "well",
      "good",
      "maintain",
      "quality",
    ];
    return vagueKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Generate correctness properties from prework analysis
   */
  generateProperties(analyses: PreworkAnalysis[]): CorrectnessProperty[] {
    const properties: CorrectnessProperty[] = [];
    let propertyCounter = 1;

    // Filter to only testable analyses (property or example)
    const testableAnalyses = analyses.filter(
      (a) => a.testable === "yes-property" || a.testable === "yes-example"
    );

    for (const analysis of testableAnalyses) {
      const property = this.generatePropertyFromAnalysis(
        analysis,
        propertyCounter
      );
      properties.push(property);
      propertyCounter++;
    }

    // Perform property reflection to eliminate redundancy
    return this.reflectProperties(properties);
  }

  /**
   * Generate a single property from prework analysis
   */
  private generatePropertyFromAnalysis(
    analysis: PreworkAnalysis,
    propertyNumber: number
  ): CorrectnessProperty {
    const description = this.generatePropertyDescription(analysis);

    return {
      id: `Property ${propertyNumber}`,
      description,
      validatesRequirements: [analysis.criterionId],
    };
  }

  /**
   * Generate property description with "For any" quantification
   */
  private generatePropertyDescription(analysis: PreworkAnalysis): string {
    const text = analysis.criterionText.toLowerCase();

    // Extract key elements from the criterion
    if (text.includes("pars") || text.includes("serializ")) {
      return `_For any_ valid input, serializing then deserializing should produce an equivalent value`;
    }

    if (text.includes("encod") || text.includes("decod")) {
      return `_For any_ valid input, encoding then decoding should produce an equivalent value`;
    }

    if (text.includes("add") || text.includes("create")) {
      return `_For any_ valid input, adding it to the system should result in it being retrievable`;
    }

    if (text.includes("delete") || text.includes("remove")) {
      return `_For any_ item in the system, removing it should result in it no longer being present`;
    }

    if (text.includes("update") || text.includes("modify")) {
      return `_For any_ item in the system, updating it should preserve its identity while changing its properties`;
    }

    if (text.includes("validate") || text.includes("check")) {
      return `_For any_ input, validation should correctly identify valid and invalid cases`;
    }

    // Generic property
    return `_For any_ valid input, the system should behave according to the specification`;
  }

  /**
   * Perform property reflection to eliminate redundancy
   */
  reflectProperties(properties: CorrectnessProperty[]): CorrectnessProperty[] {
    const uniqueProperties: CorrectnessProperty[] = [];
    const seenDescriptions = new Set<string>();

    for (const property of properties) {
      // Normalize description for comparison
      const normalizedDesc = property.description
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      if (!seenDescriptions.has(normalizedDesc)) {
        seenDescriptions.add(normalizedDesc);
        uniqueProperties.push(property);
      } else {
        // Find the existing property and merge requirements
        const existing = uniqueProperties.find(
          (p) =>
            p.description.toLowerCase().replace(/\s+/g, " ").trim() ===
            normalizedDesc
        );
        if (existing) {
          // Merge requirement references
          for (const req of property.validatesRequirements) {
            if (!existing.validatesRequirements.includes(req)) {
              existing.validatesRequirements.push(req);
            }
          }
        }
      }
    }

    return uniqueProperties;
  }

  /**
   * Validate that design document has all required sections
   */
  validateCompleteness(design: DesignDocument): {
    complete: boolean;
    missingSections: string[];
  } {
    const missingSections: string[] = [];

    if (!design.overview || design.overview.trim().length === 0) {
      missingSections.push("Overview");
    }
    if (!design.architecture || design.architecture.trim().length === 0) {
      missingSections.push("Architecture");
    }
    if (!design.components || design.components.length === 0) {
      missingSections.push("Components and Interfaces");
    }
    if (!design.dataModels || design.dataModels.length === 0) {
      missingSections.push("Data Models");
    }
    // Correctness Properties section exists but may be empty initially
    // Properties are added later through prework analysis and generation
    if (!design.correctnessProperties) {
      missingSections.push("Correctness Properties");
    }
    if (!design.errorHandling || design.errorHandling.trim().length === 0) {
      missingSections.push("Error Handling");
    }
    if (!design.testingStrategy || !design.testingStrategy.pbtLibrary) {
      missingSections.push("Testing Strategy");
    }

    return {
      complete: missingSections.length === 0,
      missingSections,
    };
  }

  /**
   * Generate overview section
   */
  private generateOverview(requirements: RequirementsDocument): string {
    return `${requirements.introduction}\n\nThis design document outlines the technical approach for implementing the system.`;
  }

  /**
   * Generate architecture section
   */
  private generateArchitecture(_requirements: RequirementsDocument): string {
    return `The system follows a modular architecture with clear separation of concerns.\n\nKey architectural principles:\n- Component-based design\n- Clear interfaces between modules\n- Testable components`;
  }

  /**
   * Generate components section
   */
  private generateComponents(
    requirements: RequirementsDocument
  ): ComponentDescription[] {
    const components: ComponentDescription[] = [];

    // Extract component names from requirements
    const componentNames = new Set<string>();
    for (const requirement of requirements.requirements) {
      // Simple heuristic: look for nouns in user stories
      const words = requirement.userStory.feature.split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && /^[a-z]/.test(word)) {
          componentNames.add(
            word.charAt(0).toUpperCase() + word.slice(1) + "Component"
          );
        }
      }
    }

    for (const name of componentNames) {
      components.push({
        name,
        description: `Handles ${name
          .replace("Component", "")
          .toLowerCase()} operations`,
        interfaces: [],
      });
    }

    // Ensure at least one component exists
    if (components.length === 0) {
      components.push({
        name: "CoreComponent",
        description: "Core system component",
        interfaces: [],
      });
    }

    return components;
  }

  /**
   * Generate data models section
   */
  private generateDataModels(requirements: RequirementsDocument): DataModel[] {
    const models: DataModel[] = [];

    // Extract model names from glossary
    for (const entry of requirements.glossary) {
      models.push({
        name: entry.term,
        description: entry.definition,
        fields: {},
      });
    }

    // Ensure at least one data model exists
    if (models.length === 0) {
      models.push({
        name: "SystemData",
        description: "Core system data model",
        fields: {},
      });
    }

    return models;
  }

  /**
   * Generate error handling section
   */
  private generateErrorHandling(_requirements: RequirementsDocument): string {
    return `Error handling strategy:\n\n1. Input validation errors\n2. System errors\n3. User-facing error messages\n\nAll errors should be logged and provide clear recovery guidance.`;
  }

  /**
   * Generate testing strategy section
   */
  private generateTestingStrategy(
    _requirements: RequirementsDocument
  ): TestingStrategy {
    // Detect language from requirements (placeholder logic)
    const pbtLibrary = this.selectPBTLibrary("typescript");

    return {
      unitTesting:
        "Unit tests will verify specific behaviors and edge cases using Vitest.",
      propertyBasedTesting: `Property-based tests will verify universal properties using ${pbtLibrary}.`,
      pbtLibrary,
      iterations: this.iterations,
      coverage:
        "Minimum 80% code coverage for unit tests, all correctness properties must have property tests.",
    };
  }

  /**
   * Select appropriate PBT library based on language
   */
  private selectPBTLibrary(language: string): string {
    const libraries: Record<string, string> = {
      typescript: "fast-check",
      javascript: "fast-check",
      python: "hypothesis",
      java: "jqwik",
      csharp: "FsCheck",
      go: "gopter",
      rust: "proptest",
    };

    return libraries[language.toLowerCase()] || "fast-check";
  }

  /**
   * Format design document as markdown
   */
  formatAsMarkdown(design: DesignDocument): string {
    let markdown = "# Design Document\n\n";

    // Overview
    markdown += "## Overview\n\n";
    markdown += design.overview + "\n\n";

    // Architecture
    markdown += "## Architecture\n\n";
    markdown += design.architecture + "\n\n";

    // Components
    markdown += "## Components and Interfaces\n\n";
    for (const component of design.components) {
      markdown += `### ${component.name}\n\n`;
      markdown += component.description + "\n\n";
      if (component.interfaces && component.interfaces.length > 0) {
        markdown += "Interfaces:\n";
        for (const iface of component.interfaces) {
          markdown += `- ${iface}\n`;
        }
        markdown += "\n";
      }
    }

    // Data Models
    markdown += "## Data Models\n\n";
    for (const model of design.dataModels) {
      markdown += `### ${model.name}\n\n`;
      markdown += model.description + "\n\n";
      if (model.fields && Object.keys(model.fields).length > 0) {
        markdown += "Fields:\n";
        for (const [field, type] of Object.entries(model.fields)) {
          markdown += `- ${field}: ${type}\n`;
        }
        markdown += "\n";
      }
    }

    // Correctness Properties
    markdown += "## Correctness Properties\n\n";
    markdown +=
      "_A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._\n\n";
    for (const property of design.correctnessProperties) {
      markdown += `**${property.id}**\n`;
      markdown += `${property.description}\n`;
      markdown += `**Validates: Requirements ${property.validatesRequirements.join(
        ", "
      )}**\n\n`;
    }

    // Error Handling
    markdown += "## Error Handling\n\n";
    markdown += design.errorHandling + "\n\n";

    // Testing Strategy
    markdown += "## Testing Strategy\n\n";
    markdown += `### Unit Testing\n\n${design.testingStrategy.unitTesting}\n\n`;
    markdown += `### Property-Based Testing\n\n${design.testingStrategy.propertyBasedTesting}\n\n`;
    markdown += `- **Library**: ${design.testingStrategy.pbtLibrary}\n`;
    markdown += `- **Iterations**: Minimum ${design.testingStrategy.iterations} per test\n`;
    markdown += `- **Coverage**: ${design.testingStrategy.coverage}\n\n`;

    return markdown;
  }
}
