/**
 * One-command dev runner: launches API, (optional) AI service, and Web
 * together. Works on Windows, macOS, and Linux.
 *
 *   npm run start-all   # API :4000 + AI :8000 (if available) + Web :5173
 *   npm run demo        # reset demo DB, then start everything
 *
 * Stops all children on Ctrl+C.
 */
import { spawn } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");

const RESET = process.argv.includes("--reset") || process.env.NEXUS_DEMO === "1";

if (RESET) {
  rmSync(join(dataDir, "db.json"), { force: true });
  console.log("[nexus] demo DB reset — will reseed on API start");
}

const children = [];

function start(label, okIfMissing) {
  const child = spawn("npm", ["run", "dev", "--workspace=" + label], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.on("spawn", () => console.log(`[nexus] started ${label}`));
  child.on("error", (err) => {
    if (!okIfMissing) console.error(`[nexus] failed to start ${label}: ${err.message}`);
    else console.log(`[nexus] ${label} not started (${err.code || "unavailable"})`);
  });
  const prefix = `[${label}] `;
  const tag = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => console.log(prefix + line));
  child.stdout.on("data", tag);
  child.stderr.on("data", tag);
  children.push(child);
}

start("apps/api", false);
start("apps/ai-service", true);
start("apps/web", false);

function shutdown() {
  console.log("\n[nexus] shutting down…");
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 800);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Guard against immediate child exit (e.g., missing FastAPI deps) so web/api logs stay readable.
setTimeout(() => {
  for (const c of children) {
    if (c.exitCode !== null) {
      console.log(`[nexus] ${c.spawnargs?.join(" ") || "child"} exited early (code ${c.exitCode})`);
    }
  }
}, 4000).unref();