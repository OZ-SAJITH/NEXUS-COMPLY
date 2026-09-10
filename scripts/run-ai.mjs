/**
 * Cross-platform Python launcher for the FastAPI AI service.
 * Uses the `py` launcher on Windows when `python` is not on PATH.
 *
 *   node scripts/run-ai.mjs dev   # uvicorn --reload
 *   node scripts/run-ai.mjs start # plain uvicorn
 */
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const aiDir = join(__dirname, "..", "apps", "ai-service");
const mode = process.argv[2] === "start" ? "start" : "dev";
const reload = mode === "dev" ? ["--reload"] : [];

function launch(pythonCmd) {
  const child = spawn(pythonCmd, ["-m", "uvicorn", "app.main:app", ...reload, "--port", "8000"], {
    cwd: aiDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("error", (err) => {
    console.error(`[nexus-ai] failed to launch '${pythonCmd}': ${err.message}`);
    if (pythonCmd === "py") launch("python");
    else process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (process.platform === "win32") launch("py");
else launch("python");