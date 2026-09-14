import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getRepository } from "../storage/jsonRepo";
import { runAudit } from "./auditService";
import { ConnectorManager } from "./enterprise/connectorManager";
import { ensureAssets } from "./enterprise/assetService";
import { matureEstate, upgradeStoredEvidenceIntegrity } from "@nexus/enterprise-catalog";

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

/**
 * Seeds the enterprise catalog (connectors + discovered assets) on first
 * startup when the enterprise collections are empty. After the initial
 * discovery pass the estate is matured to SCANNABLE so the demo opens with a
 * live, active portfolio (metrics like "active assets" are meaningful).
 */
export async function seedEnterpriseIfEmpty(): Promise<void> {
  const repo = getRepository();
  const manager = new ConnectorManager(repo);
  await manager.ensureSeeded();
  await ensureAssets({ repo, manager });

  const assets = await repo.allAssets();
  const immature = assets.filter((a) => a.discoveryStatus === "DISCOVERED");
  if (immature.length > 0) {
    const byId = new Map(assets.map((a) => [a.id, a]));
    for (const a of matureEstate(immature)) byId.set(a.id, a);
    await repo.saveAssets([...byId.values()]);
    console.log(`[nexus-api] matured ${immature.length} asset(s) to SCANNABLE for the portfolio view`);
  }

  // Upgrade legacy stored evidence whose integrity hash predates the PHASE 2
  // normalization engine (SHA-256 over the canonical payload). Idempotent.
  const stored = await repo.allEvidence();
  const { records, upgraded } = upgradeStoredEvidenceIntegrity(stored);
  if (upgraded > 0) {
    await repo.saveEvidenceBatch(records);
    console.log(`[nexus-api] re-derived SHA-256 integrity for ${upgraded} stored evidence record(s)`);
  }

  console.log("[nexus-api] enterprise catalog seeded (connectors + assets)");
}