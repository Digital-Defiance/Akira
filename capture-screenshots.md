# Screenshot Capture Guide

This document guides the automated screenshot capture process for Akira documentation.

## Prerequisites
- Akira extension installed and active
- At least one spec created (preferably the autonomous-mode spec)
- MCP Screenshot tool available

## Automated Capture Process

I'll walk through your extension and capture screenshots at key moments. Each screenshot will be saved to the `images/` folder.

### Screenshots to Capture

1. **Sidebar - Specs Tree View** (`01-sidebar-specs-tree.png`)
   - Shows the Akira sidebar with spec hierarchy
   - Displays phase indicators and progress

2. **Chat Participant** (`02-chat-participant.png`)
   - Shows @spec participant in Copilot Chat
   - Demonstrates available commands

3. **Spec Creation** (`03-spec-creation.png`)
   - Shows `@spec create` command in action
   - Captures the requirements generation process

4. **Requirements Document** (`04-requirements-document.png`)
   - Shows a requirements.md file with EARS patterns
   - Highlights user story structure

5. **Design Document** (`05-design-document.png`)
   - Shows a design.md file with technical design
   - Highlights correctness properties

6. **Tasks with CodeLens** (`06-tasks-codelens.png`)
   - Shows tasks.md with executable CodeLens
   - Demonstrates task hierarchy

7. **Status Bar** (`07-status-bar.png`)
   - Shows status bar with current spec info
   - Displays phase and progress

8. **Spec List** (`08-spec-list.png`)
   - Shows `@spec list` command output
   - Displays all specs with status

9. **EARS Validation** (`09-ears-validation.png`)
   - Shows `@spec validate` command output
   - Demonstrates requirements validation

10. **Correctness Properties** (`10-correctness-properties.png`)
    - Shows correctness properties section in design
    - Highlights property-based testing integration

## Manual Process

If automated capture isn't working, follow these steps manually:

1. Open VS Code with Akira extension
2. Navigate to each feature
3. Capture screenshot using your MCP tool
4. Save to `images/` folder with the numbered filename
5. Update README.md with the screenshots

## README Integration

After capturing screenshots, they'll be integrated into the README in the Features section.
