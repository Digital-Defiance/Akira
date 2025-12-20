/**
 * Test runner entry point for VS Code extension E2E tests
 */

import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Create a temporary workspace for testing
    const tempWorkspace = path.join(os.tmpdir(), "akira-test-workspace");
    if (!fs.existsSync(tempWorkspace)) {
      fs.mkdirSync(tempWorkspace, { recursive: true });
    }

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        tempWorkspace, // Open the temp workspace
        "--disable-extensions", // Disable other extensions
        "--disable-workspace-trust", // Disable workspace trust
      ],
    });

    // Clean up temp workspace
    if (fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
