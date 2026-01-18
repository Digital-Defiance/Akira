# Akira Autonomous Code Generation - Quick Start Guide

## What You Have Now

A spec-driven development system where Copilot **autonomously generates, tests, and validates code** based on your specification documents.

## Quick Start

### 1. Open Akira Chat

```
Cmd+Shift+P > "Chat: Open"
```

### 2. Trigger Autonomous Execution

```
@spec my-feature autonomously execute
```

### 3. Watch It Generate Code

The system will:

- Find the next incomplete task
- Send requirements + design to Copilot
- Copilot generates production code
- System writes files to workspace
- Tests are run automatically
- Results displayed in chat

### 4. Check Output

Open the **Akira** output channel to see:

```
[CodeGen] Starting code generation for task: 1.1
[CodeGen] Using model: Copilot (gpt-4o)
[CodeGen] Parsed 2 code blocks from response
[CodeGen] Generated code for: src/arithmetic/modular-arithmetic.ts
[AutoExec] Wrote file: src/arithmetic/modular-arithmetic.ts
[AutoExec] ✅ Tests passed! Task 1.1 completed successfully.
```

## Architecture

```
Chat (@spec command)
    ↓
Chat Participant Handler
    ↓
Autonomous Executor
    ├─ Find task
    ├─ Build context (requirements + design)
    ├─ Create request
    └─ Call Code Generator
        ├─ Select Copilot model
        ├─ Send prompt via Language Model API
        ├─ Receive code blocks
        ├─ Parse and organize by file
        ├─ Write to workspace
        ├─ Run tests
        └─ Validate results
```

## How Code Generation Works

### 1. Prompt Crafting

System creates detailed prompt containing:

````
TASK ID: 1.1
TASK DESCRIPTION: Implement modular arithmetic operations
REQUIREMENTS: [full requirements.md]
DESIGN: [full design.md]
COMPLETED TASKS: [list of previous tasks]
INSTRUCTIONS: Format as ```path/to/file.ts ... ```
````

### 2. Copilot Invocation

```typescript
const model = await vscode.lm.selectChatModels({ vendor: "copilot" });
const response = model.sendRequest(messages, {}, token);
```

### 3. Response Parsing

Expects markdown code blocks with file paths:

````
```src/arithmetic/modular-arithmetic.ts
export function modularAdd(...) { ... }
````

```

### 4. File Writing

- Create directories as needed
- Write files with UTF-8 encoding
- Track changes in git
- No auto-commit

### 5. Test Validation

- Find test files matching task pattern
- Run tests automatically
- If tests fail: refine code with Copilot
- Max 2 retries

## What Gets Generated

For a task like "Implement modular arithmetic":

**Generated files:**
- `src/arithmetic/modular-arithmetic.ts` - Implementation
- `src/arithmetic/modular-arithmetic.test.ts` - Tests

**Characteristics:**
- Production-ready code
- Full type annotations
- Comprehensive error handling
- Well-documented
- Follows project conventions

## Error Recovery

### Generation Failure
→ User shown error in chat
→ Check Akira output channel
→ Adjust requirements and retry

### Test Failure
→ System attempts up to 2 refinements
→ Feeds failures back to Copilot
→ If still failing: manual review needed

### File Write Failure
→ Directory creation issue
→ Workspace permissions
→ Check Akira output for details

## Performance

- Model selection: <1s
- Prompt send: <1s
- Copilot generation: 3-10s
- Response streaming: included
- File writing: <1s
- Test execution: 1-5s
- **Total: 5-20 seconds per task**

## Logging Details

Every operation logged to **Akira** output channel:

```

[15:24:30] [CodeGen] [INFO] Starting code generation...
[15:24:35] [CodeGen] [INFO] Using model: Copilot (gpt-4o)
[15:24:40] [CodeGen] [INFO] Received 2841 characters
[15:24:41] [CodeGen] [INFO] Parsed 2 code blocks
[15:24:41] [CodeGen] [INFO] Generated code for: src/arithmetic/...
[15:24:42] [AutoExec] [INFO] Wrote file: src/arithmetic/...
[15:24:45] [TestRunner] [INFO] Tests passed!

```

Levels: INFO, WARN, ERROR, DEBUG

## Testing Autonomous Execution

### Test 1: Simple Task
```

@spec test-feature autonomously execute

```
Expected: Code generated, files written, task marked complete

### Test 2: Complex Task
```

@spec complex-feature autonomously execute

```
Expected: Multiple files generated, tests run, results shown

### Test 3: Task with Tests
```

@spec math-feature autonomously execute

```
Expected: Code generated, tests run, refinement attempted if failures

### Monitor Logs
```

Cmd+Shift+P > "Akira: Show Channel"

````

## Configuration

### VS Code Settings
```json
{
  "copilotSpec.specDirectory": ".akira/specs",
  "copilotSpec.strictMode": true,
  "copilotSpec.propertyTestIterations": 100
}
````

## Requirements

✅ VS Code 1.108.1+
✅ GitHub Copilot extension
✅ Active Copilot subscription
✅ Language Model API enabled

## What's Different Now

| Feature              | Before              | After                     |
| -------------------- | ------------------- | ------------------------- |
| Autonomous execution | Shows guidance only | Generates actual code     |
| File writing         | Manual only         | Automatic                 |
| Code validation      | User responsibility | Automatic testing         |
| Feedback loop        | None                | Test-driven refinement    |
| Retry on failure     | Manual              | Up to 2 automatic retries |

## Common Commands

```
# Start autonomous execution
@spec my-feature autonomously execute

# Find next task manually
@spec my-feature next

# Mark task complete manually
@spec my-feature complete 1.1

# Continue to next phase
@spec my-feature continue

# Refresh spec tree
@spec refresh

# Validate spec
@spec my-feature validate
```

## Troubleshooting

### "No Copilot models available"

- Install GitHub Copilot extension
- Sign in with GitHub account
- Verify Copilot is enabled

### Generated code doesn't work

- Check requirements.md is detailed
- Include examples in requirements
- Add context about project structure
- Review generated files in workspace

### Tests fail repeatedly

- Manual fixes may be needed
- Ask Copilot directly for help
- Consider breaking task into smaller parts
- Check test file location

### Files not written

- Verify workspace folder exists
- Check src/ directory exists
- Review file permissions
- See Akira output for errors

## Next Steps

1. **Try it out** - Run `@spec <feature> autonomously execute`
2. **Monitor logs** - Open Akira output channel
3. **Check results** - Review generated files in VS Code
4. **Iterate** - Refine specs and retry
5. **Automate** - Use with other features

## Documentation

- `AUTONOMOUS-CODE-GENERATION.md` - Complete reference
- `TECHNICAL-DEEP-DIVE.md` - Architecture details
- `IMPLEMENTATION-SUMMARY.md` - Technical overview
- `CHANGES-SUMMARY.md` - What changed

## Key Takeaway

**The "automatically execute" button now actually executes autonomously.**

It:

- ✅ Generates real code via Copilot
- ✅ Writes files to workspace
- ✅ Validates with tests
- ✅ Refines on failures
- ✅ Reports results

No more guidance-only prompts. True autonomous code generation using VS Code's native Copilot APIs.
