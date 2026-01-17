/**
 * Screenshot Automation for Documentation
 * This test suite captures screenshots of Akira in action for README documentation
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// Helper to wait for UI updates
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to capture screenshot using MCP screenshot tool
async function captureScreenshot(filename: string): Promise<void> {
  try {
    const imagePath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'images', filename);
    
    console.log(`📸 Capturing screenshot: ${filename}`);
    
    // Note: MCP screenshot tool integration happens at the Copilot level
    // This test suite sets up the scenarios, but screenshots need to be captured
    // by invoking the MCP tool through Copilot Chat or direct MCP client
    
    // Mark that a screenshot should be taken here
    vscode.window.showInformationMessage(`📸 Screenshot point: ${filename}`);
    
    // Wait a bit for the info message to be visible
    await wait(500);
    
  } catch (error) {
    console.error(`Failed to capture screenshot ${filename}:`, error);
  }
}

suite("Screenshot Automation Suite", function() {
  // Increase timeout for screenshot operations
  this.timeout(60000);

  let workspaceRoot: string;

  suiteSetup(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    assert.ok(workspaceFolders && workspaceFolders.length > 0, "No workspace folder found");
    workspaceRoot = workspaceFolders[0].uri.fsPath;

    // Ensure extension is activated
    const extension = vscode.extensions.getExtension("DigitalDefiance.acs-akira");
    if (extension && !extension.isActive) {
      await extension.activate();
    }

    // Ensure images directory exists
    const imagesDir = path.join(workspaceRoot, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
  });

  test("1. Capture Sidebar - Specs Tree View", async () => {
    // Open the Akira sidebar
    await vscode.commands.executeCommand('workbench.view.extension.akira-specs');
    await wait(1500);

    // Refresh specs to show current state
    await vscode.commands.executeCommand('akira.refreshSpecs');
    await wait(1000);

    await captureScreenshot('01-sidebar-specs-tree.png');
  });

  test("2. Capture Chat Participant - @spec Command", async () => {
    // Open Copilot Chat
    await vscode.commands.executeCommand('workbench.action.chat.open');
    await wait(1500);

    // Note: We can't programmatically type into chat, but we can open it
    // User will need to manually type "@spec " to show the participant
    console.log("Chat opened - manual interaction needed to show @spec participant");
    
    await wait(2000);
    await captureScreenshot('02-chat-participant.png');
  });

  test("3. Capture Spec Creation Flow", async () => {
    // Open Copilot Chat
    await vscode.commands.executeCommand('workbench.action.chat.open');
    await wait(1000);

    console.log("Please use chat to execute: @spec create demo-feature");
    console.log("Then this test will capture the result");
    
    // Wait for user to create spec
    await wait(5000);
    await captureScreenshot('03-spec-creation.png');
  });

  test("4. Capture Requirements Document", async () => {
    // Try to find and open a requirements document
    const specsDir = path.join(workspaceRoot, '.akira', 'specs');
    
    if (fs.existsSync(specsDir)) {
      const specs = fs.readdirSync(specsDir);
      if (specs.length > 0) {
        const firstSpec = specs[0];
        const reqsPath = path.join(specsDir, firstSpec, 'requirements.md');
        
        if (fs.existsSync(reqsPath)) {
          const doc = await vscode.workspace.openTextDocument(reqsPath);
          await vscode.window.showTextDocument(doc);
          await wait(1000);
          
          await captureScreenshot('04-requirements-document.png');
        }
      }
    }
  });

  test("5. Capture Design Document", async () => {
    const specsDir = path.join(workspaceRoot, '.akira', 'specs');
    
    if (fs.existsSync(specsDir)) {
      const specs = fs.readdirSync(specsDir);
      if (specs.length > 0) {
        const firstSpec = specs[0];
        const designPath = path.join(specsDir, firstSpec, 'design.md');
        
        if (fs.existsSync(designPath)) {
          const doc = await vscode.workspace.openTextDocument(designPath);
          await vscode.window.showTextDocument(doc);
          await wait(1000);
          
          await captureScreenshot('05-design-document.png');
        }
      }
    }
  });

  test("6. Capture Tasks Document with CodeLens", async () => {
    const specsDir = path.join(workspaceRoot, '.akira', 'specs');
    
    if (fs.existsSync(specsDir)) {
      const specs = fs.readdirSync(specsDir);
      if (specs.length > 0) {
        const firstSpec = specs[0];
        const tasksPath = path.join(specsDir, firstSpec, 'tasks.md');
        
        if (fs.existsSync(tasksPath)) {
          const doc = await vscode.workspace.openTextDocument(tasksPath);
          await vscode.window.showTextDocument(doc);
          await wait(2000); // Wait for CodeLens to appear
          
          await captureScreenshot('06-tasks-codelens.png');
        }
      }
    }
  });

  test("7. Capture Status Bar", async () => {
    // Status bar should be visible with current spec info
    await wait(1000);
    
    await captureScreenshot('07-status-bar.png');
  });

  test("8. Capture Spec List Command", async () => {
    // Open chat and wait for @spec list result
    await vscode.commands.executeCommand('workbench.action.chat.open');
    await wait(1000);

    console.log("Please execute: @spec list");
    await wait(5000);
    
    await captureScreenshot('08-spec-list.png');
  });

  test("9. Capture EARS Validation", async () => {
    // Open a requirements document
    const specsDir = path.join(workspaceRoot, '.akira', 'specs');
    
    if (fs.existsSync(specsDir)) {
      const specs = fs.readdirSync(specsDir);
      if (specs.length > 0) {
        const firstSpec = specs[0];
        const reqsPath = path.join(specsDir, firstSpec, 'requirements.md');
        
        if (fs.existsSync(reqsPath)) {
          const doc = await vscode.workspace.openTextDocument(reqsPath);
          await vscode.window.showTextDocument(doc);
          await wait(1000);

          // Open chat for validation
          await vscode.commands.executeCommand('workbench.action.chat.open');
          await wait(1000);
          
          console.log("Please execute: @spec validate");
          await wait(5000);
          
          await captureScreenshot('09-ears-validation.png');
        }
      }
    }
  });

  test("10. Capture Property-Based Testing Properties", async () => {
    const specsDir = path.join(workspaceRoot, '.akira', 'specs');
    
    if (fs.existsSync(specsDir)) {
      const specs = fs.readdirSync(specsDir);
      if (specs.length > 0) {
        const firstSpec = specs[0];
        const designPath = path.join(specsDir, firstSpec, 'design.md');
        
        if (fs.existsSync(designPath)) {
          const doc = await vscode.workspace.openTextDocument(designPath);
          const editor = await vscode.window.showTextDocument(doc);
          await wait(500);
          
          // Try to find and scroll to correctness properties section
          const text = doc.getText();
          const propsIndex = text.indexOf('## Correctness Properties');
          if (propsIndex > -1) {
            const position = doc.positionAt(propsIndex);
            editor.revealRange(new vscode.Range(position, position));
            await wait(1000);
          }
          
          await captureScreenshot('10-correctness-properties.png');
        }
      }
    }
  });
});
