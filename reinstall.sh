#!/bin/bash
# Reinstall Akira extension script

set -e  # Exit on error

echo "🗑️  Uninstalling current extension..."
code --uninstall-extension DigitalDefiance.acs-akira || echo "Extension not installed or already uninstalled"

echo "🔨 Building extension..."
npm run build

echo "📦 Packaging extension..."
VSIX_FILE="acs-akira-reinstall-$(date +%Y%m%d-%H%M%S).vsix"
npx @vscode/vsce package --out "$VSIX_FILE"

echo "📥 Installing extension..."
code --install-extension "$VSIX_FILE"

echo "✅ Done! Extension installed: $VSIX_FILE"
echo "⚠️  Please manually reload VS Code window:"
echo "   - Press F1"
echo "   - Type 'Developer: Reload Window'"
echo "   - Press Enter"
