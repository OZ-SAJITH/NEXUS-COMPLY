import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@nexus/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      "@nexus/enterprise-catalog": path.resolve(__dirname, "../../packages/enterprise-catalog/src/index.ts"),
    },
  },
  define: {
    "import.meta.env.VITE_DEMO_MODE": JSON.stringify("true"),
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});