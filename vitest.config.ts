import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 12, // Use 12 forks (leave 4 cores for system/main process)
        execArgv: ['--max-old-space-size=8192', '--expose-gc'],
      },
    },
    include: ["src/**/*.test.ts"],
    exclude: [
      "src/**/*.e2e.test.ts",
      "node_modules/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/types.ts"],
    },
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NODE_ENV: "test",
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      vscode: new URL("./src/__mocks__/vscode.ts", import.meta.url).pathname,
    },
  },
});
