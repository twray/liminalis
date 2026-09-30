import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts so benchmarks never run as part of `npm test`
// -- they are slow by construction, and a benchmark that fails a CI run
// because a machine was busy is worse than no benchmark.
//
// Run with: npm run bench
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["benchmarks/**/*.bench.ts"],
    // One measurement at a time: concurrent workers competing for cores is the
    // fastest way to produce numbers that cannot be compared between runs.
    fileParallelism: false,
    testTimeout: 300_000,
  },
});
