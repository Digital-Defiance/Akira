# Manual Integration Test - Autonomous Code Generation

This guide walks through the complete user experience to verify autonomous code generation works end-to-end.

## Prerequisites

✅ VS Code 1.108.1+
✅ GitHub Copilot extension installed
✅ Active Copilot subscription
✅ Akira extension built and loaded

## Step 1: Create a Test Specification

### Create the spec directory structure

```bash
mkdir -p .akira/specs/math-module
```

### Create requirements.md

Create `.akira/specs/math-module/requirements.md`:

```markdown
# Math Module Requirements

## Feature: Modular Arithmetic

Implement basic modular arithmetic operations.

### 1.1 Modular Addition

- Function: `modularAdd(a: number, b: number, m: number): number`
- Returns: `(a + b) % m`
- Constraint: All inputs must be non-negative
- Example: `modularAdd(3, 4, 7)` returns `0`
- Example: `modularAdd(5, 6, 7)` returns `4`

### 1.2 Modular Multiplication

- Function: `modularMultiply(a: number, b: number, m: number): number`
- Returns: `(a * b) % m`
- Constraint: All inputs must be non-negative
- Example: `modularMultiply(3, 4, 7)` returns `5`
- Example: `modularMultiply(5, 6, 7)` returns `2`

### 1.3 Modular Exponentiation

- Function: `modularExponentiation(base: number, exp: number, m: number): number`
- Returns: `(base ^ exp) % m`
- Use BigInt for large numbers
- Example: `modularExponentiation(2, 10, 1000)` returns `24`

## Quality Requirements

- TypeScript with proper type annotations
- Comprehensive error handling
- All functions must be exported
- Code must follow project conventions
```

### Create design.md

Create `.akira/specs/math-module/design.md`:

```markdown
# Design - Math Module

## Architecture

### File Structure
```

src/
├── arithmetic/
│ ├── modular-arithmetic.ts # Implementation
│ └── modular-arithmetic.test.ts # Tests

````

### Implementation Strategy

#### Modular Addition
```typescript
export function modularAdd(a: number, b: number, m: number): number {
  if (m <= 0) throw new Error('Modulus must be positive');
  if (a < 0 || b < 0) throw new Error('Operands must be non-negative');
  return ((a % m) + (b % m)) % m;
}
````

#### Modular Multiplication

```typescript
export function modularMultiply(a: number, b: number, m: number): number {
  if (m <= 0) throw new Error("Modulus must be positive");
  if (a < 0 || b < 0) throw new Error("Operands must be non-negative");
  return ((a % m) * (b % m)) % m;
}
```

#### Modular Exponentiation

```typescript
export function modularExponentiation(
  base: number,
  exp: number,
  m: number,
): number {
  if (m <= 0) throw new Error("Modulus must be positive");
  if (base < 0 || exp < 0) throw new Error("Operands must be non-negative");

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

## Testing Strategy

- Use vitest for testing
- Test happy path for each function
- Test edge cases (zero, negative, large numbers)
- Test error conditions
- Aim for 100% code coverage

````

### Create tasks.md

Create `.akira/specs/math-module/tasks.md`:

```markdown
# Tasks - Math Module

## Phase 1: Implementation

- [ ] 1.1 Implement modular arithmetic functions
- [ ] 1.2 Add comprehensive test coverage
- [ ] 1.3 Verify all edge cases
````

## Step 2: Verify Spec Structure

Check that all files exist:

```bash
ls -la .akira/specs/math-module/
```

Expected output:

```
requirements.md
design.md
tasks.md
```

## Step 3: Open Akira Output Channel

In VS Code:

```
Cmd+Shift+U > Output > Select "Akira" from dropdown
```

Watch this channel - all logs will appear here.

## Step 4: Trigger Autonomous Execution

### Via Chat

Open VS Code Copilot Chat:

```
Cmd+Shift+I
```

Then type:

```
@spec math-module autonomously execute
```

### Expected Behavior - Chat Response

You should see in the chat:

```
🤖 Starting Autonomous Execution

Feature: math-module

Finding next incomplete task...

📋 Next Task: 1.1 - Implement modular arithmetic functions

🔨 Generating code for task 1.1...
Using Copilot to autonomously implement this task with test validation...

[After 5-20 seconds]

✅ Task 1.1 Completed Successfully!

Generated Files:
- src/arithmetic/modular-arithmetic.ts
- src/arithmetic/modular-arithmetic.test.ts

✨ Tests Passed! The implementation passed all validation tests.

Next Steps:
- Run @spec math-module autonomously execute to continue with the next task
- Or review the generated code and continue with @spec math-module continue

Check the Akira output channel for detailed generation logs.
```

## Step 5: Verify Akira Output Channel

Check the **Akira** output channel for detailed logs:

```
[CodeGen] Starting code generation for task: 1.1
[CodeGen] Using model: Copilot (gpt-4o)
[CodeGen] Sending prompt to Copilot...
[CodeGen] Received response: 2841 characters
[CodeGen] Parsed 2 code blocks from response
[CodeGen] Generated code for: src/arithmetic/modular-arithmetic.ts
[CodeGen] Generated code for: src/arithmetic/modular-arithmetic.test.ts
[AutoExec] Wrote file: src/arithmetic/modular-arithmetic.ts
[AutoExec] Wrote file: src/arithmetic/modular-arithmetic.test.ts
[TestRunner] Running tests from: src/arithmetic/modular-arithmetic.test.ts
[AutoExec] ✅ Tests passed! Task 1.1 completed successfully.
```

## Step 6: Verify Generated Files

Check that files were created:

```bash
ls -la src/arithmetic/
```

Expected:

```
modular-arithmetic.ts
modular-arithmetic.test.ts
```

View generated code:

```bash
cat src/arithmetic/modular-arithmetic.ts
```

You should see production-ready TypeScript code with:

- Proper function signatures
- Error handling
- Type annotations
- Comments

## Step 7: Verify Test Execution

Check test results in Akira output:

```
[TestRunner] Running tests from: src/arithmetic/modular-arithmetic.test.ts
[TestRunner] Command: npm run test -- src/arithmetic/modular-arithmetic.test.ts --reporter=verbose
[TestRunner] Output:
✓ src/arithmetic/modular-arithmetic.test.ts (9)
  ✓ modularAdd basic operation
  ✓ modularAdd edge cases
  ✓ modularMultiply basic operation
  ...
[TestRunner] Tests passed
```

## Step 8: Verify Task Status Updated

Check tasks.md:

```bash
cat .akira/specs/math-module/tasks.md
```

Expected:

```markdown
- [x] 1.1 Implement modular arithmetic functions
- [ ] 1.2 Add comprehensive test coverage
- [ ] 1.3 Verify all edge cases
```

Task 1.1 should now be marked as `[x]` (complete).

## Step 9: Continue to Next Task

Run again:

```
@spec math-module autonomously execute
```

Expected behavior:

- System finds task 1.2
- Generates implementation
- Runs tests
- Marks complete
- Repeats for 1.3

## Step 10: Verify Full Workflow Completion

When all tasks are complete:

```
✅ All Tasks Complete!

There are no more incomplete tasks for "math-module".
The spec has been fully implemented!
```

Check final file structure:

```bash
find src/arithmetic -type f -name "*.ts"
```

## Troubleshooting

### "No Copilot models available"

**Problem**: Copilot not installed or not authenticated

**Solution**:

1. Install GitHub Copilot extension from VS Code Marketplace
2. Sign in with GitHub account
3. Verify subscription is active
4. Reload VS Code window

### Chat shows error message

**Solution**:

1. Check Akira output channel for detailed error logs
2. Look for `[CodeGen] ERROR` or `[AutoExec] ERROR`
3. Check that workspace has write permissions
4. Verify `src/` directory exists

### Files not written to workspace

**Solution**:

1. Check Akira output for file write errors
2. Verify workspace path is correct
3. Check directory permissions: `ls -la src/`
4. Check available disk space

### Tests not running

**Solution**:

1. Verify vitest is installed: `npm ls vitest`
2. Check test file location matches task ID
3. Review test output in Akira channel
4. Run tests manually: `npm test -- src/arithmetic/modular-arithmetic.test.ts`

### Code quality issues

**Problem**: Generated code doesn't meet expectations

**Solution**:

1. Review requirements.md - be more specific
2. Add examples to design.md
3. Clarify implementation details
4. Try again with improved spec

## Success Criteria

✅ Chat responds immediately
✅ Task found and displayed
✅ Code generation starts (see in Akira output)
✅ Copilot called (see `[CodeGen] Using model:`)
✅ Code blocks parsed (see `[CodeGen] Parsed`)
✅ Files written (see `[AutoExec] Wrote file:`)
✅ Tests run (see `[TestRunner] Running tests`)
✅ Task marked complete (files updated)
✅ Next task ready or all complete message shown

## Performance Expectations

- Chat response: Immediate
- Code generation: 3-10 seconds
- File writing: <1 second
- Test execution: 1-5 seconds
- **Total per task: 5-20 seconds**

## What You're Testing

1. ✅ Spec parsing
2. ✅ Task finding
3. ✅ Context building (requirements + design)
4. ✅ Copilot integration
5. ✅ Code generation
6. ✅ File writing
7. ✅ Test execution
8. ✅ Task status management
9. ✅ User feedback

## Next Steps After Verification

If the full flow works:

1. Create your own specs
2. Run autonomous execution
3. Watch code get generated
4. Verify generated code quality
5. Adjust specs for better results

If something doesn't work:

1. Check Akira output channel
2. Review error messages
3. Try troubleshooting steps above
4. Report issue with logs from Akira output
