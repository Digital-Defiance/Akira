# Akira Welcome Tab

The welcome tab is a new feature that provides users with an interactive introduction to the Akira extension when they first activate it.

## Features

- **Auto-open on First Activation**: The welcome tab automatically opens the first time the extension is activated
- **Interactive Welcome Screen**: Beautiful, responsive UI that explains Akira's features and workflow
- **Quick Start Guide**: Step-by-step instructions to get started with the extension
- **Key Concepts**: Explanation of EARS patterns, INCOSE quality rules, and Model Context Protocol
- **Direct Command Access**: Quick buttons to execute common commands like "Create New Spec" and "Refresh Specs"
- **External Links**: Easy access to documentation, GitHub repository, and issue tracking

## User Access

Users can open the welcome tab at any time using:

1. **Command Palette**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac) → search for "Show Welcome Tab"
2. **Command ID**: `akira.welcome`

## Implementation Details

### Files Modified

1. **src/welcome-panel.ts** (NEW)
   - Main webview panel manager for the welcome tab
   - Handles panel creation, message passing, and command execution
   - Contains all HTML and CSS for the welcome screen

2. **src/extension.ts**
   - Imported `WelcomePanel` class
   - Registered `akira.welcome` command
   - Added logic to show welcome tab on first activation using global state tracking

3. **package.json**
   - Added `akira.welcome` command to the contributions section

### Architecture

The welcome panel uses VS Code's Webview API to render a rich HTML interface with:

- CSS custom properties for theme integration (light/dark mode)
- VS Code API messaging for command execution
- Responsive design that works on various screen sizes
- No external dependencies (pure HTML/CSS/JavaScript)

### Global State Management

The extension tracks whether the user has seen the welcome tab using `context.globalState`:

- Key: `akira.hasSeenWelcome`
- The welcome tab only shows automatically on the very first activation
- Users can still access it manually via the command palette at any time

## Customization

To modify the welcome tab content, edit the `_getHtmlForWebview()` method in `src/welcome-panel.ts`. The method returns a complete HTML document with:

- **Header Section**: Title and description
- **Features Section**: Grid of feature cards
- **Workflow Section**: Visual workflow diagram
- **Quick Start Section**: Ordered list of getting started steps
- **Commands Section**: Buttons for quick actions
- **Key Concepts Section**: Educational cards
- **Footer Section**: Links and version info

## Future Enhancements

Possible improvements to the welcome tab:

- Show tips and tricks on a schedule
- Add interactive tutorials
- Display recent specs in the welcome panel
- Add embedded videos or GIFs showing the workflow
- Track user interactions and suggest features based on usage
