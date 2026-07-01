import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // All test files hit the same live server + shared in-memory rate
    // limiter, so run them one at a time rather than racing.
    fileParallelism: false,
  },
});
