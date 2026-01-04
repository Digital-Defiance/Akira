const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  // Build extension
  const extensionCtx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "info",
    plugins: [
      {
        name: "watch-plugin",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("Extension build failed with errors");
            } else {
              console.log("Extension build succeeded");
            }
          });
        },
      },
    ],
  });

  // Build standalone MCP server
  const mcpServerCtx = await esbuild.context({
    entryPoints: ["src/mcp-server-standalone.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/mcp-server-standalone.js",
    external: ["vscode"], // Mark vscode as external even though it shouldn't be used
    logLevel: "info",
    plugins: [
      {
        name: "watch-plugin",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("MCP Server build failed with errors");
            } else {
              console.log("MCP Server build succeeded");
            }
          });
        },
      },
    ],
  });

  // Build test runner
  const testCtx = await esbuild.context({
    entryPoints: ["src/test/runTest.ts", "src/test/suite/index.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outdir: "dist/test",
    external: ["vscode", "mocha"],
    logLevel: "info",
    plugins: [
      {
        name: "watch-plugin",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("Test build failed with errors");
            } else {
              console.log("Test build succeeded");
            }
          });
        },
      },
    ],
  });

  // Build E2E tests
  const e2eTestCtx = await esbuild.context({
    entryPoints: ["src/test/suite/extension.e2e.test.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outdir: "dist/test/suite",
    external: ["vscode", "mocha", "assert"],
    logLevel: "info",
    plugins: [
      {
        name: "watch-plugin",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("E2E test build failed with errors");
            } else {
              console.log("E2E test build succeeded");
            }
          });
        },
      },
    ],
  });

  if (watch) {
    await extensionCtx.watch();
    await mcpServerCtx.watch();
    await testCtx.watch();
    await e2eTestCtx.watch();
    console.log("Watching for changes...");
  } else {
    await extensionCtx.rebuild();
    await mcpServerCtx.rebuild();
    await testCtx.rebuild();
    await e2eTestCtx.rebuild();
    await extensionCtx.dispose();
    await mcpServerCtx.dispose();
    await testCtx.dispose();
    await e2eTestCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
