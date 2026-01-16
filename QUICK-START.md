# Akira Extension - Quick Start Guide

## For Developers

### Setup

```bash
# Clone repository
git clone https://github.com/Digital-Defiance/akira.git
cd akira

# Install dependencies
yarn install

# Build extension
yarn build
```

### Development

```bash
# Watch mode (auto-rebuild on changes)
yarn watch

# Run unit tests
yarn test

# Run unit tests in watch mode
yarn test:watch

# Type check
yarn compile

# Lint code
yarn lint
```

### Testing

```bash
# Unit tests (fast - 1-2 seconds)
yarn test

# E2E tests (slow - 10-30 seconds)
yarn build && yarn test:e2e

# Or use VS Code debugger:
# Press F5 → Select "Extension E2E Tests"
```

### Running the Extension

1. Press **F5** in VS Code
2. Select **"Run Extension"**
3. A new VS Code window opens with the extension loaded
4. Test your changes

### Project Structure

```
akira/
├── src/
│   ├── extension.ts              # Main entry point
│   ├── mcp-client.ts             # MCP client (uses BaseMCPClient)
│   ├── mcp-server.ts             # MCP server implementation
│   ├── status-bar-manager.ts    # Status bar (uses shared status bar)
│   ├── chat-participant.ts      # @spec chat participant
│   ├── spec-tree-provider.ts    # Tree view provider
│   ├── requirements-generator.ts # EARS requirements
│   ├── design-generator.ts      # Design document generation
│   ├── task-generator.ts        # Task breakdown
│   └── test/                    # E2E tests
├── dist/                        # Build output
├── package.json                 # Extension manifest
└── README.md                    # Documentation
```

## For Users

### Installation

**From VS Code Marketplace** (when published):

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Akira"
4. Click **Install**

**From VSIX file**:

```bash
code --install-extension akira-0.1.0.vsix
```

### Usage

#### 1. Create a Spec

**Via Command Palette**:

1. Press Ctrl+Shift+P / Cmd+Shift+P
2. Type "Akira: Create New Spec"
3. Enter feature name
4. Enter feature description

**Via Chat**:

```
@spec create user-authentication
```

#### 2. View Specs

- Open the **Specs** view in the Explorer sidebar
- Click on a spec to open it
- See current phase and progress

#### 3. Work with Specs

**Via Chat**:

```
@spec list                           # List all specs
@spec status for my-feature          # Get spec status
@spec validate for my-feature        # Validate requirements
@spec execute task 1.2               # Mark task as in-progress
```

#### 4. Spec Workflow

1. **Requirements Phase**
   - Create spec with feature idea
   - Review generated EARS requirements
   - Validate against INCOSE rules
   - Approve to move to design

2. **Design Phase**
   - Generate design document
   - Review architecture decisions
   - Approve to move to tasks

3. **Tasks Phase**
   - Generate task breakdown
   - Execute tasks one by one
   - Track progress

4. **Execution Phase**
   - Implement tasks
   - Update task status
   - Complete spec

### Configuration

Open Settings (Ctrl+, / Cmd+,) and search for "Akira":

- **Spec Directory**: Where specs are stored (default: `.akira/specs`)
- **Strict Mode**: Require all optional tasks (default: `false`)
- **Property Test Iterations**: Number of PBT iterations (default: `100`)

## Key Features

### 1. EARS Requirements

- Automatically generates requirements using EARS patterns
- Validates against INCOSE rules
- Ensures clear, testable requirements

### 2. Property-Based Testing

- Suggests property-based tests for requirements
- Uses fast-check library
- Catches edge cases

### 3. MCP Integration

- Model Context Protocol server
- Robust client with timeout handling
- Automatic retry logic

### 4. Shared Status Bar

- Unified status bar across MCP extensions
- Shows current spec and phase
- Quick actions menu

### 5. Chat Participant

- `@spec` participant in GitHub Copilot Chat
- Natural language commands
- Contextual help

## Common Tasks

### Create a New Spec

```
@spec create payment-processing
```

### List All Specs

```
@spec list
```

### Check Spec Status

```
@spec status for payment-processing
```

### Validate Requirements

```
@spec validate for payment-processing
```

### Execute a Task

```
@spec execute task 1.2
```

## Troubleshooting

### Extension Not Activating

1. Check Output panel: View → Output → Select "Akira"
2. Look for error messages
3. Try reloading window: Ctrl+Shift+P → "Reload Window"

### MCP Client Connection Issues

1. Check Output panel for connection errors
2. Verify workspace is open
3. Try restarting VS Code

### Status Bar Not Showing

1. Check if other MCP extensions are installed
2. Verify extension is activated
3. Run command: "MCP ACS: Diagnostics"

### Tests Failing

```bash
# Unit tests
yarn test

# E2E tests (requires build first)
yarn build && yarn test:e2e
```

## Documentation

- **README.md** - Overview and features
- **SETUP.md** - Project setup details
- **TESTING.md** - Complete testing guide
- **E2E-TESTING.md** - E2E testing guide
- **TESTING-SUMMARY.md** - Testing quick reference
- **PUBLISHING.md** - How to publish extension
- **INTEGRATION.md** - AI capabilities suite integration
- **QUICK-START.md** - This file

## Resources

- [GitHub Repository](https://github.com/Digital-Defiance/akira)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [EARS Requirements](https://www.incose.org/)
- [Property-Based Testing](https://github.com/dubzzz/fast-check)

## Support

- **Issues**: https://github.com/Digital-Defiance/akira/issues
- **Discussions**: https://github.com/Digital-Defiance/akira/discussions

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please read CONTRIBUTING.md (if available) for guidelines.

---

**Happy spec-driven development!** 🚀
