# Running VS Code E2E Tests

The E2E tests run in an actual VS Code instance and test the extension's integration with VS Code APIs.

## Prerequisites

1. Build the extension first:
   ```bash
   yarn build
   ```

## Running E2E Tests from Command Line

```bash
yarn test:e2e
```

This will:

1. Download a VS Code instance (if not cached)
2. Launch VS Code with your extension
3. Run all E2E tests
4. Report results

### On Linux

You need Xvfb (X Virtual Framebuffer) to run VS Code headlessly:

```bash
xvfb-run -a yarn test:e2e
```

Or install Xvfb:

```bash
sudo apt-get install xvfb
```

### On Windows/macOS

Just run:

```bash
yarn test:e2e
```

## Running E2E Tests from VS Code

1. Open the **Run and Debug** panel (Ctrl+Shift+D / Cmd+Shift+D)
2. Select **"Extension E2E Tests"** from the dropdown
3. Press **F5** or click the green play button

This will:

- Build the extension automatically
- Launch a new VS Code window (Extension Development Host)
- Run all E2E tests
- Show results in the Debug Console

## Debugging E2E Tests

1. Set breakpoints in `src/test/suite/extension.e2e.test.ts`
2. Use the **"Extension E2E Tests"** launch configuration
3. Press **F5**
4. The debugger will stop at your breakpoints

## Test Structure

E2E tests are in: `src/test/suite/extension.e2e.test.ts`

They use Mocha's TDD interface:

```typescript
suite("My Feature", () => {
  test("Should work", async () => {
    // Test code
  });
});
```

## Important Notes

### Unit Tests vs E2E Tests

**Unit Tests (Vitest):**

- Run with: `yarn test`
- Fast (1-2 seconds)
- Mock VS Code APIs
- Test individual functions
- Files: `src/**/*.test.ts` (excluding `*.e2e.test.ts`)

**E2E Tests (Mocha + VS Code):**

- Run with: `yarn test:e2e`
- Slower (10-30 seconds)
- Real VS Code instance
- Test full integration
- Files: `src/**/*.e2e.test.ts`

### Why E2E Tests Fail with `yarn test`

E2E tests require a real VS Code instance and cannot run with vitest. They will fail if you try to run them with `yarn test` because:

1. `vscode` module is not available in Node.js
2. VS Code APIs need the actual VS Code environment
3. Extension activation requires VS Code's extension host

The vitest config explicitly excludes E2E tests:

```typescript
exclude: ["src/**/*.e2e.test.ts", "node_modules/**"];
```

## Troubleshooting

### Tests Timeout

Increase timeout in `src/test/suite/index.ts`:

```typescript
const mocha = new Mocha({
  timeout: 20000, // Increase to 20 seconds
});
```

### VS Code Download Fails

Check your network connection and proxy settings. The test runner downloads VS Code from Microsoft's servers.

### Extension Not Activating

1. Ensure the extension builds successfully: `yarn build`
2. Check for errors in the Debug Console
3. Verify `package.json` has correct activation events

### Tests Pass Locally But Fail in CI

This can happen due to:

- Different VS Code versions
- Different OS environments
- Timing issues

Use `this.timeout()` in tests to adjust timeouts:

```typescript
test("Slow test", async function () {
  this.timeout(30000); // 30 seconds
  // test code
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Unit Tests
  run: yarn test

- name: Build Extension
  run: yarn build

- name: Run E2E Tests (Linux)
  if: runner.os == 'Linux'
  run: xvfb-run -a yarn test:e2e

- name: Run E2E Tests (Windows/macOS)
  if: runner.os != 'Linux'
  run: yarn test:e2e
```

## Quick Reference

| Command           | Description                  | Speed         | Environment |
| ----------------- | ---------------------------- | ------------- | ----------- |
| `yarn test`       | Run unit tests               | Fast (1-2s)   | Node.js     |
| `yarn test:watch` | Run unit tests in watch mode | Fast          | Node.js     |
| `yarn test:e2e`   | Run E2E tests                | Slow (10-30s) | VS Code     |
| `yarn build`      | Build extension              | Medium (5s)   | Node.js     |
| `yarn compile`    | Type check only              | Fast (2s)     | Node.js     |

## Best Practices

1. **Run unit tests frequently** - They're fast and catch most issues
2. **Run E2E tests before commits** - They catch integration issues
3. **Use E2E tests for critical paths** - Don't test everything with E2E
4. **Keep E2E tests focused** - Test user workflows, not implementation details
5. **Clean up after tests** - Remove test files/directories in teardown

## Example: Running All Tests

```bash
# 1. Type check
yarn compile

# 2. Run unit tests
yarn test

# 3. Build extension
yarn build

# 4. Run E2E tests
yarn test:e2e
```

This ensures everything works before committing!
