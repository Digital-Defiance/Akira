# Testing Summary

## Test Commands Quick Reference

```bash
# Unit tests (fast, mocked VS Code)
yarn test                    # Run once
yarn test:watch              # Watch mode

# E2E tests (slow, real VS Code)
yarn test:e2e                # Command line
# OR use VS Code debugger: F5 → "Extension E2E Tests"

# Build & type check
yarn build                   # Build extension
yarn compile                 # Type check only
```

## Test Types

### 1. Unit Tests (Vitest)

- **Location**: `src/**/*.test.ts` (excluding `*.e2e.test.ts`)
- **Run with**: `yarn test`
- **Speed**: 1-2 seconds
- **Environment**: Node.js with mocked VS Code APIs
- **Purpose**: Test individual functions and classes

**Files**:

- `src/config-manager.test.ts`
- `src/design-generator.test.ts`
- `src/requirements-generator.test.ts`
- `src/task-generator.test.ts`
- `src/vscode-extension.integration.test.ts`
- And many more...

### 2. E2E Tests (Mocha + VS Code Test Runner)

- **Location**: `src/test/suite/extension.e2e.test.ts`
- **Run with**: `yarn test:e2e` or VS Code debugger
- **Speed**: 10-30 seconds
- **Environment**: Real VS Code instance
- **Purpose**: Test full extension integration

**Test Coverage**:

- Extension activation
- Command registration
- Tree view functionality
- Configuration management
- Spec creation workflow
- Status bar integration
- Error handling
- Performance testing

## Why Two Test Systems?

### Unit Tests (Vitest) - For Development

✅ **Fast feedback** - Run in 1-2 seconds  
✅ **Watch mode** - Automatically rerun on changes  
✅ **Easy debugging** - Standard Node.js debugging  
✅ **Isolated testing** - Test one thing at a time  
✅ **CI friendly** - No special setup needed

❌ Can't test real VS Code integration  
❌ Requires mocking VS Code APIs

### E2E Tests (Mocha) - For Validation

✅ **Real environment** - Actual VS Code instance  
✅ **Integration testing** - Test how components work together  
✅ **User workflows** - Test actual user scenarios  
✅ **Catch integration bugs** - Find issues unit tests miss

❌ Slow - Takes 10-30 seconds  
❌ Complex setup - Requires VS Code download  
❌ Harder to debug - Multiple processes

## Running Tests

### Development Workflow

```bash
# 1. Make changes to code
# 2. Run unit tests (fast feedback)
yarn test:watch

# 3. When ready, run E2E tests
yarn build && yarn test:e2e
```

### Pre-Commit Workflow

```bash
# Run everything
yarn compile  # Type check
yarn test     # Unit tests
yarn build    # Build extension
yarn test:e2e # E2E tests
```

### CI/CD Workflow

```yaml
# GitHub Actions
- run: yarn test # Unit tests
- run: yarn build # Build
- run: xvfb-run -a yarn test:e2e # E2E (Linux)
```

## Test Configuration

### Unit Tests (vitest.config.ts)

```typescript
{
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.e2e.test.ts"],  // Exclude E2E tests
    setupFiles: ["./vitest.setup.ts"],   // Mock setup
  },
  resolve: {
    alias: {
      vscode: "./src/__mocks__/vscode.ts"  // Mock vscode
    }
  }
}
```

### E2E Tests (src/test/suite/index.ts)

```typescript
const mocha = new Mocha({
  ui: "tdd",
  timeout: 10000, // 10 second timeout
});
```

## Mocking Strategy

### Unit Tests Mock:

1. **VS Code APIs** - `src/__mocks__/vscode.ts`
2. **Shared Status Bar** - `vitest.setup.ts`
3. **MCP Client Base** - `vitest.setup.ts`

### E2E Tests Use:

- Real VS Code APIs
- Real file system
- Real extension activation

## Common Issues

### Issue: E2E tests fail with "Cannot find module 'vscode'"

**Solution**: E2E tests must be run with `yarn test:e2e`, not `yarn test`

### Issue: Unit tests fail with vscode import errors

**Solution**: Ensure `vitest.setup.ts` is configured and mocks are in place

### Issue: Tests timeout

**Solution**: Increase timeout in test file:

```typescript
test("slow test", async function () {
  this.timeout(30000); // 30 seconds
  // test code
});
```

### Issue: E2E tests fail in CI

**Solution**: Use Xvfb on Linux:

```bash
xvfb-run -a yarn test:e2e
```

## Test Statistics

Current test coverage:

- **Unit tests**: 297 passing
- **E2E tests**: 39 tests covering 10 categories
- **Total**: 336 tests

## Best Practices

1. **Write unit tests first** - They're faster and easier to debug
2. **Use E2E tests for critical paths** - Don't test everything with E2E
3. **Keep tests independent** - Each test should work in isolation
4. **Clean up after tests** - Remove test files in teardown
5. **Use descriptive names** - Make failures easy to understand
6. **Mock external dependencies** - Keep unit tests fast
7. **Test error cases** - Don't just test happy paths

## Debugging

### Unit Tests

```bash
# VS Code debugger
1. Set breakpoint in test file
2. Press F5
3. Select "Debug Vitest Tests"
```

### E2E Tests

```bash
# VS Code debugger
1. Set breakpoint in src/test/suite/extension.e2e.test.ts
2. Press F5
3. Select "Extension E2E Tests"
```

## Documentation

- **TESTING.md** - Complete testing guide
- **E2E-TESTING.md** - E2E testing specific guide
- **src/test/README.md** - E2E test documentation
- **TESTING-SUMMARY.md** - This file

## Quick Troubleshooting

| Problem                         | Solution                       |
| ------------------------------- | ------------------------------ |
| E2E tests fail with `yarn test` | Use `yarn test:e2e` instead    |
| Unit tests can't find vscode    | Check `vitest.config.ts` alias |
| Tests timeout                   | Increase timeout in test file  |
| VS Code won't download          | Check network/proxy settings   |
| Extension won't activate        | Run `yarn build` first         |
| Mocks not working               | Check `vitest.setup.ts`        |

## Summary

- **Unit tests**: Fast, mocked, for development
- **E2E tests**: Slow, real, for validation
- **Run both**: Before committing code
- **CI/CD**: Automate both test types
- **Debug**: Use VS Code debugger for both

Happy testing! 🧪
