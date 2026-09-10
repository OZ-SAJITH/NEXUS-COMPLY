import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getRepository } from "../storage/jsonRepo";
import { runAudit } from "./auditService";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_ROOT = join(__dirname, "../../../../samples");

const SEED_FILES = [
  "cisco/demo-secure.conf",
  "cisco/demo-insecure.conf",
  "fortinet/demo-secure.conf",
  "fortinet/demo-insecure.conf",
  "juniper/demo-secure.conf",
  "juniper/demo-insecure.conf",
  "unknown/custom-demo.conf",
];

/**
 * Seeds the repository with demo audits on first startup (empty database).
 * Each file is fully audited through the same pipeline the UI uses, so every
 * number on the dashboard is real.
 */
export async function seedIfEmpty(): Promise<void> {
  const repo = getRepository();
  const existing = await repo.allAudits();
  if (existing.length > 0) return;

  console.log("[nexus-api] seeding demo audits…");
  for (const file of SEED_FILES) {
    try {
      const content = await readFile(join(SAMPLES_ROOT, file), "utf-8");
      const result = await runAudit({ fileName: file, content });
      console.log(
        `[nexus-api] seeded ${file} → vendor=${result.audit.vendor} passed=${result.audit.compliance?.passed} failed=${result.audit.compliance?.failed}`
      );
    } catch (err) {
      console.error(`[nexus-api] failed to seed ${file}:`, err);
    }
  }
}