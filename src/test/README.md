# VS Code Extension E2E Tests

This directory contains end-to-end tests that run in a real VS Code instance.

## Running E2E Tests

### Prerequisites

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Build the extension:
   ```bash
   yarn build
   ```

### Run Tests

#### From Command Line

```bash
yarn test:e2e
```

This will:

1. Download a VS Code instance (if not already cached)
2. Launch VS Code with the extension loaded
3. Run all E2E tests
4. Report results

#### From VS Code

1. Open the Run and Debug panel (Ctrl+Shift+D / Cmd+Shift+D)
2. Select "Extension E2E Tests" from the dropdown
3. Press F5 or click the green play button

This will launch a new VS Code window with the extension loaded and run the tests.

### Debugging Tests

To debug E2E tests:

1. Set breakpoints in your test files (`src/test/suite/*.e2e.test.ts`)
2. Use the "Extension E2E Tests" launch configuration
3. The debugger will stop at your breakpoints

## Test Structure

### Test Files

- `src/test/suite/extension.e2e.test.ts` - Main E2E test suite
- `src/test/suite/index.ts` - Test runner configuration
- `src/test/runTest.ts` - Entry point for running tests

### Test Categories

The E2E tests cover:

1. **Extension Activation** - Verifies the extension loads correctly
2. **Commands Registration** - Ensures all commands are registered
3. **Tree View** - Tests the spec tree view functionality
4. **Configuration** - Tests reading and updating settings
5. **Spec Creation Workflow** - Tests creating and managing specs
6. **Status Bar** - Verifies status bar integration
7. **Chat Participant** - Tests chat participant registration
8. **Error Handling** - Tests graceful error handling
9. **Multi-Spec Workflow** - Tests handling multiple specs
10. **Performance** - Tests performance with many specs

## Writing New Tests

To add new E2E tests:

1. Add test cases to `src/test/suite/extension.e2e.test.ts`
2. Use the Mocha TDD interface (`suite`, `test`, `setup`, `teardown`)
3. Use VS Code APIs directly (they're available in the test environment)
4. Clean up any test artifacts in `teardown` hooks

Example:

```typescript
suite("My New Feature", () => {
  test("Should do something", async () => {
    // Your test code here
    const result = await vscode.commands.executeCommand("myCommand");
    assert.ok(result);
  });
});
```

## CI/CD Integration

To run E2E tests in CI:

```bash
# Install dependencies
yarn install

# Build extension
yarn build

# Run E2E tests (requires Xvfb on Linux)
yarn test:e2e
```

For Linux CI environments, you may need to use Xvfb:

```bash
xvfb-run -a yarn test:e2e
```

## Troubleshooting

### Tests Timeout

If tests timeout, increase the timeout in `src/test/suite/index.ts`:

```typescript
const mocha = new Mocha({
  timeout: 20000, // Increase to 20 seconds
});
```

### VS Code Download Issues

If VS Code fails to download, check your network connection and proxy settings.

### Extension Not Activating

Ensure the extension builds successfully before running tests:

```bash
yarn build
```

Check for build errors in the output.

### Tests Fail Locally But Pass in CI (or vice versa)

This can happen due to:

- Different VS Code versions
- Different OS environments
- Timing issues

Use `this.timeout()` in tests to adjust timeouts as needed.
