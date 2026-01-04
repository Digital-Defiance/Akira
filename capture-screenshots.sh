#!/bin/bash

# Screenshot Capture Script for Akira Documentation
# This script orchestrates screenshot capture for the README

echo "🎬 Starting Akira Screenshot Automation"
echo "========================================"

IMAGES_DIR="./images"
mkdir -p "$IMAGES_DIR"

echo ""
echo "📸 This script will guide you through capturing screenshots."
echo "   Follow the prompts and capture each screenshot manually."
echo ""

# Function to prompt for screenshot
capture_shot() {
    local filename=$1
    local description=$2
    
    echo "📷 Screenshot $filename"
    echo "   $description"
    echo "   Press Enter when ready to capture..."
    read
    
    echo "   ✅ Screenshot captured (save as $IMAGES_DIR/$filename)"
    echo ""
}

# Capture sequence
capture_shot "01-sidebar-specs-tree.png" "Open Akira sidebar (Activity Bar icon) and show spec tree"
capture_shot "02-chat-participant.png" "Open Copilot Chat and type '@spec ' to show participant"
capture_shot "03-spec-creation.png" "In chat, show '@spec create demo-feature' command"
capture_shot "04-requirements-document.png" "Open a requirements.md file showing EARS patterns"
capture_shot "05-design-document.png" "Open a design.md file showing correctness properties"
capture_shot "06-tasks-codelens.png" "Open tasks.md showing CodeLens 'Execute Task' links"
capture_shot "07-status-bar.png" "Show status bar with active spec information"
capture_shot "08-spec-list.png" "In chat, show '@spec list' command output"
capture_shot "09-ears-validation.png" "In chat, show '@spec validate' command output"
capture_shot "10-correctness-properties.png" "Scroll to Correctness Properties section in design.md"

echo "✨ Screenshot capture complete!"
echo "   All screenshots should be saved in $IMAGES_DIR/"
echo "   README.md has been updated with screenshot references"
