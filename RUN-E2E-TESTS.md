# Running E2E Tests - Quick Guide

## Prerequisites

1. **Build the extension first**:
   ```bash
   yarn build
   ```

## Running E2E Tests

### Method 1: Command Line (Recommended)

```bash
yarn test:e2e
```

This will:

- Create a temporary workspace
- Download VS Code (if not cached)
- Launch VS Code with the extension
- Run all E2E tests
- Clean up the temporary workspace
- Report results

### Method 2: VS Code Debugger

1. Open VS Code
2. Press **F5** or **Ctrl+Shift+D** (Cmd+Shift+D on Mac)
3. Select **"Extension E2E Tests"** from the dropdown
4. Click the green play button or press **F5**

This will:

- Build the extension automatically
- Launch a new VS Code window (Extension Development Host)
- Run all E2E tests
- Show results in the Debug Console

## What Gets Tested

The E2E tests verify:

- ✅ Extension activation
- ✅ Command registration (all 5 commands)
- ✅ Tree view functionality
- ✅ Configuration management
- ✅ Spec creation workflow
- ✅ Status bar integration
- ✅ Chat participant registration
- ✅ Error handling
- ✅ Multi-spec workflows
- ✅ Performance with many specs

## Troubleshooting

### Error: "No workspace folder found"

**Solution**: The test runner now creates a temporary workspace automatically. If you still see this error:

1. Make sure you've built the extension: `yarn build`
2. Try running from VS Code debugger instead

### Error: "Extension not found"

**Solution**:

1. Check that `package.json` has correct publisher: `"publisher": "Digital-Defiance"`
2. Rebuild: `yarn build`
3. The extension ID should be: `Digital-Defiance.akira`

### Error: "Test run failed with code 1"

**Solution**:

1. Check the output for specific test failures
2. Ensure all dependencies are installed: `yarn install`
3. Try cleaning and rebuilding:
   ```bash
   rm -rf dist
   yarn build
   yarn test:e2e
   ```

### Tests Timeout

**Solution**: Increase timeout in `src/test/suite/index.ts`:

```typescript
const mocha = new Mocha({
  timeout: 20000, // Increase to 20 seconds
});
```

### VS Code Download Fails

**Solution**:

- Check your internet connection
- Check proxy settings
- The test runner downloads VS Code from Microsoft's servers

## Platform-Specific Notes

### Windows

```bash
yarn test:e2e
```

### macOS

```bash
yarn test:e2e
```

### Linux

You need Xvfb (X Virtual Framebuffer):

```bash
# Install Xvfb
sudo apt-get install xvfb

# Run tests
xvfb-run -a yarn test:e2e
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Build Extension
  run: yarn build

- name: Run E2E Tests (Linux)
  if: runner.os == 'Linux'
  run: xvfb-run -a yarn test:e2e

- name: Run E2E Tests (Windows/macOS)
  if: runner.os != 'Linux'
  run: yarn test:e2e
```

## Test Output

Successful run:

```
✓ Extension E2E Test Suite (39)
  ✓ Extension Activation (5)
  ✓ Commands Registration (5)
  ✓ Tree View (3)
  ...

39 passing (10s)
```

Failed run:

```
1) Extension E2E Test Suite
   "before all" hook:
   AssertionError: Extension not found
```

## Quick Commands

```bash
# Full test cycle
yarn build && yarn test:e2e

# Just E2E tests (assumes already built)
yarn test:e2e

# Unit tests (fast)
yarn test

# All tests
yarn test && yarn build && yarn test:e2e
```

## Debugging E2E Tests

1. Set breakpoints in `src/test/suite/extension.e2e.test.ts`
2. Use "Extension E2E Tests" launch configuration
3. Press F5
4. Debugger will stop at breakpoints

## Performance

- **First run**: ~30-60 seconds (downloads VS Code)
- **Subsequent runs**: ~10-20 seconds (uses cached VS Code)
- **39 tests** covering all major functionality

## Summary

**Quick Start**:

```bash
yarn build
yarn test:e2e
```

**From VS Code**:
Press F5 → Select "Extension E2E Tests"

That's it! 🎉
