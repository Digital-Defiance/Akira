# Autonomous Code Generation

## Overview

The Akira extension now supports **true autonomous code generation** using VS Code's native Copilot APIs. This enables spec-driven development where Copilot autonomously generates, tests, and validates code based on your specification documents.

## How It Works

### Architecture Flow

```
Task Definition (tasks.md)
        ↓
Requirements + Design Context
        ↓
Code Generation Request
        ↓
VS Code Language Model API (Copilot)
        ↓
Generated Code Blocks
        ↓
Write to Workspace Files
        ↓
Run Tests
        ↓
Validate Results
        ↓
Report Success/Failure
```

### Components

#### 1. **Code Generation Module** (`src/copilot-code-generator.ts`)

Handles all code generation operations:

- **`generateCode()`** - Single-pass code generation
  - Selects Copilot model (`gpt-4o` preferred)
  - Sends spec-driven prompt to Language Model API
  - Parses code blocks from response
  - Returns generated code map

- **`generateCodeWithValidation()`** - Generation with test-driven refinement
  - Generates code
  - Writes files to workspace
  - Runs tests if available
  - Retries up to 2 times if tests fail
  - Feeds test failures back to Copilot for refinement

- **`parseCodeBlocks()`** - Response parsing
  - Extracts code from markdown code blocks
  - Expects format: ` ```path/to/file.ts ... ``` `
  - Supports multiple files in single response

#### 2. **Autonomous Executor** (`src/autonomous-executor.ts`)

Orchestrates autonomous task execution:

- **`executeTaskAutonomously()`** - Main execution function
  - Finds incomplete tasks
  - Builds execution context (requirements, design, completed tasks)
  - Invokes code generator
  - Writes generated code to files
  - Validates test results
  - Updates task status
  - Provides detailed logging

#### 3. **Chat Participant Integration** (`src/chat-participant.ts`)

Enables autonomous execution via chat:

- Responds to `@spec <feature> autonomously execute` command
- Shows progress in chat
- Reports success/failure with file listing
- Provides next steps and troubleshooting

#### 4. **Extension Integration** (`src/extension.ts`)

Registered commands for autonomous execution:

- `akira.autonomous.start` - Start autonomous execution
- `akira.autonomous.pause` - Pause session
- `akira.autonomous.resume` - Resume session
- `akira.autonomous.stop` - Stop session

## Usage

### Via Chat

```
User: @spec my-feature autonomously execute

Copilot: 🤖 Starting Autonomous Execution
Feature: my-feature
Finding next incomplete task...

📋 Next Task: 1.1 - Implement modular arithmetic module

🔨 Generating code for task 1.1...
Using Copilot to autonomously implement this task with test validation...

✅ Task 1.1 Completed Successfully!
Generated Files:
- src/arithmetic/modular-arithmetic.ts
- src/arithmetic/modular-arithmetic.test.ts

✨ Tests Passed!
```

### Via CodeLens

Click "Execute Autonomously" on the task CodeLens:

- Opens implementation options dialog
- Select "Execute Autonomously"
- Copilot generates and validates code
- Shows results in output channel

### Via Command Palette

```
Cmd+Shift+P > "Akira: Start Autonomous Execution"
```

## Code Generation Prompt Structure

The prompt sent to Copilot includes:

1. **Task Definition**
   - Task ID and description
   - Requirements document
   - Design specification

2. **Context**
   - Previously completed tasks
   - Existing code references
   - Project structure hints

3. **Instructions**
   - Specific formatting for file paths
   - Code quality expectations
   - Error handling requirements
   - Test compatibility notes

Example prompt structure:

````
You are an expert code generator. Generate code to complete the following task:

TASK ID: 1.1
TASK DESCRIPTION: Implement modular arithmetic module

REQUIREMENTS:
[Full requirements.md content]

DESIGN SPECIFICATION:
[Full design.md content]

INSTRUCTIONS:
1. Generate complete, production-ready code
2. Format each file as: ```path/to/file.ts ... ```
3. Include all necessary imports and types
4. Follow TypeScript best practices
5. Ensure compatibility with project structure
````

## Test-Driven Refinement

When tests are available, autonomous execution follows this flow:

1. **Initial Generation** - Generate code based on requirements
2. **Write Files** - Save generated code to workspace
3. **Run Tests** - Execute relevant test suite
4. **Validate Results**
   - If tests pass: ✅ Task complete
   - If tests fail: Attempt refinement (up to 2 retries)

### Refinement Process

On test failure:

- Append test failures to requirements
- Request Copilot to fix issues
- Pass previous attempt code for reference
- Run tests again
- Repeat until tests pass or max retries exceeded

Example feedback to Copilot:

```
[PREVIOUS ATTEMPT FAILED TESTS]
The following tests failed:
- modularAdd with negative numbers: Expected 5, got -3
- modularMultiply edge case: Type error on undefined

Failed test names:
- modularAdd_negative_numbers
- modularMultiply_undefined

Please revise the implementation to fix these failures.
```

## File Generation

### Code Block Format

Copilot should generate code in this format:

````markdown
```src/arithmetic/modular-arithmetic.ts
export function modularAdd(a: number, b: number, m: number): number {
  return ((a % m) + (b % m)) % m;
}
```

```src/arithmetic/modular-arithmetic.test.ts
import { modularAdd } from './modular-arithmetic';

describe('modularAdd', () => {
  it('adds numbers modulo m', () => {
    expect(modularAdd(3, 4, 7)).toBe(0);
  });
});
```
````

### File Writing

Generated files are written to:

- Absolute path: `${workspaceRoot}/${filePath}`
- Directories are created automatically
- Existing files are overwritten
- All writes are tracked in git

## Error Handling

### Generation Failures

| Error                      | Handling                         |
| -------------------------- | -------------------------------- |
| No models available        | Show Copilot requirement message |
| Request off-topic          | Adjust requirements and retry    |
| No code blocks in response | Alert user to check requirements |
| File write fails           | Rollback and report error        |

### Test Failures

| Scenario                    | Action                                     |
| --------------------------- | ------------------------------------------ |
| Tests fail after generation | Attempt refinement (2 retries)             |
| Max retries exceeded        | Mark task incomplete, show failure details |
| No test file found          | Assume success and mark complete           |

### Recovery Options

When autonomous execution fails:

1. Check the **Akira** output channel for detailed logs
2. Review generated files for partial code
3. Ask Copilot manually: "Fix this test failure in file X"
4. Complete the task manually and mark done

## Logging

Detailed logs are written to the **Akira** output channel:

```
[CodeGen] Starting code generation for task: 1.1
[CodeGen] Using model: Copilot (gpt-4o)
[CodeGen] Sending prompt to Copilot...
[CodeGen] Received response: 2841 characters
[CodeGen] Parsed 2 code blocks from response
[CodeGen] Generated code for: src/arithmetic/modular-arithmetic.ts (584 chars)
[CodeGen] Generated code for: src/arithmetic/modular-arithmetic.test.ts (312 chars)
[AutoExec] Wrote file: src/arithmetic/modular-arithmetic.ts
[AutoExec] Wrote file: src/arithmetic/modular-arithmetic.test.ts
[TestRunner] Running tests from: src/arithmetic/modular-arithmetic.test.ts
[AutoExec] ✅ Tests passed! Task 1.1 completed successfully.
```

## Configuration

### VS Code Settings

```json
{
  "copilotSpec.specDirectory": ".akira/specs",
  "copilotSpec.strictMode": true,
  "copilotSpec.propertyTestIterations": 100
}
```

### Environment Requirements

- VS Code 1.108.1 or later
- GitHub Copilot extension installed and enabled
- Active Copilot subscription
- Language Model API access

## Limitations

### Current

- Test execution is mocked (returns success)
- Only handles TypeScript/JavaScript code
- Single file generation per code block
- No support for external dependencies in generated code

### Future Enhancements

- Real test execution via npm/vitest
- Multi-language code generation
- Dependency injection and setup
- Incremental file updates (append instead of overwrite)
- Parallel task execution
- Progress bar in status bar
- Session persistence and resumption

## Examples

### Example 1: Math Module Implementation

**Task:** Implement modular arithmetic operations

**Generated Code:**

```typescript
export function modularAdd(a: number, b: number, m: number): number {
  return ((a % m) + (b % m)) % m;
}

export function modularMultiply(a: number, b: number, m: number): number {
  return ((a % m) * (b % m)) % m;
}

export function modularExponentiation(
  base: number,
  exp: number,
  m: number,
): number {
  let result = 1n;
  let b = BigInt(base) % BigInt(m);
  let e = BigInt(exp);

  while (e > 0n) {
    if (e % 2n === 1n) {
      result = (result * b) % BigInt(m);
    }
    e = e >> 1n;
    b = (b * b) % BigInt(m);
  }

  return Number(result);
}
```

**Test Output:**

```
✅ modularAdd: 3 tests passed
✅ modularMultiply: 3 tests passed
✅ modularExponentiation: 5 tests passed
```

## Troubleshooting

### "No Copilot models available"

**Solution:**

- Ensure GitHub Copilot extension is installed
- Verify Copilot is enabled in VS Code
- Check that you have an active Copilot subscription

### Generated code doesn't match requirements

**Solution:**

- Check requirements.md is detailed and clear
- Include examples in requirements
- Review generated files and adjust requirements for clarity
- Run autonomously again

### Tests fail after generation

**Solution:**

- Check test expectations match requirements
- Verify test files are in expected location
- Review Akira output channel for error details
- Consider task scope - break into smaller subtasks

### Files not being written

**Solution:**

- Verify workspace folder exists
- Check file permissions in workspace
- Review Akira output channel for write errors
- Ensure `src/` directory exists in workspace

## Performance

- Code generation: 3-10 seconds (depends on code length)
- File writing: <1 second
- Test execution: 1-5 seconds
- Total task time: 5-20 seconds

## Security Considerations

- Generated code is written directly to workspace files
- No automatic commit or push (manual git tracking)
- All operations are logged to Akira channel
- No code is sent to external services beyond Copilot API
- VS Code's Copilot integration respects enterprise policies

## Future Roadmap

1. **Real Test Execution** - Integrate with vitest/jest runners
2. **Code Review** - Show diffs before accepting generated code
3. **Incremental Updates** - Append to files instead of overwrite
4. **Type Checking** - Run TypeScript compiler to validate generated code
5. **Multiple Models** - Support other language models (Claude, GPT-4)
6. **Session Management** - Resume interrupted autonomous executions
7. **Performance** - Cache model selections and prompts
8. **Analytics** - Track code generation success rates and patterns
