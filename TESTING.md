# Testing Guide

This project has two types of tests:

## 1. Unit/Integration Tests (Vitest)

Fast tests that run in Node.js without VS Code.

### Run Unit Tests

```bash
# Run all unit tests once
yarn test

# Run tests in watch mode
yarn test:watch

# Run specific test file
yarn vitest --run src/config-manager.test.ts
```

### Test Files

All files ending in `.test.ts` (except `.e2e.test.ts`) are unit tests:

- `src/config-manager.test.ts`
- `src/design-generator.test.ts`
- `src/requirements-generator.test.ts`
- `src/task-generator.test.ts`
- `src/vscode-extension.integration.test.ts` (integration-style unit tests)
- etc.

## 2. E2E Tests (Mocha + VS Code Test Runner)

Real integration tests that run in an actual VS Code instance.

### Run E2E Tests

```bash
# Build first
yarn build

# Run E2E tests
yarn test:e2e
```

### Run E2E Tests from VS Code

1. Open Run and Debug panel (Ctrl+Shift+D / Cmd+Shift+D)
2. Select "Extension E2E Tests"
3. Press F5

This launches a new VS Code window with your extension and runs the tests.

### Debug E2E Tests

1. Set breakpoints in `src/test/suite/extension.e2e.test.ts`
2. Use "Extension E2E Tests" launch configuration
3. Press F5

### Test Files

All files ending in `.e2e.test.ts` are E2E tests:

- `src/test/suite/extension.e2e.test.ts`

## Test Coverage

### Unit Tests Cover:

- Individual functions and classes
- Business logic
- Data transformations
- Validation rules
- State management
- Error handling

### E2E Tests Cover:

- Extension activation
- Command registration
- Tree view functionality
- Configuration management
- Real file system operations
- VS Code API integration
- Multi-spec workflows
- Performance with many specs

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "./my-module";

describe("My Module", () => {
  it("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### E2E Test Example

```typescript
import * as assert from "assert";
import * as vscode from "vscode";

suite("My Feature E2E", () => {
  test("Should work in VS Code", async () => {
    await vscode.commands.executeCommand("myCommand");
    assert.ok(true);
  });
});
```

## CI/CD

### GitHub Actions Example

```yaml
- name: Run Unit Tests
  run: yarn test

- name: Build Extension
  run: yarn build

- name: Run E2E Tests
  run: xvfb-run -a yarn test:e2e # Linux only
```

## Troubleshooting

### Unit Tests Fail

1. Check for syntax errors: `yarn compile`
2. Run specific test: `yarn vitest --run src/failing-test.test.ts`
3. Check test output for details

### E2E Tests Fail

1. Ensure extension builds: `yarn build`
2. Check VS Code version compatibility
3. Increase timeout if needed (in `src/test/suite/index.ts`)
4. Run with `--verbose` for more details

### E2E Tests Timeout

Edit `src/test/suite/index.ts`:

```typescript
const mocha = new Mocha({
  timeout: 20000, // Increase timeout
});
```

Or in individual tests:

```typescript
test("Slow test", async function () {
  this.timeout(30000); // 30 seconds
  // test code
});
```

## Best Practices

1. **Keep unit tests fast** - Mock external dependencies
2. **Use E2E tests sparingly** - They're slower but more realistic
3. **Clean up after tests** - Remove test files/directories
4. **Test error cases** - Don't just test happy paths
5. **Use descriptive test names** - Make failures easy to understand
6. **Avoid test interdependence** - Each test should be independent

## Performance

- Unit tests: ~1-2 seconds for full suite
- E2E tests: ~10-30 seconds (includes VS Code startup)

Keep unit tests fast by:

- Mocking file system operations
- Avoiding real VS Code APIs
- Using in-memory data structures
