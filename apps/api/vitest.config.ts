import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nexus/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      "@nexus/security-intent": path.resolve(__dirname, "../../packages/security-intent/src/index.ts"),
      "@nexus/compliance-rules": path.resolve(__dirname, "../../packages/compliance-rules/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    env: {
      DATA_DIR: process.env.TEMP ? `${process.env.TEMP}\\nexus-test-data` : "data-test",
    },
  },
});