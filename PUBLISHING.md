# Publishing Akira Extension

This guide explains how to publish the Akira extension to the VS Code Extension Marketplace.

## Important: VS Code Marketplace Only

**Do NOT publish to npm registry.** This is a VS Code extension, not an npm package.

- ✅ **Publish to**: VS Code Extension Marketplace
- ❌ **Do NOT publish to**: npm registry

## Prerequisites

### 1. Install vsce (VS Code Extension Manager)

```bash
npm install -g @vscode/vsce
```

### 2. Create Azure DevOps Account

1. Go to https://dev.azure.com/
2. Sign in with Microsoft account
3. Create a new organization (if you don't have one)

### 3. Create Personal Access Token (PAT)

1. Go to https://dev.azure.com/
2. Click on your profile → **User settings** → **Personal access tokens**
3. Click **+ New Token**
4. Configure:
   - **Name**: "VS Code Marketplace"
   - **Organization**: Select your organization
   - **Expiration**: Choose duration (90 days recommended)
   - **Scopes**: Select **Marketplace** → **Manage**
5. Click **Create**
6. **Copy the token** (you won't see it again!)

### 4. Create Publisher

If you don't have a publisher yet:

```bash
vsce create-publisher Digital-Defiance
```

Or login to existing publisher:

```bash
vsce login Digital-Defiance
```

Enter your Personal Access Token when prompted.

## Pre-Publishing Checklist

Before publishing, ensure:

- [ ] All tests pass: `yarn test`
- [ ] E2E tests pass: `yarn test:e2e`
- [ ] Extension builds: `yarn build`
- [ ] Version number is updated in `package.json`
- [ ] `CHANGELOG.md` is updated
- [ ] `README.md` is complete
- [ ] Icon file exists: `icon.png`
- [ ] License file exists: `LICENSE`
- [ ] Repository URL is correct in `package.json`

## Publishing Steps

### 1. Update Version

Update version in `package.json`:

```json
{
  "version": "0.1.0" // Change this
}
```

Or use vsce to bump version automatically (see step 4).

### 2. Update CHANGELOG.md

Add release notes:

```markdown
## [0.1.0] - 2024-01-XX

### Added

- Initial release
- Spec-driven development workflow
- EARS requirements validation
- Property-based testing support
- MCP server integration
```

### 3. Build Extension

```bash
# Clean build
rm -rf dist
yarn build

# Verify build
ls -la dist/
```

### 4. Package Extension

Create a `.vsix` file:

```bash
vsce package
```

This creates `akira-0.1.0.vsix` in the current directory.

**Or package with version bump:**

```bash
vsce package patch  # 0.1.0 → 0.1.1
vsce package minor  # 0.1.0 → 0.2.0
vsce package major  # 0.1.0 → 1.0.0
```

### 5. Test the Package Locally

Install the `.vsix` file in VS Code:

```bash
code --install-extension akira-0.1.0.vsix
```

Or in VS Code:

1. Extensions panel → `...` menu → **Install from VSIX**
2. Select the `.vsix` file

Test the extension thoroughly!

### 6. Publish to Marketplace

```bash
vsce publish
```

**Or publish with version bump:**

```bash
vsce publish patch  # 0.1.0 → 0.1.1
vsce publish minor  # 0.1.0 → 0.2.0
vsce publish major  # 0.1.0 → 1.0.0
```

### 7. Verify Publication

1. Go to https://marketplace.visualstudio.com/
2. Search for "Akira"
3. Verify your extension appears
4. Check that all information is correct

## Post-Publishing

### Tag the Release in Git

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Create GitHub Release

1. Go to your GitHub repository
2. Click **Releases** → **Create a new release**
3. Tag: `v0.1.0`
4. Title: `Akira v0.1.0`
5. Description: Copy from CHANGELOG.md
6. Attach the `.vsix` file
7. Click **Publish release**

## Updating the Extension

When you need to publish an update:

```bash
# 1. Make changes
# 2. Update CHANGELOG.md
# 3. Run tests
yarn test
yarn test:e2e

# 4. Build
yarn build

# 5. Publish with version bump
vsce publish patch  # For bug fixes
vsce publish minor  # For new features
vsce publish major  # For breaking changes
```

## Unpublishing

If you need to unpublish (use with caution):

```bash
vsce unpublish Digital-Defiance.akira
```

**Note**: Unpublishing removes the extension for all users!

## Common Issues

### Issue: "Publisher not found"

**Solution**: Create or login to publisher:

```bash
vsce create-publisher Digital-Defiance
# or
vsce login Digital-Defiance
```

### Issue: "Invalid Personal Access Token"

**Solution**:

1. Create a new PAT with **Marketplace (Manage)** scope
2. Login again: `vsce login Digital-Defiance`

### Issue: "Extension validation failed"

**Solution**: Check:

- `package.json` has all required fields
- `icon.png` exists and is valid
- `README.md` exists
- No invalid characters in extension name

### Issue: "Version already exists"

**Solution**: Bump the version number in `package.json`

## Extension Marketplace Requirements

Your extension must have:

- ✅ **Name**: Unique, no special characters
- ✅ **Display Name**: User-friendly name
- ✅ **Description**: Clear, concise description
- ✅ **Version**: Semantic versioning (x.y.z)
- ✅ **Publisher**: Valid publisher ID
- ✅ **Icon**: 128x128 PNG file
- ✅ **Categories**: At least one category
- ✅ **README**: Comprehensive documentation
- ✅ **License**: Valid license file
- ✅ **Repository**: Link to source code

## Best Practices

1. **Test thoroughly** before publishing
2. **Use semantic versioning** (major.minor.patch)
3. **Update CHANGELOG** for every release
4. **Tag releases** in Git
5. **Create GitHub releases** with release notes
6. **Monitor marketplace** for user feedback
7. **Respond to issues** promptly
8. **Keep dependencies updated**

## Marketplace Statistics

After publishing, you can view:

- Install count
- Ratings and reviews
- Download statistics
- User feedback

Access at: https://marketplace.visualstudio.com/manage/publishers/Digital-Defiance

## Automation (Optional)

You can automate publishing with GitHub Actions:

```yaml
name: Publish Extension

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - run: yarn install
      - run: yarn test
      - run: yarn build

      - name: Publish to VS Code Marketplace
        run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

Store your PAT in GitHub Secrets as `VSCE_PAT`.

## Resources

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Marketplace](https://marketplace.visualstudio.com/)
- [Publisher Management](https://marketplace.visualstudio.com/manage)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)

## Quick Reference

```bash
# Install vsce
npm install -g @vscode/vsce

# Login
vsce login Digital-Defiance

# Package
vsce package

# Publish
vsce publish

# Publish with version bump
vsce publish patch  # Bug fixes
vsce publish minor  # New features
vsce publish major  # Breaking changes

# Unpublish (careful!)
vsce unpublish Digital-Defiance.akira
```

## Summary

1. **Install vsce**: `npm install -g @vscode/vsce`
2. **Create PAT**: Azure DevOps → Personal Access Tokens
3. **Login**: `vsce login Digital-Defiance`
4. **Test**: `yarn test && yarn test:e2e`
5. **Build**: `yarn build`
6. **Publish**: `vsce publish`

That's it! Your extension is now available in the VS Code Marketplace! 🎉
