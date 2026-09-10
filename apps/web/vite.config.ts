import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const isGhPages = process.env.GH_PAGES === "true";
const base = isGhPages ? "/NEXUS-COMPLY/" : "/";

const distDir = fileURLToPath(new URL("dist/", import.meta.url));

function pages404(): Plugin {
  return {
    name: "pages-404-shell",
    apply: "build",
    closeBundle() {
      const html = path.join(distDir, "index.html");
      if (fs.existsSync(html)) {
        fs.copyFileSync(html, path.join(distDir, "404.html"));
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), pages404()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@nexus/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});