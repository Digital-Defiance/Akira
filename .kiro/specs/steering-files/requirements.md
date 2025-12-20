# Requirements Document

## Introduction

This document specifies the requirements for Implement project-specific steering files for.

**Feature Idea:** Implement project-specific steering files for agent configuration and behavior control. Create .akira/steering.json with sections for coding standards, architecture constraints, preferred libraries, testing requirements, and project-specific rules. Include steering file parser, configuration validator, and commands to view/edit steering settings. Integrate steering rules into requirements generation, design generation, and task execution to ensure agent follows project conventions. Support inheritance from global to feature-specific steering files.

## Glossary

- **Steering File**: A JSON file named .akira/steering.json that contains project-specific agent configuration and behavioral rules.
- **Agent**: An autonomous software component that generates requirements, designs, and executes tasks guided by steering files.
- **Schema**: A JSON Schema that defines required sections, fields, types, and constraints for the steering file.
- **Inheritance**: A precedence mechanism where global settings cascade into project-level and feature-level steering files with deterministic overrides.
- **Enforcement Level**: A configuration value that determines whether steering rules are advisory, recommended, or mandatory.
- **Validator**: A component that checks steering files for syntactic correctness and conformance to the schema and business rules.

## Requirements

### Requirement REQ-1

**User Story:** As a project developer, I want create a project steering file, so that to specify coding standards, architecture constraints, preferred libraries, testing requirements, and project rules

#### Acceptance Criteria

1. The system shall create a file named .akira/steering.json at the project root when the user issues the create-steering command.
2. WHEN the system creates .akira/steering.json the system shall populate the file with top-level sections: codingStandards, architectureConstraints, preferredLibraries, testingRequirements, projectRules.
3. IF the project root already contains .akira/steering.json THEN the system shall refuse to overwrite the file without explicit user confirmation.
4. WHILE the create-steering command runs the system shall complete file creation within 2 seconds for projects with fewer than 100 files.

### Requirement REQ-2

**User Story:** As a developer, I want parse steering file into runtime configuration, so that to allow agents and tools to read and apply project rules

#### Acceptance Criteria

1. The system shall parse .akira/steering.json into an in-memory configuration object that exposes sections and keys as typed fields.
2. WHEN the system loads a valid steering file the system shall complete parsing within 100ms for files up to 100 KB.
3. IF the steering file contains invalid JSON THEN the system shall emit a parse error that includes file path and JSON error location.
4. WHERE feature-file-watching is enabled the system shall re-parse the steering file within 200ms of detecting a file change.

### Requirement REQ-3

**User Story:** As a team lead, I want validate steering file against schema and business rules, so that to ensure steering files are correct, complete, and enforceable

#### Acceptance Criteria

1. The system shall validate .akira/steering.json against the published JSON Schema and return a list of violations.
2. WHEN validation detects missing required sections the system shall list each missing section and required field in the validation output.
3. IF a field value violates a typed constraint (for example array expected) THEN the system shall produce a typed violation that includes the expected type and actual type.
4. WHILE validation runs the system shall complete validation within 200ms for files up to 100 KB and report total violation count.

### Requirement REQ-4

**User Story:** As a developer, I want view and edit steering settings via commands and editor integration, so that to quickly inspect and modify project steering rules from the IDE or CLI

#### Acceptance Criteria

1. The system shall provide a CLI command view-steering that prints a human-readable summary of each steering section and key.
2. WHEN the user executes edit-steering the system shall open .akira/steering.json in the active editor and position the cursor at the start of the first editable section.
3. IF the user saves edits that fail schema validation THEN the system shall display validation errors and prevent committing the changes when enforcement level is mandatory.
4. WHERE the IDE provides a settings UI the system shall expose a steering editor panel that renders sections with inline validation and save buttons.

### Requirement REQ-5

**User Story:** As a technical architect, I want inherit steering rules from global to project to feature files, so that to allow broad conventions to be defined globally and overridden where needed

#### Acceptance Criteria

1. The system shall load global steering from $HOME/.akira/steering.json and merge it with project and feature steering according to precedence rules.
2. WHEN both global and project steering define the same key the system shall apply the value from the more-specific file according to precedence: feature > project > global.
3. IF a feature-level steering file explicitly sets "inherit": false THEN the system shall ignore higher-precedence files for keys present in the feature file.
4. WHILE merging steering files the system shall produce a deterministic merged configuration and log the origin (global/project/feature) for each resulting key.

### Requirement REQ-6

**User Story:** As a product manager, I want enforce steering rules during requirements generation, so that to ensure generated requirements comply with project conventions

#### Acceptance Criteria

1. The system shall apply merged steering rules to requirements generation and annotate each generated requirement with the steering rule identifiers that influenced it.
2. WHEN requirements generation detects a violation of a mandatory steering rule the system shall halt generation and return a validation failure with actionable messages.
3. IF the enforcement level for requirements is advisory THEN the system shall generate requirements, attach warnings for violations, and continue processing.
4. WHILE generating requirements the system shall log processing time per requirement and shall not exceed 500ms per requirement for projects with fewer than 500 rules.

### Requirement REQ-7

**User Story:** As a developer, I want apply steering rules to design generation and task execution, so that to keep design artifacts and executed tasks aligned with project constraints

#### Acceptance Criteria

1. The system shall validate design generation inputs against steering architectureConstraints and reject designs that violate mandatory constraints.
2. WHEN a task execution plan conflicts with preferredLibraries the system shall record the conflict and tag impacted tasks with the conflicting rule identifiers.
3. IF a task attempt would produce artifacts that breach mandatory testingRequirements THEN the system shall block task execution and return a remediation message.
4. WHILE executing tasks the system shall check steering rules at task start and shall complete the check within 50ms per task.

### Requirement REQ-8

**User Story:** As a configuration manager, I want configure enforcement levels and preview effects, so that to control how strictly agents must follow steering rules and preview consequences

#### Acceptance Criteria

1. The system shall allow setting enforcementLevel per section with allowed values: advisory, recommended, mandatory.
2. WHEN the user requests a preview the system shall simulate applying steering rules and present a delta report that lists changes and violated rules.
3. IF the enforcementLevel is mandatory THEN the system shall prevent actions that violate mandatory rules and include the preventing rule id in the error message.
4. WHERE an enforcement change is saved the system shall record the previous enforcementLevel and the user who changed it in the audit log.

### Requirement REQ-9

**User Story:** As a security officer, I want restrict edit and record changes to steering files, so that to protect project conventions and maintain an audit trail

#### Acceptance Criteria

1. The system shall enforce file-level permissions so that only users with role 'maintainer' shall edit .akira/steering.json.
2. WHEN a non-maintainer attempts to edit the steering file the system shall deny the edit and return an authorization error that names the user and required role.
3. IF the system applies an automated change to steering files (for example migration) THEN the system shall create an audit entry that includes timestamp, user=system, and a diff of the change.
4. WHILE recording audit entries the system shall persist entries to a tamper-evident log within 500ms of the change.

### Requirement REQ-10

**User Story:** As a platform engineer, I want scale parsing, validation, and merging for large monorepos and CI, so that to ensure fast, reliable application of steering rules in large projects and CI pipelines

#### Acceptance Criteria

1. The system shall cache parsed steering configurations per project and invalidate the cache on file change events.
2. WHEN CI runs parallel jobs across 100 feature folders the system shall serve cached merged configurations so that average read latency remains below 20ms.
3. IF the merged configuration size exceeds 1 MB THEN the system shall stream merge results and report a performance warning to CI logs.
4. WHILE performing concurrent merges the system shall avoid race conditions and shall produce identical merged outputs for identical input files across repeated runs.

