/**
 * Requirements Generator
 * Generates requirements documents from feature ideas
 */

import { validateEARSPattern } from "./ears-validator";
import { validateINCOSE } from "./incose-validator";
import { ValidationResult, ValidationError, ValidationWarning } from "./types";

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface UserStory {
  role: string;
  feature: string;
  benefit: string;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
}

export interface Requirement {
  id: string;
  userStory: UserStory;
  acceptanceCriteria: AcceptanceCriterion[];
}

export interface RequirementsDocument {
  introduction: string;
  glossary: GlossaryEntry[];
  requirements: Requirement[];
}

export class RequirementsGenerator {
  /**
   * Generate initial requirements from a feature idea
   * Note: This is a basic implementation. LLM-powered generation happens in the extension layer.
   */
  generateRequirements(featureIdea: string, generatedContent?: string): RequirementsDocument {
    const featureName = this.extractFeatureName(featureIdea);

    // If LLM-generated content is provided, use it
    if (generatedContent) {
      return this.parseRequirementsFromLLM(generatedContent, featureName, featureIdea);
    }

    // Otherwise return placeholder with full feature idea
    return {
      introduction: `This document specifies the requirements for ${featureName}.\n\n**Feature Idea:** ${featureIdea}\n\n*Requirements will be generated using AI.*`,
      glossary: [],
      requirements: [],
    };
  }

  /**
   * Validate requirements document against EARS and INCOSE rules
   */
  validateRequirements(doc: RequirementsDocument): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const requirement of doc.requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        // Validate EARS pattern
        const earsResult = validateEARSPattern(criterion.text);
        if (!earsResult.isValid) {
          errors.push({
            requirementId: criterion.id,
            rule: "EARS",
            message: earsResult.message || "Invalid EARS pattern",
            suggestion: "Use one of the six EARS patterns",
          });
        }

        // Validate INCOSE rules
        const incoseResult = validateINCOSE(criterion.text);
        if (!incoseResult.isValid) {
          for (const violation of incoseResult.violations) {
            errors.push({
              requirementId: criterion.id,
              rule: "INCOSE",
              message: `${violation.rule}: ${violation.message}`,
              suggestion: violation.suggestion,
            });
          }
        }
      }

      // Check user story structure
      if (requirement.acceptanceCriteria.length < 2) {
        warnings.push({
          requirementId: requirement.id,
          message: "Requirement should have at least 2 acceptance criteria",
        });
      }

      if (requirement.acceptanceCriteria.length > 5) {
        warnings.push({
          requirementId: requirement.id,
          message: "Requirement should have at most 5 acceptance criteria",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract glossary terms from requirements
   */
  extractGlossaryTerms(requirements: Requirement[]): GlossaryEntry[] {
    const terms = new Set<string>();
    const glossary: GlossaryEntry[] = [];

    // Extract capitalized terms and technical terms
    for (const requirement of requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        const matches = criterion.text.match(
          /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
        );
        if (matches) {
          for (const match of matches) {
            // Skip common words
            if (!this.isCommonWord(match)) {
              terms.add(match);
            }
          }
        }
      }
    }

    // Create glossary entries
    for (const term of terms) {
      glossary.push({
        term,
        definition: `[Definition for ${term}]`,
      });
    }

    return glossary;
  }

  /**
   * Extract feature name from feature idea
   */
  private extractFeatureName(featureIdea: string): string {
    // Simple extraction - take first few words
    const words = featureIdea.trim().split(/\s+/).slice(0, 5);
    return words.join(" ");
  }

  /**
   * Parse LLM response into structured requirements document
   */
  private parseRequirementsFromLLM(
    llmResponse: string,
    featureName: string,
    featureIdea: string
  ): RequirementsDocument {
    try {
      // Clean up response - remove markdown code blocks if present
      let cleaned = llmResponse.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.substring(7);
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.substring(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      return {
        introduction: `This document specifies the requirements for ${featureName}.\n\n**Feature Idea:** ${featureIdea}`,
        glossary: parsed.glossary || [],
        requirements: parsed.requirements || [],
      };
    } catch (error) {
      console.error("Failed to parse LLM response:", error);
      console.error("LLM Response:", llmResponse);
      
      // Return document with introduction but note parsing failed
      return {
        introduction: `This document specifies the requirements for ${featureName}.\n\n**Feature Idea:** ${featureIdea}\n\n*Note: LLM generated requirements but parsing failed. Raw response:\n${llmResponse.substring(0, 500)}...*`,
        glossary: [],
        requirements: [],
      };
    }
  }

  /**
   * Check if a word is a common word that shouldn't be in glossary
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      "The",
      "When",
      "While",
      "Where",
      "Then",
      "Shall",
      "Should",
      "Must",
      "Will",
      "Can",
      "May",
      "System",
      "User",
      "Data",
      "File",
      "Error",
    ]);
    return commonWords.has(word);
  }

  /**
   * Format requirements document as markdown
   */
  formatAsMarkdown(doc: RequirementsDocument): string {
    let markdown = "# Requirements Document\n\n";

    // Introduction
    markdown += "## Introduction\n\n";
    markdown += doc.introduction + "\n\n";

    // Glossary
    if (doc.glossary.length > 0) {
      markdown += "## Glossary\n\n";
      for (const entry of doc.glossary) {
        markdown += `- **${entry.term}**: ${entry.definition}\n`;
      }
      markdown += "\n";
    }

    // Requirements
    markdown += "## Requirements\n\n";
    for (const requirement of doc.requirements) {
      markdown += `### Requirement ${requirement.id}\n\n`;
      markdown += `**User Story:** As a ${requirement.userStory.role}, I want ${requirement.userStory.feature}, so that ${requirement.userStory.benefit}\n\n`;
      markdown += "#### Acceptance Criteria\n\n";
      for (let i = 0; i < requirement.acceptanceCriteria.length; i++) {
        const criterion = requirement.acceptanceCriteria[i];
        markdown += `${i + 1}. ${criterion.text}\n`;
      }
      markdown += "\n";
    }

    return markdown;
  }
}
