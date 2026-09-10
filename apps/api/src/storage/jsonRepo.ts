import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  ConfigurationRecord,
  AuditRecord,
  ApprovedMapping,
  UserRecord,
  FindingReviewRecord,
  AuditEventRecord,
  ComplianceFinalization,
} from "@nexus/shared-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, "../../../../data");

export interface DbShape {
  configurations: ConfigurationRecord[];
  audits: AuditRecord[];
  approvedMappings: ApprovedMapping[];
  users: UserRecord[];
  findingReviews: FindingReviewRecord[];
  auditEvents: AuditEventRecord[];
  finalizations: ComplianceFinalization[];
}

/**
 * Minimal JSON-file repository.
 * Deterministic, zero-infrastructure, ideal for a demo.
 * Swap this adapter for a PostgreSQL-backed implementation for production.
 */
export class JsonRepository {
  private file: string;
  private cache: DbShape | null = null;

  constructor(dataDir: string = process.env.DATA_DIR ?? DEFAULT_DATA_DIR) {
    this.file = join(dataDir, "db.json");
  }

  private async load(): Promise<DbShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      this.cache = {
        configurations: parsed.configurations ?? [],
        audits: parsed.audits ?? [],
        approvedMappings: parsed.approvedMappings ?? [],
        users: parsed.users ?? [],
        findingReviews: parsed.findingReviews ?? [],
        auditEvents: parsed.auditEvents ?? [],
        finalizations: parsed.finalizations ?? [],
      };
    } catch {
      this.cache = { configurations: [], audits: [], approvedMappings: [], users: [], findingReviews: [], auditEvents: [], finalizations: [] };
    }
    return this.cache;
  }

  private async save(db: DbShape): Promise<void> {
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(db, null, 2), "utf-8");
  }

  async flush(): Promise<void> {
    if (this.cache) await this.save(this.cache);
  }

  // ---- Configurations ----
  async allConfigurations(): Promise<ConfigurationRecord[]> {
    const db = await this.load();
    return db.configurations;
  }

  async getConfiguration(id: string): Promise<ConfigurationRecord | undefined> {
    const db = await this.load();
    return db.configurations.find((c) => c.id === id);
  }

  async saveConfiguration(config: ConfigurationRecord): Promise<ConfigurationRecord> {
    const db = await this.load();
    const idx = db.configurations.findIndex((c) => c.id === config.id);
    if (idx >= 0) db.configurations[idx] = config;
    else db.configurations.unshift(config);
    await this.save(db);
    return config;
  }

  // ---- Audits ----
  async allAudits(): Promise<AuditRecord[]> {
    const db = await this.load();
    return db.audits;
  }

  async getAudit(id: string): Promise<AuditRecord | undefined> {
    const db = await this.load();
    return db.audits.find((a) => a.id === id);
  }

  async saveAudit(audit: AuditRecord): Promise<AuditRecord> {
    const db = await this.load();
    const idx = db.audits.findIndex((a) => a.id === audit.id);
    if (idx >= 0) db.audits[idx] = audit;
    else db.audits.unshift(audit);
    await this.save(db);
    return audit;
  }

  // ---- Approved mappings ----
  async allApprovedMappings(): Promise<ApprovedMapping[]> {
    const db = await this.load();
    return db.approvedMappings;
  }

  async getMappingByFingerprint(fingerprint: string): Promise<ApprovedMapping | undefined> {
    const db = await this.load();
    return db.approvedMappings.find((m) => m.syntaxFingerprint === fingerprint);
  }

  async saveMapping(mapping: ApprovedMapping): Promise<ApprovedMapping> {
    const db = await this.load();
    db.approvedMappings.unshift(mapping);
    await this.save(db);
    return mapping;
  }

  async deleteMapping(fingerprint: string): Promise<void> {
    const db = await this.load();
    db.approvedMappings = db.approvedMappings.filter((m) => m.syntaxFingerprint !== fingerprint);
    await this.save(db);
  }

  async reset(): Promise<void> {
    this.cache = { configurations: [], audits: [], approvedMappings: [], users: [], findingReviews: [], auditEvents: [], finalizations: [] };
    await this.save(this.cache);
  }

  // ---- Users ----
  async allUsers(): Promise<UserRecord[]> {
    const db = await this.load();
    return db.users;
  }

  async getUserByEmail(email: string): Promise<UserRecord | undefined> {
    const db = await this.load();
    return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async getUserById(id: string): Promise<UserRecord | undefined> {
    const db = await this.load();
    return db.users.find((u) => u.id === id);
  }

  async saveUser(user: UserRecord): Promise<UserRecord> {
    const db = await this.load();
    const idx = db.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) db.users[idx] = user;
    else db.users.push(user);
    await this.save(db);
    return user;
  }

  // ---- Finding reviews ----
  async allFindingReviews(): Promise<FindingReviewRecord[]> {
    const db = await this.load();
    return db.findingReviews;
  }

  async getFindingReview(findingId: string): Promise<FindingReviewRecord | undefined> {
    const db = await this.load();
    return db.findingReviews.find((r) => r.findingId === findingId);
  }

  async getFindingReviewsForAudit(auditId: string): Promise<FindingReviewRecord[]> {
    const db = await this.load();
    return db.findingReviews.filter((r) => r.auditId === auditId);
  }

  async saveFindingReview(review: FindingReviewRecord): Promise<FindingReviewRecord> {
    const db = await this.load();
    const idx = db.findingReviews.findIndex((r) => r.findingId === review.findingId);
    if (idx >= 0) db.findingReviews[idx] = review;
    else db.findingReviews.push(review);
    await this.save(db);
    return review;
  }

  async hasFindingReview(findingId: string): Promise<boolean> {
    const db = await this.load();
    return db.findingReviews.some((r) => r.findingId === findingId);
  }

  async removeFindingReview(findingId: string): Promise<void> {
    const db = await this.load();
    db.findingReviews = db.findingReviews.filter((r) => r.findingId !== findingId);
    await this.save(db);
  }

  // ---- Audit events (append-only) ----
  async allAuditEvents(): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents;
  }

  async auditEventsForFinding(findingId: string): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents
      .filter((e) => e.findingId === findingId || e.entityType === "audit")
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async auditEventsForAudit(auditId: string): Promise<AuditEventRecord[]> {
    const db = await this.load();
    return db.auditEvents.filter((e) => e.auditId === auditId).sort((a, b) => a.at.localeCompare(b.at));
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord> {
    const db = await this.load();
    db.auditEvents.push(event);
    await this.save(db);
    return event;
  }

  // ---- Finalizations ----
  async allFinalizations(): Promise<ComplianceFinalization[]> {
    const db = await this.load();
    return db.finalizations;
  }

  async getFinalization(auditId: string): Promise<ComplianceFinalization | undefined> {
    const db = await this.load();
    return db.finalizations.find((f) => f.auditId === auditId);
  }

  async saveFinalization(finalization: ComplianceFinalization): Promise<ComplianceFinalization> {
    const db = await this.load();
    const idx = db.finalizations.findIndex((f) => f.auditId === finalization.auditId);
    if (idx >= 0) db.finalizations[idx] = finalization;
    else db.finalizations.push(finalization);
    await this.save(db);
    return finalization;
  }
}

let _instance: JsonRepository | null = null;

export function getRepository(): JsonRepository {
  if (!_instance) _instance = new JsonRepository();
  return _instance;
}
