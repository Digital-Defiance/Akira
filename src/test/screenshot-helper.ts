/**
 * Screenshot Capture Helper
 * Run this alongside the screenshot automation test to save captured screenshots
 */

import * as vscode from 'vscode';
import * as path from 'path';

const IMAGES_DIR = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'images');

/**
 * Capture and save screenshot
 * This function should be called by Copilot with MCP screenshot tool
 * providing the savePath parameter
 */
export async function captureAndSave(filename: string): Promise<void> {
  const savePath = path.join(IMAGES_DIR, filename);
  
  console.log(`📸 Requesting screenshot save to: ${savePath}`);
  
  // The MCP screenshot tool needs to be called with savePath
  // Example MCP call:
  // {
  //   "tool": "screenshot_capture_full",
  //   "arguments": {
  //     "format": "png",
  //     "savePath": savePath
  //   }
  // }
  
  vscode.window.showInformationMessage(`Screenshot should be saved to: ${filename}`);
}

// Export screenshot filenames for documentation
export const SCREENSHOTS = {
  SIDEBAR: '01-sidebar-specs-tree.png',
  CHAT: '02-chat-participant.png',
  CREATE: '03-spec-creation.png',
  REQUIREMENTS: '04-requirements-document.png',
  DESIGN: '05-design-document.png',
  TASKS: '06-tasks-codelens.png',
  STATUS_BAR: '07-status-bar.png',
  LIST: '08-spec-list.png',
  VALIDATION: '09-ears-validation.png',
  PROPERTIES: '10-correctness-properties.png'
};
